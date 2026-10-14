import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";

import { SESSION_COOKIE_NAME } from "../lib/auth/constants";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { createSession } from "../lib/auth/session";
import { prisma } from "../lib/db";

const BASE_URL = "http://localhost:3000";
const createdUserIds: string[] = [];
const createdDepartmentIds: string[] = [];

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const departmentAdmin = {
  email: "alice.admin@kanban.local",
  password: "DevOnly123!",
};

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}@kanban.local`;
}

async function login(
  request: APIRequestContext,
  credentials = systemAdmin,
) {
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    data: credentials,
  });

  expect(response.status()).toBe(200);
  return response;
}

async function createUser(
  request: APIRequestContext,
  email = uniqueEmail("created.user"),
) {
  await login(request);

  const before = Date.now();
  const response = await request.post(`${BASE_URL}/api/users`, {
    data: {
      email,
      firstName: "Created",
      lastName: "User",
      middleName: "Temporary",
    },
  });
  const after = Date.now();

  expect(response.status()).toBe(201);

  const body = await response.json();
  createdUserIds.push(body.user.id);

  return {
    before,
    after,
    body: body as {
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        middleName: string | null;
        isActive: boolean;
        passwordMustChange: boolean;
        temporaryPasswordExpiresAt: string;
        passwordChangedAt: string | null;
        systemRole: { code: string; name: string } | null;
      };
      temporaryPassword: string;
      temporaryPasswordExpiresAt: string;
    },
  };
}

async function createDirectUser({
  email = uniqueEmail("direct.user"),
  password = "DevOnly123!",
  isActive = true,
  systemRoleCode = null,
}: {
  email?: string;
  password?: string;
  isActive?: boolean;
  systemRoleCode?: "SYSTEM_ADMIN" | null;
} = {}) {
  const role = systemRoleCode
    ? await prisma.role.findUniqueOrThrow({
        where: { code: systemRoleCode },
        select: { id: true },
      })
    : null;

  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Direct",
      lastName: "User",
      passwordHash: await hashPassword(password),
      systemRoleId: role?.id ?? null,
      isActive,
      passwordMustChange: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
    },
  });
  createdUserIds.push(user.id);

  return {
    ...user,
    password,
  };
}

test.afterAll(async () => {
  await prisma.session.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.departmentMember.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        {
          entityType: "User",
          entityId: { in: createdUserIds },
        },
        {
          actorId: { in: createdUserIds },
        },
        {
          departmentId: { in: createdDepartmentIds },
        },
      ],
    },
  });
  await prisma.department.deleteMany({
    where: { id: { in: createdDepartmentIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: createdUserIds } },
  });
  await prisma.$disconnect();
});

test.describe("User lifecycle API", () => {
  test("rejects unauthenticated and non-system-admin account creation", async ({
    request,
  }) => {
    const unauthenticatedResponse = await request.post("/api/users", {
      data: {
        email: uniqueEmail("unauthorized"),
        firstName: "No",
        lastName: "Session",
      },
    });
    expect(unauthenticatedResponse.status()).toBe(401);

    await login(request, departmentAdmin);
    const forbiddenResponse = await request.post("/api/users", {
      data: {
        email: uniqueEmail("department.admin"),
        firstName: "Department",
        lastName: "Admin",
      },
    });
    expect(forbiddenResponse.status()).toBe(403);
  });

  test("rejects an inactive system administrator", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: "SYSTEM_ADMIN" },
      select: { id: true },
    });
    const inactiveAdmin = await prisma.user.create({
      data: {
        email: uniqueEmail("inactive.admin"),
        firstName: "Inactive",
        lastName: "Admin",
        passwordHash: await hashPassword("DevOnly123!"),
        systemRoleId: role.id,
        isActive: false,
      },
      select: { id: true },
    });
    createdUserIds.push(inactiveAdmin.id);

    const { token } = await createSession(inactiveAdmin.id);
    const context = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    try {
      const response = await context.post("/api/users", {
        data: {
          email: uniqueEmail("blocked.by.inactive"),
          firstName: "Blocked",
          lastName: "User",
        },
      });
      expect(response.status()).toBe(401);
    } finally {
      await context.dispose();
    }
  });

  test("creates a user with normalized email and temporary password state", async ({
    request,
  }) => {
    const rawEmail = `  ${uniqueEmail("normalized").toUpperCase()}  `;
    const { before, after, body } = await createUser(request, rawEmail);

    expect(body.user.email).toBe(rawEmail.trim().toLowerCase());
    expect(body.user).toMatchObject({
      firstName: "Created",
      lastName: "User",
      middleName: "Temporary",
      isActive: true,
      passwordMustChange: true,
      passwordChangedAt: null,
      systemRole: null,
    });
    expect(body.temporaryPassword).toEqual(expect.any(String));
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(20);

    const expiresAt = new Date(body.user.temporaryPasswordExpiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000 + 1000);
    expect(body.temporaryPasswordExpiresAt).toBe(
      body.user.temporaryPasswordExpiresAt,
    );

    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: body.user.id },
      select: {
        passwordHash: true,
        systemRoleId: true,
        memberships: { select: { id: true } },
      },
    });

    expect(savedUser.passwordHash).not.toBe(body.temporaryPassword);
    await expect(
      verifyPassword(body.temporaryPassword, savedUser.passwordHash),
    ).resolves.toBe(true);
    expect(savedUser.systemRoleId).toBeNull();
    expect(savedUser.memberships).toHaveLength(0);

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "USER_ACCOUNT_CREATED",
        entityType: "User",
        entityId: body.user.id,
      },
    });
    expect(activity).not.toBeNull();
    expect(JSON.stringify(activity?.metadata)).not.toContain(
      body.temporaryPassword,
    );
    expect(JSON.stringify(activity?.metadata)).not.toContain(
      savedUser.passwordHash,
    );
  });

  test("validates input and rejects duplicate email", async ({ request }) => {
    await login(request);

    const invalidResponse = await request.post("/api/users", {
      data: {
        email: "not-an-email",
        firstName: "",
        lastName: "",
      },
    });

    expect(invalidResponse.status()).toBe(400);

    const email = uniqueEmail("duplicate");
    await createUser(request, email);

    const duplicateResponse = await request.post("/api/users", {
      data: {
        email: email.toUpperCase(),
        firstName: "Duplicate",
        lastName: "User",
      },
    });

    expect(duplicateResponse.status()).toBe(409);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      error: {
        code: "CONFLICT",
        message: "User with this email already exists.",
      },
    });
  });

  test("forces password change before protected API access", async ({
    request,
  }) => {
    const { body } = await createUser(request);
    const loginResponse = await request.post("/api/auth/login", {
      data: {
        email: body.user.email,
        password: body.temporaryPassword,
      },
    });

    expect(loginResponse.status()).toBe(200);
    await expect(loginResponse.json()).resolves.toMatchObject({
      passwordChangeRequired: true,
    });

    const meResponse = await request.get("/api/auth/me");
    expect(meResponse.status()).toBe(200);

    const blockedResponse = await request.get("/api/departments");
    expect(blockedResponse.status()).toBe(403);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: { code: "PASSWORD_CHANGE_REQUIRED" },
    });
  });

  test("rejects expired temporary password for login and change", async ({
    request,
  }) => {
    const { body } = await createUser(request);
    await prisma.user.update({
      where: { id: body.user.id },
      data: {
        temporaryPasswordExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const loginResponse = await request.post("/api/auth/login", {
      data: {
        email: body.user.email,
        password: body.temporaryPassword,
      },
    });
    expect(loginResponse.status()).toBe(401);

    const { token } = await createSession(body.user.id);
    const context = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    try {
      const changeResponse = await context.post("/api/auth/change-password", {
        data: {
          currentPassword: body.temporaryPassword,
          newPassword: "NewPassword123!",
        },
      });
      expect(changeResponse.status()).toBe(401);
    } finally {
      await context.dispose();
    }
  });

  test("changes temporary password and restores normal access", async ({
    request,
  }) => {
    const { body } = await createUser(request);
    const newPassword = "Pass1234";

    const loginResponse = await request.post("/api/auth/login", {
      data: {
        email: body.user.email,
        password: body.temporaryPassword,
      },
    });
    expect(loginResponse.status()).toBe(200);

    const reuseResponse = await request.post("/api/auth/change-password", {
      data: {
        currentPassword: body.temporaryPassword,
        newPassword: body.temporaryPassword,
      },
    });
    expect(reuseResponse.status()).toBe(400);

    const changeResponse = await request.post("/api/auth/change-password", {
      data: {
        currentPassword: body.temporaryPassword,
        newPassword,
      },
    });
    expect(changeResponse.status()).toBe(200);

    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: body.user.id },
      select: {
        passwordHash: true,
        passwordMustChange: true,
        temporaryPasswordExpiresAt: true,
        passwordChangedAt: true,
      },
    });

    expect(savedUser.passwordMustChange).toBe(false);
    expect(savedUser.temporaryPasswordExpiresAt).toBeNull();
    expect(savedUser.passwordChangedAt).not.toBeNull();
    await expect(verifyPassword(newPassword, savedUser.passwordHash)).resolves.toBe(
      true,
    );

    const departmentsResponse = await request.get("/api/departments");
    expect(departmentsResponse.status()).toBe(200);

    const reloginResponse = await request.post("/api/auth/login", {
      data: {
        email: body.user.email,
        password: newPassword,
      },
    });
    expect(reloginResponse.status()).toBe(200);
    await expect(reloginResponse.json()).resolves.toMatchObject({
      passwordChangeRequired: false,
    });
  });

  test("enforces new password policy on the server", async ({ request }) => {
    const temporaryPassword = "Temp1234";
    const email = uniqueEmail("policy.user");
    const user = await prisma.user.create({
      data: {
        email,
        firstName: "Policy",
        lastName: "User",
        passwordHash: await hashPassword(temporaryPassword),
        passwordMustChange: true,
        temporaryPasswordExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        passwordChangedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const loginResponse = await request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email,
        password: temporaryPassword,
      },
    });
    expect(loginResponse.status()).toBe(200);

    for (const newPassword of ["Pass123", "password1", "Password"]) {
      const response = await request.post("/api/auth/change-password", {
        data: {
          currentPassword: temporaryPassword,
          newPassword,
        },
      });

      expect(response.status()).toBe(400);
    }

    const reuseResponse = await request.post("/api/auth/change-password", {
      data: {
        currentPassword: temporaryPassword,
        newPassword: temporaryPassword,
      },
    });
    expect(reuseResponse.status()).toBe(400);

    const acceptedResponse = await request.post("/api/auth/change-password", {
      data: {
        currentPassword: temporaryPassword,
        newPassword: "Pass1234",
      },
    });
    expect(acceptedResponse.status()).toBe(200);

    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        passwordMustChange: true,
        temporaryPasswordExpiresAt: true,
        passwordChangedAt: true,
      },
    });

    expect(savedUser.passwordMustChange).toBe(false);
    expect(savedUser.temporaryPasswordExpiresAt).toBeNull();
    expect(savedUser.passwordChangedAt).not.toBeNull();
  });

  test("keeps existing GET users contract compatible", async ({ request }) => {
    const { body: created } = await createUser(request);

    const response = await request.get("/api/users");
    expect(response.status()).toBe(200);

    const body = await response.json();
    const user = body.users.find(
      (item: { id: string }) => item.id === created.user.id,
    );

    expect(user).toMatchObject({
      id: created.user.id,
      email: created.user.email,
      firstName: "Created",
      lastName: "User",
      middleName: "Temporary",
      isActive: true,
    });
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("temporaryPassword");
  });

  test("rejects user management actions for unauthenticated and non-system-admin users", async ({
    request,
  }) => {
    const target = await createDirectUser();

    const unauthenticatedStatusResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: false },
      },
    );
    expect(unauthenticatedStatusResponse.status()).toBe(401);

    const unauthenticatedResetResponse = await request.post(
      `/api/users/${target.id}/reset-password`,
    );
    expect(unauthenticatedResetResponse.status()).toBe(401);

    await login(request, departmentAdmin);

    const forbiddenStatusResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: false },
      },
    );
    expect(forbiddenStatusResponse.status()).toBe(403);

    const forbiddenResetResponse = await request.post(
      `/api/users/${target.id}/reset-password`,
    );
    expect(forbiddenResetResponse.status()).toBe(403);
  });

  test("deactivates a user, revokes sessions, and writes activity", async ({
    request,
  }) => {
    const target = await createDirectUser();
    const targetContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });

    try {
      const targetLoginResponse = await targetContext.post("/api/auth/login", {
        data: {
          email: target.email,
          password: target.password,
        },
      });
      expect(targetLoginResponse.status()).toBe(200);

      const beforeDeactivateResponse = await targetContext.get(
        "/api/departments",
      );
      expect(beforeDeactivateResponse.status()).toBe(200);

      await login(request);
      const deactivateResponse = await request.patch(
        `/api/users/${target.id}/status`,
        {
          data: { isActive: false },
        },
      );
      expect(deactivateResponse.status()).toBe(200);
      await expect(deactivateResponse.json()).resolves.toMatchObject({
        user: {
          id: target.id,
          isActive: false,
        },
      });

      const savedUser = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { isActive: true },
      });
      expect(savedUser.isActive).toBe(false);

      const remainingSessionCount = await prisma.session.count({
        where: { userId: target.id },
      });
      expect(remainingSessionCount).toBe(0);

      const afterDeactivateResponse = await targetContext.get(
        "/api/departments",
      );
      expect(afterDeactivateResponse.status()).toBe(401);

      const reloginResponse = await targetContext.post("/api/auth/login", {
        data: {
          email: target.email,
          password: target.password,
        },
      });
      expect(reloginResponse.status()).toBe(401);

      const activity = await prisma.activityLog.findFirst({
        where: {
          type: "USER_ACCOUNT_DEACTIVATED",
          entityType: "User",
          entityId: target.id,
        },
      });
      expect(activity).not.toBeNull();
      expect(JSON.stringify(activity?.metadata)).not.toContain(
        target.password,
      );
    } finally {
      await targetContext.dispose();
    }
  });

  test("rejects self-deactivation and repeated status operations", async ({
    request,
  }) => {
    const target = await createDirectUser();
    await login(request);

    const meResponse = await request.get("/api/auth/me");
    const me = (await meResponse.json()) as { user: { id: string } };

    const selfDeactivateResponse = await request.patch(
      `/api/users/${me.user.id}/status`,
      {
        data: { isActive: false },
      },
    );
    expect(selfDeactivateResponse.status()).toBe(409);

    const deactivateResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: false },
      },
    );
    expect(deactivateResponse.status()).toBe(200);

    const repeatedDeactivateResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: false },
      },
    );
    expect(repeatedDeactivateResponse.status()).toBe(409);

    const reactivateResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: true },
      },
    );
    expect(reactivateResponse.status()).toBe(200);

    const repeatedReactivateResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: true },
      },
    );
    expect(repeatedReactivateResponse.status()).toBe(409);
  });

  test("reactivation does not restore old sessions or ended department memberships", async ({
    request,
  }) => {
    const target = await createDirectUser();
    const department = await prisma.department.create({
      data: {
        name: `Lifecycle ${Date.now()}`,
        createdById: target.id,
      },
      select: { id: true },
    });
    createdDepartmentIds.push(department.id);

    const role = await prisma.role.findUniqueOrThrow({
      where: { code: "EMPLOYEE" },
      select: { id: true },
    });
    const member = await prisma.departmentMember.create({
      data: {
        departmentId: department.id,
        userId: target.id,
        roleId: role.id,
        leftAt: new Date(),
      },
      select: { id: true },
    });

    await login(request);
    const deactivateResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: false },
      },
    );
    expect(deactivateResponse.status()).toBe(200);

    const reactivateResponse = await request.patch(
      `/api/users/${target.id}/status`,
      {
        data: { isActive: true },
      },
    );
    expect(reactivateResponse.status()).toBe(200);

    const sessionCount = await prisma.session.count({
      where: { userId: target.id },
    });
    expect(sessionCount).toBe(0);

    const savedMember = await prisma.departmentMember.findUniqueOrThrow({
      where: { id: member.id },
      select: { leftAt: true },
    });
    expect(savedMember.leftAt).not.toBeNull();

    const loginResponse = await request.post("/api/auth/login", {
      data: {
        email: target.email,
        password: target.password,
      },
    });
    expect(loginResponse.status()).toBe(200);

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "USER_ACCOUNT_REACTIVATED",
        entityType: "User",
        entityId: target.id,
      },
    });
    expect(activity).not.toBeNull();
  });

  test("rejects administrative self password reset without side effects", async ({
    request,
  }) => {
    await login(request);

    const meResponse = await request.get("/api/auth/me");
    expect(meResponse.status()).toBe(200);
    const me = (await meResponse.json()) as { user: { id: string } };

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: me.user.id },
      select: {
        passwordHash: true,
        passwordMustChange: true,
        temporaryPasswordExpiresAt: true,
        passwordChangedAt: true,
      },
    });
    const beforeSessionCount = await prisma.session.count({
      where: { userId: me.user.id },
    });
    const beforeActivityCount = await prisma.activityLog.count({
      where: {
        type: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: me.user.id,
      },
    });

    const resetResponse = await request.post(
      `/api/users/${me.user.id}/reset-password`,
    );
    expect(resetResponse.status()).toBe(409);
    const resetBody = (await resetResponse.json()) as {
      error: { code: string };
      temporaryPassword?: string;
    };
    expect(resetBody).toMatchObject({
      error: {
        code: "SELF_PASSWORD_RESET_NOT_ALLOWED",
      },
    });
    expect(resetBody).not.toHaveProperty("temporaryPassword");

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: me.user.id },
      select: {
        passwordHash: true,
        passwordMustChange: true,
        temporaryPasswordExpiresAt: true,
        passwordChangedAt: true,
      },
    });
    const afterSessionCount = await prisma.session.count({
      where: { userId: me.user.id },
    });
    const afterActivityCount = await prisma.activityLog.count({
      where: {
        type: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: me.user.id,
      },
    });

    expect(after).toEqual(before);
    expect(afterSessionCount).toBe(beforeSessionCount);
    expect(afterActivityCount).toBe(beforeActivityCount);
  });

  test("reset password revokes sessions, returns a one-time temporary password, and requires change", async ({
    request,
  }) => {
    const target = await createDirectUser();
    const oldPasswordHash = await prisma.user
      .findUniqueOrThrow({
        where: { id: target.id },
        select: { passwordHash: true },
      })
      .then((user) => user.passwordHash);

    const targetContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });

    try {
      const targetLoginResponse = await targetContext.post("/api/auth/login", {
        data: {
          email: target.email,
          password: target.password,
        },
      });
      expect(targetLoginResponse.status()).toBe(200);

      await login(request);
      const before = Date.now();
      const resetResponse = await request.post(
        `/api/users/${target.id}/reset-password`,
      );
      const after = Date.now();
      expect(resetResponse.status()).toBe(200);

      const resetBody = (await resetResponse.json()) as {
        user: {
          id: string;
          passwordMustChange: boolean;
          temporaryPasswordExpiresAt: string;
          passwordChangedAt: string | null;
        };
        temporaryPassword: string;
        temporaryPasswordExpiresAt: string;
      };
      expect(resetBody.user).toMatchObject({
        id: target.id,
        passwordMustChange: true,
        passwordChangedAt: null,
      });
      expect(resetBody.temporaryPassword).toEqual(expect.any(String));
      expect(resetBody.temporaryPassword.length).toBeGreaterThanOrEqual(20);
      expect(resetBody.temporaryPasswordExpiresAt).toBe(
        resetBody.user.temporaryPasswordExpiresAt,
      );

      const expiresAt = new Date(resetBody.temporaryPasswordExpiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(
        after + 24 * 60 * 60 * 1000 + 1000,
      );

      const savedUser = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: {
          passwordHash: true,
          passwordMustChange: true,
          temporaryPasswordExpiresAt: true,
          passwordChangedAt: true,
        },
      });
      expect(savedUser.passwordHash).not.toBe(oldPasswordHash);
      await expect(
        verifyPassword(resetBody.temporaryPassword, savedUser.passwordHash),
      ).resolves.toBe(true);
      expect(savedUser.passwordMustChange).toBe(true);
      expect(savedUser.temporaryPasswordExpiresAt).not.toBeNull();
      expect(savedUser.passwordChangedAt).toBeNull();

      const oldSessionResponse = await targetContext.get("/api/departments");
      expect(oldSessionResponse.status()).toBe(401);

      const oldPasswordLoginResponse = await request.post("/api/auth/login", {
        data: {
          email: target.email,
          password: target.password,
        },
      });
      expect(oldPasswordLoginResponse.status()).toBe(401);

      const temporaryLoginResponse = await request.post("/api/auth/login", {
        data: {
          email: target.email,
          password: resetBody.temporaryPassword,
        },
      });
      expect(temporaryLoginResponse.status()).toBe(200);
      await expect(temporaryLoginResponse.json()).resolves.toMatchObject({
        passwordChangeRequired: true,
      });

      const protectedResponse = await request.get("/api/departments");
      expect(protectedResponse.status()).toBe(403);

      const newPassword = "Reset123";
      const changeResponse = await request.post("/api/auth/change-password", {
        data: {
          currentPassword: resetBody.temporaryPassword,
          newPassword,
        },
      });
      expect(changeResponse.status()).toBe(200);

      const reloginResponse = await request.post("/api/auth/login", {
        data: {
          email: target.email,
          password: newPassword,
        },
      });
      expect(reloginResponse.status()).toBe(200);
      await expect(reloginResponse.json()).resolves.toMatchObject({
        passwordChangeRequired: false,
      });

      await login(request);
      const usersResponse = await request.get("/api/users");
      expect(usersResponse.status()).toBe(200);
      expect(JSON.stringify(await usersResponse.json())).not.toContain(
        resetBody.temporaryPassword,
      );

      const activity = await prisma.activityLog.findFirst({
        where: {
          type: "USER_PASSWORD_RESET",
          entityType: "User",
          entityId: target.id,
        },
      });
      expect(activity).not.toBeNull();
      expect(JSON.stringify(activity?.metadata)).not.toContain(
        resetBody.temporaryPassword,
      );
      expect(JSON.stringify(activity?.metadata)).not.toContain(
        savedUser.passwordHash,
      );
    } finally {
      await targetContext.dispose();
    }
  });

  test("expired reset password cannot create a usable session", async ({
    request,
  }) => {
    const target = await createDirectUser();
    await login(request);

    const resetResponse = await request.post(
      `/api/users/${target.id}/reset-password`,
    );
    expect(resetResponse.status()).toBe(200);
    const resetBody = (await resetResponse.json()) as {
      temporaryPassword: string;
    };

    await prisma.user.update({
      where: { id: target.id },
      data: {
        temporaryPasswordExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const loginResponse = await request.post("/api/auth/login", {
      data: {
        email: target.email,
        password: resetBody.temporaryPassword,
      },
    });
    expect(loginResponse.status()).toBe(401);
  });

  test("concurrent system-admin deactivation keeps at least one active administrator", async () => {
    const firstAdmin = await createDirectUser({
      email: uniqueEmail("concurrent.admin.one"),
      systemRoleCode: "SYSTEM_ADMIN",
    });
    const secondAdmin = await createDirectUser({
      email: uniqueEmail("concurrent.admin.two"),
      systemRoleCode: "SYSTEM_ADMIN",
    });

    const firstContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });
    const secondContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });

    try {
      const firstLoginResponse = await firstContext.post("/api/auth/login", {
        data: {
          email: firstAdmin.email,
          password: firstAdmin.password,
        },
      });
      expect(firstLoginResponse.status()).toBe(200);

      const secondLoginResponse = await secondContext.post("/api/auth/login", {
        data: {
          email: secondAdmin.email,
          password: secondAdmin.password,
        },
      });
      expect(secondLoginResponse.status()).toBe(200);

      const [firstResponse, secondResponse] = await Promise.all([
        firstContext.patch(`/api/users/${secondAdmin.id}/status`, {
          data: { isActive: false },
        }),
        secondContext.patch(`/api/users/${firstAdmin.id}/status`, {
          data: { isActive: false },
        }),
      ]);

      expect(firstResponse.status()).not.toBe(500);
      expect(secondResponse.status()).not.toBe(500);
      expect([200, 401, 403, 409]).toContain(firstResponse.status());
      expect([200, 401, 403, 409]).toContain(secondResponse.status());

      const concurrentAdmins = await prisma.user.findMany({
        where: {
          id: {
            in: [firstAdmin.id, secondAdmin.id],
          },
        },
        select: {
          id: true,
          isActive: true,
        },
      });
      const activeConcurrentAdminCount = concurrentAdmins.filter(
        (user) => user.isActive,
      ).length;
      expect(activeConcurrentAdminCount).toBeGreaterThanOrEqual(1);

      const activeSystemAdminCount = await prisma.user.count({
        where: {
          isActive: true,
          systemRole: {
            code: "SYSTEM_ADMIN",
          },
        },
      });
      expect(activeSystemAdminCount).toBeGreaterThanOrEqual(1);
    } finally {
      await firstContext.dispose();
      await secondContext.dispose();
    }
  });
});
