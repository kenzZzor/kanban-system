import { NextResponse } from "next/server";

import { apiHandler, requireUser } from "@/lib/api/handler";

export const GET = apiHandler(async () => {
  const user = await requireUser({ allowPasswordChangeRequired: true });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      isActive: user.isActive,
      passwordMustChange: user.passwordMustChange,
      temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
      systemRoleId: user.systemRoleId,
    },
  });
});
