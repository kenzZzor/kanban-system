import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";

import { ConflictError, ForbiddenError, ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import { prisma } from "@/lib/db";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";
import { updateDepartmentMember } from "@/lib/services/department-members";

interface RouteContext {
  params: Promise<{
    departmentId: string;
    memberId: string;
  }>;
}

const updateMemberSchema = z
  .object({
    roleCode: z
      .enum([
        "DEPARTMENT_ADMIN",
        "MANAGER",
        "EMPLOYEE",
        "VIEWER",
      ])
      .optional(),
    managerId: z.string().trim().min(1).nullable().optional(),
  })
  .refine(
    (data) =>
      data.roleCode !== undefined || data.managerId !== undefined,
    {
      message: "At least one field is required.",
    },
  );

export const PATCH = apiHandler(async (
  request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { departmentId, memberId } = await params;

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

  const data = updateMemberSchema.parse(body);

  try {
    const member = await prisma.$transaction(
      async (tx) =>
        updateDepartmentMember({
          tx,
          actorId: currentUser.id,
          departmentId,
          memberId,
          roleCode: data.roleCode,
          managerId: data.managerId,
        }),
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json({ member });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new ConflictError("Concurrent update, retry.");
    }

    throw error;
  }
});
