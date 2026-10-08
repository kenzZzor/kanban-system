import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity } from "@/lib/activity/service";
import { ForbiddenError, ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import { prisma } from "@/lib/db";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";

const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Department name is required.")
    .max(200, "Department name must be 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(1000, "Department description must be 1000 characters or fewer.")
    .optional(),
});

export const GET = apiHandler(async () => {
  const currentUser = await requireUser();

  const isSystemAdmin = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.DEPARTMENTS_READ,
  );

  if (isSystemAdmin) {
    const departments = await prisma.department.findMany({
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdById: true,
        managerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      departments,
    });
  }

  const departments = await prisma.department.findMany({
    where: {
      members: {
        some: {
          userId: currentUser.id,
          leftAt: null,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdById: true,
      managerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    departments,
  });
});

export const POST = apiHandler(async (request: Request) => {
  const currentUser = await requireUser();

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.DEPARTMENTS_MANAGE,
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

  const data = createDepartmentSchema.parse(body);

  const department = await prisma.$transaction(async (tx) => {
    const createdDepartment = await tx.department.create({
      data: {
        name: data.name,
        description: data.description || null,
        createdById: currentUser.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdById: true,
        managerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logActivity({
      type: "DEPARTMENT_CREATED",
      actorId: currentUser.id,
      entityType: "Department",
      entityId: createdDepartment.id,
      description: `Department ${createdDepartment.name} was created.`,
      departmentId: createdDepartment.id,
      metadata: {
        departmentId: createdDepartment.id,
        name: createdDepartment.name,
      },
      tx,
    });

    return createdDepartment;
  });

  return NextResponse.json(
    {
      department,
    },
    { status: 201 },
  );
});
