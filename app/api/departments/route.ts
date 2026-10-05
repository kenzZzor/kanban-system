import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
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

export async function GET() {
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
}

export async function POST(request: Request) {
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

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.DEPARTMENTS_MANAGE,
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
          code: "BAD_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const result = createDepartmentSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid request data.",
          details: result.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const department = await prisma.department.create({
    data: {
      name: result.data.name,
      description: result.data.description || null,
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

  return NextResponse.json(
    {
      department,
    },
    { status: 201 },
  );
}
