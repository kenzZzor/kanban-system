import { NextResponse } from "next/server";
import { z } from "zod";

import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z
    .string()
    .min(
      8,
      "Password must be at least 8 characters and include an uppercase Latin letter and a digit.",
    )
    .max(128, "New password must be 128 characters or fewer.")
    .regex(
      /[A-Z]/,
      "Password must include at least one uppercase Latin letter (A-Z).",
    )
    .regex(/[0-9]/, "Password must include at least one digit (0-9)."),
});

export const POST = apiHandler(async (request: Request) => {
  const currentUser = await requireUser({
    allowPasswordChangeRequired: true,
  });

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const data = changePasswordSchema.parse(body);

  const user = await prisma.user.findUnique({
    where: {
      id: currentUser.id,
    },
    select: {
      id: true,
      passwordHash: true,
      passwordMustChange: true,
      temporaryPasswordExpiresAt: true,
      isActive: true,
    },
  });

  if (!user?.isActive) {
    throw new UnauthorizedError();
  }

  if (!user.passwordMustChange) {
    throw new ConflictError("Password change is not required.");
  }

  if (
    user.temporaryPasswordExpiresAt === null ||
    user.temporaryPasswordExpiresAt <= new Date()
  ) {
    throw new UnauthorizedError(
      "Temporary password has expired. Contact your administrator.",
    );
  }

  const currentPasswordMatches = await verifyPassword(
    data.currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordMatches) {
    throw new UnauthorizedError("Current password is invalid.");
  }

  const reusesTemporaryPassword = await verifyPassword(
    data.newPassword,
    user.passwordHash,
  );

  if (reusesTemporaryPassword) {
    throw new ValidationError("New password must differ from the temporary password.");
  }

  const newPasswordHash = await hashPassword(data.newPassword);

  const changedAt = new Date();
  const updateResult = await prisma.user.updateMany({
    where: {
      id: user.id,
      isActive: true,
      passwordMustChange: true,
      temporaryPasswordExpiresAt: {
        gt: changedAt,
      },
      passwordHash: user.passwordHash,
    },
    data: {
      passwordHash: newPasswordHash,
      passwordMustChange: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: changedAt,
    },
  });

  if (updateResult.count !== 1) {
    throw new UnauthorizedError(
      "Temporary password has expired. Contact your administrator.",
    );
  }

  return NextResponse.json({
    message: "Password changed successfully",
  });
});
