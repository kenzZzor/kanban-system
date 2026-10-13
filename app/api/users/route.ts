import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { z } from "zod";

import { ConflictError, ForbiddenError, ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import { hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity/service";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions/service";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { generateTemporaryPassword } from "@/lib/services/users";

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required."),
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100, "First name must be 100 characters or fewer."),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(100, "Last name must be 100 characters or fewer."),
  middleName: z
    .string()
    .trim()
    .max(100, "Middle name must be 100 characters or fewer.")
    .optional()
    .nullable(),
});

const TEMPORARY_PASSWORD_TTL_MS = 1000 * 60 * 60 * 24;

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

export const POST = apiHandler(async (request: Request) => {
  const currentUser = await requireUser();

  const actor = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      isActive: true,
      systemRole: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!actor?.isActive || actor.systemRole?.code !== "SYSTEM_ADMIN") {
    throw new ForbiddenError();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const data = createUserSchema.parse(body);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const temporaryPasswordExpiresAt = new Date(
    Date.now() + TEMPORARY_PASSWORD_TTL_MS,
  );

  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName || null,
          passwordHash,
          passwordMustChange: true,
          temporaryPasswordExpiresAt,
          passwordChangedAt: null,
          systemRoleId: null,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
          isActive: true,
          passwordMustChange: true,
          temporaryPasswordExpiresAt: true,
          passwordChangedAt: true,
          createdAt: true,
          systemRole: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      });

      await logActivity({
        type: "USER_ACCOUNT_CREATED",
        actorId: currentUser.id,
        entityType: "User",
        entityId: createdUser.id,
        description: `User account ${createdUser.email} was created.`,
        metadata: {
          userId: createdUser.id,
          email: createdUser.email,
        },
        tx,
      });

      return createdUser;
    });

    return NextResponse.json(
      {
        user,
        temporaryPassword,
        temporaryPasswordExpiresAt,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError("User with this email already exists.");
    }

    throw error;
  }
});
