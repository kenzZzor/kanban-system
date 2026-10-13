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

test.afterAll(async () => {
  await prisma.session.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.activityLog.deleteMany({
    where: {
      entityType: "User",
      entityId: { in: createdUserIds },
    },
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
});
