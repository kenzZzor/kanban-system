export const DEPARTMENT_ROLES = [
  { code: "DEPARTMENT_ADMIN", name: "Администратор департамента" },
  { code: "MANAGER", name: "Менеджер" },
  { code: "EMPLOYEE", name: "Сотрудник" },
  { code: "VIEWER", name: "Наблюдатель" },
] as const;

export type DepartmentRoleCode = (typeof DEPARTMENT_ROLES)[number]["code"];

export function getRoleName(code: string) {
  return DEPARTMENT_ROLES.find((r) => r.code === code)?.name || code;
}
