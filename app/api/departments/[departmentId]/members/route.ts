import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";

import { logActivity } from "@/lib/activity/service";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import { prisma } from "@/lib/db";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";

interface RouteContext {
  params: Promise<{
    departmentId: string;
  }>;
}

export const GET = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();

  const { departmentId } = await params;

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.MEMBERS_READ,
    departmentId,
  );

  if (!allowed) {
    throw new ForbiddenError();
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });

  if (!department) {
    throw new NotFoundError("Department not found.");
  }

  const members = await prisma.departmentMember.findMany({
    where: {
      departmentId,
      leftAt: null,
    },
    orderBy: { joinedAt: "asc" },
    select: {
      id: true,
      joinedAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
          isActive: true,
        },
      },
      role: {
        select: {
          code: true,
          name: true,
          description: true,
        },
      },
      manager: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ members });
});


const createMemberSchema = z.object({
  userId: z.string().trim().min(1),
  roleCode: z.enum([
    "DEPARTMENT_ADMIN",
    "MANAGER",
    "EMPLOYEE",
    "VIEWER",
  ]),
  managerId: z.string().trim().min(1).optional(),
});

export const POST = apiHandler(async (
  request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();

  const { departmentId } = await params;

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.MEMBERS_MANAGE,
    departmentId,
  );

  if (!allowed) {
    throw new ForbiddenError();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const { userId, roleCode, managerId } = createMemberSchema.parse(body);

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });

  if (!department) {
    throw new NotFoundError("Department not found.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  if (!user.isActive) {
    throw new ValidationError("Cannot add an inactive user to a department.");
  }

  const existingMember = await prisma.departmentMember.findFirst({
    where: {
      departmentId,
      userId,
      leftAt: null,
    },
    select: { id: true },
  });

  if (existingMember) {
    throw new ConflictError("User is already a member of this department.");
  }

  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    select: {
      id: true,
      code: true,
    },
  });

  if (!role) {
    throw new ValidationError("Department role not found.");
  }

  if (roleCode === "DEPARTMENT_ADMIN") {
    const isSystemAdmin = await hasPermission(
      currentUser.id,
      PERMISSION_CODES.USERS_MANAGE,
    );

    if (!isSystemAdmin) {
      throw new ForbiddenError("You cannot assign the DEPARTMENT_ADMIN role.");
    }
  }

  if (managerId) {
    const manager = await prisma.departmentMember.findFirst({
      where: {
        id: managerId,
        departmentId,
        leftAt: null,
      },
      select: {
        id: true,
        user: {
          select: {
            isActive: true,
          },
        },
      },
    });

    if (!manager) {
      throw new ValidationError("Manager must belong to the same department.");
    }

    if (!manager.user.isActive) {
      throw new ValidationError("Manager must be active.");
    }
  }

  let member;

  try {
    member = await prisma.$transaction(async (tx) => {
      const createdMember = await tx.departmentMember.create({
        data: {
          departmentId,
          userId,
          roleId: role.id,
          managerId: managerId ?? null,
        },
        select: {
          id: true,
          joinedAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              middleName: true,
              isActive: true,
            },
          },
          role: {
            select: {
              code: true,
              name: true,
              description: true,
            },
          },
          manager: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  middleName: true,
                },
              },
            },
          },
        },
      });

      await logActivity({
        type: "MEMBER_ADDED",
        actorId: currentUser.id,
        entityType: "DepartmentMember",
        entityId: createdMember.id,
        description: `User ${userId} was added to department ${departmentId}.`,
        departmentId,
        metadata: {
          departmentId,
          userId,
          roleCode,
          managerId: managerId ?? null,
        },
        tx,
      });

      return createdMember;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError("User is already a member of this department.");
    }

    throw error;
  }

  return NextResponse.json(
    { member },
    { status: 201 },
  );
});
