import assert from "node:assert/strict";

import { canUsePermission } from "../lib/permissions/policy";

assert.equal(
  canUsePermission({
    isActive: false,
    isSystemAdmin: true,
    hasDepartmentPermission: true,
  }),
  false,
);

assert.equal(
  canUsePermission({
    isActive: true,
    isSystemAdmin: true,
    hasDepartmentPermission: false,
  }),
  true,
);

assert.equal(
  canUsePermission({
    isActive: true,
    isSystemAdmin: false,
    hasDepartmentPermission: true,
  }),
  true,
);

assert.equal(
  canUsePermission({
    isActive: true,
    isSystemAdmin: false,
    hasDepartmentPermission: false,
  }),
  false,
);

console.log("RBAC permission policy unit tests passed.");
