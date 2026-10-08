import { prisma } from "@/lib/db";
import { canUsePermission } from "@/lib/permissions/policy";
import type { PermissionCode } from "@/lib/permissions/codes";

export async function hasPermission(
  userId: string,
  permission: PermissionCode,
  departmentId?: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      isActive: true,
      systemRole: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user) {
    return false;
  }

  const isSystemAdmin = user.systemRole?.code === "SYSTEM_ADMIN";

  if (isSystemAdmin) {
    return canUsePermission({
      isActive: user.isActive,
      isSystemAdmin: true,
      hasDepartmentPermission: false,
    });
  }

  if (!departmentId) {
    return false;
  }

  const membership = await prisma.departmentMember.findFirst({
    where: {
      departmentId,
      userId,
      leftAt: null,
    },
    select: {
      role: {
        select: {
          permissions: {
            where: {
              permission: {
                code: permission,
              },
            },
            select: {
              permissionId: true,
            },
          },
        },
      },
    },
  });

  return canUsePermission({
    isActive: user.isActive,
    isSystemAdmin: false,
    hasDepartmentPermission:
      (membership?.role.permissions.length ?? 0) > 0,
  });
}
