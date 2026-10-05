import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions/service";
import { PERMISSION_CODES } from "@/lib/permissions/codes";

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

  const allowed = await hasPermission(
    currentUser.id,
    PERMISSION_CODES.USERS_READ,
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
}
