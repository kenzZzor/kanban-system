import { NextResponse } from "next/server";

import { ForbiddenError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions/service";
import { PERMISSION_CODES } from "@/lib/permissions/codes";

export const GET = apiHandler(async () => {
  const currentUser = await requireUser();

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.USERS_READ,
  );

  if (!allowed) {
    throw new ForbiddenError();
  }

  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
      createdAt: true,
      systemRole: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    users,
  });
});
