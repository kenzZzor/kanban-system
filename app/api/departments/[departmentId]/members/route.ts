import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/activity/service";

import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";

interface RouteContext {
  params: Promise<{
    departmentId: string;
  }>;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      },
      { status: 401 },
    );
  }

  const { departmentId } = await params;

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.MEMBERS_READ,
    departmentId,
  );

  if (!allowed) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        },
      },
      { status: 403 },
    );
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });

  if (!department) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Department not found.",
        },
      },
      { status: 404 },
    );
  }

  const members = await prisma.departmentMember.findMany({
    where: { departmentId },
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
}


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

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      },
      { status: 401 },
    );
  }

  const { departmentId } = await params;

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.MEMBERS_MANAGE,
    departmentId,
  );

  if (!allowed) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        },
      },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid JSON body.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = createMemberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body.",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const { userId, roleCode, managerId } = parsed.data;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });

  if (!department) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Department not found.",
        },
      },
      { status: 404 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "User not found.",
        },
      },
      { status: 404 },
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Cannot add an inactive user to a department.",
        },
      },
      { status: 400 },
    );
  }

  const existingMember = await prisma.departmentMember.findUnique({
    where: {
      departmentId_userId: {
        departmentId,
        userId,
      },
    },
    select: { id: true },
  });

  if (existingMember) {
    return NextResponse.json(
      {
        error: {
          code: "CONFLICT",
          message: "User is already a member of this department.",
        },
      },
      { status: 409 },
    );
  }

  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    select: {
      id: true,
      code: true,
    },
  });

  if (!role) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Department role not found.",
        },
      },
      { status: 400 },
    );
  }

  if (roleCode === "DEPARTMENT_ADMIN") {
    const isSystemAdmin = await hasPermission(
      currentUser.id,
      PERMISSION_CODES.USERS_MANAGE,
    );

    if (!isSystemAdmin) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "You cannot assign the DEPARTMENT_ADMIN role.",
          },
        },
        { status: 403 },
      );
    }
  }

  if (managerId) {
    const manager = await prisma.departmentMember.findFirst({
      where: {
        id: managerId,
        departmentId,
      },
      select: {
        id: true,
      },
    });

    if (!manager) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Manager must belong to the same department.",
          },
        },
        { status: 400 },
      );
    }
  }

  const member = await prisma.departmentMember.create({
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
  entityId: member.id,
  description: `User ${userId} was added to department ${departmentId}.`,
  metadata: {
    departmentId,
    userId,
    roleCode,
    managerId: managerId ?? null,
  },
});

  return NextResponse.json(
    { member },
    { status: 201 },
  );
}
