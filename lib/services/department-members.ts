import type { Prisma, SystemRole } from "@/app/generated/prisma/client";

import { logActivity } from "@/lib/activity/service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";

export const departmentMemberSelect = {
  id: true,
  joinedAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
    },
  },
  role: {
    select: {
      code: true,
      name: true,
      description: true,
    },
  },
  manager: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
        },
      },
    },
  },
} satisfies Prisma.DepartmentMemberSelect;

interface UpdateDepartmentMemberParams {
  tx: Prisma.TransactionClient;
  actorId: string;
  departmentId: string;
  memberId: string;
  roleCode?: Exclude<SystemRole, "SYSTEM_ADMIN">;
  managerId?: string | null;
}

const MAX_MANAGER_DEPTH = 100;

async function isSystemAdmin(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const user = await tx.user.findUnique({
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

  return user?.isActive === true && user.systemRole?.code === "SYSTEM_ADMIN";
}

async function assertCanChangeDepartmentAdminRole({
  tx,
  actorId,
  oldRoleCode,
  newRoleCode,
}: {
  tx: Prisma.TransactionClient;
  actorId: string;
  oldRoleCode: SystemRole;
  newRoleCode: SystemRole;
}) {
  if (
    oldRoleCode !== "DEPARTMENT_ADMIN" &&
    newRoleCode !== "DEPARTMENT_ADMIN"
  ) {
    return;
  }

  if (!(await isSystemAdmin(tx, actorId))) {
    throw new ForbiddenError(
      "You cannot assign or remove the DEPARTMENT_ADMIN role.",
    );
  }
}

async function assertNoManagerCycle({
  tx,
  targetMemberId,
  managerId,
}: {
  tx: Prisma.TransactionClient;
  targetMemberId: string;
  managerId: string;
}) {
  let currentManagerId: string | null = managerId;
  let depth = 0;

  while (currentManagerId) {
    if (currentManagerId === targetMemberId) {
      throw new ConflictError("Manager hierarchy cycle detected.");
    }

    depth += 1;

    if (depth > MAX_MANAGER_DEPTH) {
      throw new ConflictError("Manager hierarchy cycle detected.");
    }

    const currentManager: { managerId: string | null } | null =
      await tx.departmentMember.findUnique({
        where: { id: currentManagerId },
        select: { managerId: true },
      });

    currentManagerId = currentManager?.managerId ?? null;
  }
}

export async function updateDepartmentMember({
  tx,
  actorId,
  departmentId,
  memberId,
  roleCode,
  managerId,
}: UpdateDepartmentMemberParams) {
  const targetMember = await tx.departmentMember.findFirst({
    where: {
      id: memberId,
      departmentId,
      leftAt: null,
    },
    select: {
      id: true,
      userId: true,
      managerId: true,
      role: {
        select: {
          id: true,
          code: true,
        },
      },
    },
  });

  if (!targetMember) {
    throw new NotFoundError("Department member not found.");
  }

  let nextRoleId: string | undefined;
  let nextRoleCode = targetMember.role.code;

  if (roleCode !== undefined) {
    const role = await tx.role.findUnique({
      where: {code: roleCode},
      select: {
        id: true,
        code: true,
      },
    });

    if (!role) {
      throw new ValidationError("Department role not found.");
    }

    nextRoleId = role.id;
    nextRoleCode = role.code;

    if (role.code !== targetMember.role.code) {
      await assertCanChangeDepartmentAdminRole({
        tx,
        actorId,
        oldRoleCode: targetMember.role.code,
        newRoleCode: role.code,
      });

      if (
          targetMember.userId === actorId &&
          !(await isSystemAdmin(tx, actorId))
      ) {
        throw new ForbiddenError("You cannot change your own role.");
      }

      if (
          targetMember.role.code === "DEPARTMENT_ADMIN" &&
          role.code !== "DEPARTMENT_ADMIN"
      ) {
        const activeDepartmentAdminCount = await tx.departmentMember.count({
          where: {
            departmentId,
            leftAt: null,
            role: {code: "DEPARTMENT_ADMIN"},
          },
        });

        if (activeDepartmentAdminCount <= 1) {
          throw new ConflictError(
              "Cannot demote the last active department admin.",
          );
        }
      }
    }
  }

  let nextManagerId: string | null | undefined = undefined;

  if (managerId !== undefined) {
    nextManagerId = managerId;

    if (managerId !== null) {
      if (managerId === targetMember.id) {
        throw new ConflictError("Member cannot be their own manager.");
      }

      const manager = await tx.departmentMember.findFirst({
        where: {
          id: managerId,
          departmentId,
          leftAt: null,
        },
        select: {
          id: true,
          user: {
            select: {
              isActive: true,
            },
          },
        },
      });

      if (!manager || !manager.user.isActive) {
        throw new ValidationError(
          "Manager must be an active member of the same department.",
        );
      }

      await assertNoManagerCycle({
        tx,
        targetMemberId: targetMember.id,
        managerId,
      });
    }
  }

  const roleChanged =
    roleCode !== undefined && nextRoleCode !== targetMember.role.code;
  const managerChanged =
    managerId !== undefined && nextManagerId !== targetMember.managerId;

  if (!roleChanged && !managerChanged) {
    return tx.departmentMember.findUniqueOrThrow({
      where: { id: targetMember.id },
      select: departmentMemberSelect,
    });
  }

  const member = await tx.departmentMember.update({
    where: { id: targetMember.id },
    data: {
      ...(roleChanged ? { roleId: nextRoleId } : {}),
      ...(managerChanged ? { managerId: nextManagerId } : {}),
    },
    select: departmentMemberSelect,
  });

  if (roleChanged) {
    await logActivity({
      type: "ROLE_CHANGED",
      actorId,
      entityType: "DepartmentMember",
      entityId: member.id,
      description: `Department member ${member.id} role changed.`,
      departmentId,
      metadata: {
        memberId: member.id,
        userId: targetMember.userId,
        old: targetMember.role.code,
        new: nextRoleCode,
      },
      tx,
    });
  }

  if (managerChanged) {
    await logActivity({
      type: "MANAGER_CHANGED",
      actorId,
      entityType: "DepartmentMember",
      entityId: member.id,
      description: `Department member ${member.id} manager changed.`,
      departmentId,
      metadata: {
        memberId: member.id,
        userId: targetMember.userId,
        old: targetMember.managerId,
        new: nextManagerId,
      },
      tx,
    });
  }

  return member;
}

interface RemoveDepartmentMemberParams {
  tx: Prisma.TransactionClient;
  actorId: string;
  departmentId: string;
  memberId: string;
}

export async function removeDepartmentMember({
  tx,
  actorId,
  departmentId,
  memberId,
}: RemoveDepartmentMemberParams) {
  const targetMember = await tx.departmentMember.findFirst({
    where: {
      id: memberId,
      departmentId,
      leftAt: null,
    },
    select: {
      id: true,
      userId: true,
      managerId: true,
      role: {
        select: { code: true },
      },
    },
  });

  if (!targetMember) {
    throw new NotFoundError("Department member not found.");
  }

  if (targetMember.role.code === "DEPARTMENT_ADMIN") {
    const activeDepartmentAdminCount = await tx.departmentMember.count({
      where: {
        departmentId,
        leftAt: null,
        role: { code: "DEPARTMENT_ADMIN" },
      },
    });

    if (activeDepartmentAdminCount <= 1) {
      throw new ConflictError(
        "Cannot remove the last active department admin.",
      );
    }
  }

  const activeSubordinateCount = await tx.departmentMember.count({
    where: {
      departmentId,
      managerId: targetMember.id,
      leftAt: null,
    },
  });

  if (activeSubordinateCount > 0) {
    throw new ConflictError(
      "Reassign or clear active subordinates before removing this member.",
    );
  }

  const removedAt = new Date();
  const member = await tx.departmentMember.update({
    where: { id: targetMember.id },
    data: {
      leftAt: removedAt,
      managerId: null,
    },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      leftAt: true,
    },
  });

  await logActivity({
    type: "MEMBER_REMOVED",
    actorId,
    entityType: "DepartmentMember",
    entityId: member.id,
    description: `User ${member.userId} was removed from department ${departmentId}.`,
    departmentId,
    metadata: {
      departmentId,
      memberId: member.id,
      userId: member.userId,
      previousRoleCode: targetMember.role.code,
      removedAt: removedAt.toISOString(),
    },
    tx,
  });

  return member;
}
