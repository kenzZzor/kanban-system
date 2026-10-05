export interface PermissionPolicyInput {
  isActive: boolean;
  isSystemAdmin: boolean;
  hasDepartmentPermission: boolean;
}

export function canUsePermission({
  isActive,
  isSystemAdmin,
  hasDepartmentPermission,
}: PermissionPolicyInput): boolean {
  if (!isActive) {
    return false;
  }

  if (isSystemAdmin) {
    return true;
  }

  return hasDepartmentPermission;
}
