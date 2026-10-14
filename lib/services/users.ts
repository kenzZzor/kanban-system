import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";

import { logActivity } from "@/lib/activity/service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SelfPasswordResetNotAllowedError,
} from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import { deleteSessionsForUser } from "@/lib/auth/session";

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

const TEMPORARY_PASSWORD_TTL_MS = 1000 * 60 * 60 * 24;
const SYSTEM_ADMIN_DEACTIVATION_LOCK_CLASS_ID = 872341;
const SYSTEM_ADMIN_DEACTIVATION_LOCK_OBJECT_ID = 1;
const ADVISORY_LOCK_ATTEMPTS = 200;
const ADVISORY_LOCK_RETRY_DELAY_MS = 10;

export const userManagementSelect = {
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
  updatedAt: true,
  systemRole: {
    select: {
      code: true,
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserManagementSelect = typeof userManagementSelect;

interface ManagedUserLifecycleParams {
  tx: Prisma.TransactionClient;
  actorId: string;
  userId: string;
}

interface ResetPasswordResult {
  user: Prisma.UserGetPayload<{ select: UserManagementSelect }>;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: Date;
}

type AdminStatusSelect = {
  isActive: boolean;
  systemRole: {
    code: string;
  } | null;
};

async function assertActiveSystemAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
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
}

async function acquireSystemAdminDeactivationLock(
  tx: Prisma.TransactionClient,
) {
  for (let attempt = 0; attempt < ADVISORY_LOCK_ATTEMPTS; attempt += 1) {
    const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(
        ${SYSTEM_ADMIN_DEACTIVATION_LOCK_CLASS_ID},
        ${SYSTEM_ADMIN_DEACTIVATION_LOCK_OBJECT_ID}
      ) AS acquired
    `;

    if (rows[0]?.acquired) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, ADVISORY_LOCK_RETRY_DELAY_MS);
    });
  }

  throw new ConflictError(
    "System administrator update is busy. Refresh and try again.",
  );
}

async function getUserAdminStatus(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<AdminStatusSelect | null> {
  return tx.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      systemRole: {
        select: {
          code: true,
        },
      },
    },
  });
}

export async function deactivateUserAccount({
  tx,
  actorId,
  userId,
}: ManagedUserLifecycleParams) {
  await assertActiveSystemAdmin(tx, actorId);

  if (actorId === userId) {
    throw new ConflictError("You cannot deactivate your own account.");
  }

  const targetUser = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      systemRole: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!targetUser) {
    throw new NotFoundError("User account not found.");
  }

  if (!targetUser.isActive) {
    throw new ConflictError("User account is already inactive.");
  }

  if (targetUser.systemRole?.code === "SYSTEM_ADMIN") {
    await acquireSystemAdminDeactivationLock(tx);
    await assertActiveSystemAdmin(tx, actorId);

    const lockedTargetUser = await getUserAdminStatus(tx, userId);
    if (!lockedTargetUser) {
      throw new NotFoundError("User account not found.");
    }

    if (!lockedTargetUser.isActive) {
      throw new ConflictError("User account is already inactive.");
    }

    if (lockedTargetUser.systemRole?.code !== "SYSTEM_ADMIN") {
      throw new ConflictError(
        "User role changed concurrently. Refresh and try again.",
      );
    }

    const activeSystemAdminCount = await tx.user.count({
      where: {
        isActive: true,
        systemRole: {
          code: "SYSTEM_ADMIN",
        },
      },
    });

    if (activeSystemAdminCount <= 1) {
      throw new ConflictError(
        "Cannot deactivate the last active system administrator.",
      );
    }
  }

  const user = await tx.user.update({
    where: {
      id: targetUser.id,
    },
    data: {
      isActive: false,
    },
    select: userManagementSelect,
  });

  await deleteSessionsForUser(user.id, tx);

  await logActivity({
    type: "USER_ACCOUNT_DEACTIVATED",
    actorId,
    entityType: "User",
    entityId: user.id,
    description: `User account ${user.email} was deactivated.`,
    metadata: {
      userId: user.id,
      email: user.email,
    },
    tx,
  });

  return user;
}

export async function reactivateUserAccount({
  tx,
  actorId,
  userId,
}: ManagedUserLifecycleParams) {
  await assertActiveSystemAdmin(tx, actorId);

  const targetUser = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isActive: true,
    },
  });

  if (!targetUser) {
    throw new NotFoundError("User account not found.");
  }

  if (targetUser.isActive) {
    throw new ConflictError("User account is already active.");
  }

  const user = await tx.user.update({
    where: {
      id: targetUser.id,
    },
    data: {
      isActive: true,
    },
    select: userManagementSelect,
  });

  await logActivity({
    type: "USER_ACCOUNT_REACTIVATED",
    actorId,
    entityType: "User",
    entityId: user.id,
    description: `User account ${user.email} was reactivated.`,
    metadata: {
      userId: user.id,
      email: user.email,
    },
    tx,
  });

  return user;
}

export async function resetUserPassword({
  tx,
  actorId,
  userId,
}: ManagedUserLifecycleParams): Promise<ResetPasswordResult> {
  await assertActiveSystemAdmin(tx, actorId);

  if (actorId === userId) {
    throw new SelfPasswordResetNotAllowedError(
      "You cannot reset your own password from the administrative panel.",
    );
  }

  const targetUser = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!targetUser) {
    throw new NotFoundError("User account not found.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const temporaryPasswordExpiresAt = new Date(
    Date.now() + TEMPORARY_PASSWORD_TTL_MS,
  );

  const user = await tx.user.update({
    where: {
      id: targetUser.id,
    },
    data: {
      passwordHash,
      passwordMustChange: true,
      temporaryPasswordExpiresAt,
      passwordChangedAt: null,
    },
    select: userManagementSelect,
  });

  await deleteSessionsForUser(user.id, tx);

  await logActivity({
    type: "USER_PASSWORD_RESET",
    actorId,
    entityType: "User",
    entityId: user.id,
    description: `User account ${user.email} password was reset.`,
    metadata: {
      userId: user.id,
      email: user.email,
    },
    tx,
  });

  return {
    user,
    temporaryPassword,
    temporaryPasswordExpiresAt,
  };
}
