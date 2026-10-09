
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  isRetryableTransactionConflict,
  runSerializableTransaction,
} from "@/lib/db-transaction";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";
import {
  removeDepartmentMember,
  updateDepartmentMember,
} from "@/lib/services/department-members";

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
    const member = await runSerializableTransaction((tx) =>
      updateDepartmentMember({
        tx,
        actorId: currentUser.id,
        departmentId,
        memberId,
        roleCode: data.roleCode,
        managerId: data.managerId,
      }),
    );

    return NextResponse.json({ member });
  } catch (error) {
    if (isRetryableTransactionConflict(error)) {
      throw new ConflictError(
        "Department member data changed concurrently. Refresh and try again.",
      );
    }

    throw error;
  }
});

export const DELETE = apiHandler(async (
  _request: Request,
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

  try {
    const member = await runSerializableTransaction((tx) =>
      removeDepartmentMember({
        tx,
        actorId: currentUser.id,
        departmentId,
        memberId,
      }),
    );

    return NextResponse.json({ member });
  } catch (error) {
    if (isRetryableTransactionConflict(error)) {
      throw new ConflictError(
        "Department member data changed concurrently. Refresh and try again.",
      );
    }

    throw error;
  }
});