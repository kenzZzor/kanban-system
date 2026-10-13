import { NextResponse } from "next/server";
import { ForbiddenError, NotFoundError } from "@/lib/api/errors";
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
  { params }: RouteContext
) => {
  const currentUser = await requireUser();
  const { departmentId } = await params;

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.DEPARTMENTS_READ,
    departmentId
  );

  if (!allowed) {
    throw new ForbiddenError();
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
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

  if (!department) {
    throw new NotFoundError("Department not found.");
  }

  return NextResponse.json({ department });
});
