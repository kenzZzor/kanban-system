import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

import { prisma } from "../lib/db";

const BASE_URL = "http://localhost:3000";
const createdDepartmentIds: string[] = [];

type RoleCode = "DEPARTMENT_ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";

async function login(
  request: APIRequestContext,
  email: string,
) {
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    data: {
      email,
      password: "DevOnly123!",
    },
  });

  expect(response.status()).toBe(200);
}

async function getUserId(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  expect(user).not.toBeNull();

  return user!.id;
}

async function createDepartment(request: APIRequestContext) {
  await login(request, "system.admin@kanban.local");

  const response = await request.post(`${BASE_URL}/api/departments`, {
    data: {
      name: `PATCH Members ${Date.now()} ${Math.random()}`,
      description: "Created by department member update tests.",
    },
  });

  expect(response.status()).toBe(201);

  const body = await response.json();
  const departmentId = body.department.id as string;
  createdDepartmentIds.push(departmentId);

  return departmentId;
}

async function addMember({
  request,
  departmentId,
  email,
  roleCode,
  managerId,
}: {
  request: APIRequestContext;
  departmentId: string;
  email: string;
  roleCode: RoleCode;
  managerId?: string;
}) {
  const response = await request.post(
    `${BASE_URL}/api/departments/${departmentId}/members`,
    {
      data: {
        userId: await getUserId(email),
        roleCode,
        ...(managerId ? { managerId } : {}),
      },
    },
  );

  expect(response.status()).toBe(201);

  const body = await response.json();

  return body.member as {
    id: string;
    user: { id: string; email: string };
    role: { code: RoleCode };
    manager: { id: string } | null;
  };
}

test.afterAll(async () => {
  await prisma.department.deleteMany({
    where: { id: { in: createdDepartmentIds } },
  });
  await prisma.$disconnect();
});

test.describe("Department Member Update API", () => {
  test("changes role and writes activity", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
      {
        data: {
          roleCode: "MANAGER",
        },
      },
    );
    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.member.role.code).toBe("MANAGER");

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "ROLE_CHANGED",
        departmentId,
        entityId: member.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    expect(activity).not.toBeNull();
    expect(activity?.metadata).toMatchObject({
      memberId: member.id,
      userId: member.user.id,
      old: "EMPLOYEE",
      new: "MANAGER",
    });
  });

  test("changes and clears manager", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const manager = await addMember({
      request,
      departmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });

    const setResponse = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
      {
        data: {
          managerId: manager.id,
        },
      },
    );

    expect(setResponse.status()).toBe(200);

    const setBody = await setResponse.json();

    expect(setBody.member.manager.id).toBe(manager.id);

    const clearResponse = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
      {
        data: {
          managerId: null,
        },
      },
    );

    expect(clearResponse.status()).toBe(200);

    const clearBody = await clearResponse.json();

    expect(clearBody.member.manager).toBeNull();
  });

  test("rejects manager hierarchy cycle", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const manager = await addMember({
      request,
      departmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
      managerId: manager.id,
    });

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${manager.id}`,
      {
        data: {
          managerId: member.id,
        },
      },
    );

    expect(response.status()).toBe(409);
  });

  test("rejects member as own manager", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
      {
        data: {
          managerId: member.id,
        },
      },
    );

    expect(response.status()).toBe(409);
  });

  test("rejects manager from another department", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const otherDepartmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });
    const otherManager = await addMember({
      request,
      departmentId: otherDepartmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
      {
        data: {
          managerId: otherManager.id,
        },
      },
    );

    expect(response.status()).toBe(400);
  });

  test("department admin cannot assign department admin role", async ({
    request,
  }) => {
    const departmentId = await createDepartment(request);
    const targetMember = await addMember({
      request,
      departmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });
    await addMember({
      request,
      departmentId,
      email: "alice.admin@kanban.local",
      roleCode: "DEPARTMENT_ADMIN",
    });

    const adminContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });

    try {
      await login(adminContext, "alice.admin@kanban.local");

      const response = await adminContext.patch(
        `/api/departments/${departmentId}/members/${targetMember.id}`,
        {
          data: {
            roleCode: "DEPARTMENT_ADMIN",
          },
        },
      );

      expect(response.status()).toBe(403);
    } finally {
      await adminContext.dispose();
    }
  });

  test("system admin cannot demote last department admin", async ({
    request,
  }) => {
    const departmentId = await createDepartment(request);
    const departmentAdmin = await addMember({
      request,
      departmentId,
      email: "alice.admin@kanban.local",
      roleCode: "DEPARTMENT_ADMIN",
    });

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${departmentAdmin.id}`,
      {
        data: {
          roleCode: "MANAGER",
        },
      },
    );

    expect(response.status()).toBe(409);
  });

  test("employee cannot update department member", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });
    await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });

    const employeeContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });

    try {
      await login(employeeContext, "charlie.employee@kanban.local");

      const response = await employeeContext.patch(
        `/api/departments/${departmentId}/members/${member.id}`,
        {
          data: {
            roleCode: "EMPLOYEE",
          },
        },
      );

      expect(response.status()).toBe(403);
    } finally {
      await employeeContext.dispose();
    }
  });

  test("returns 404 for nonexistent member", async ({ request }) => {
    const departmentId = await createDepartment(request);

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/missing-member`,
      {
        data: {
          roleCode: "MANAGER",
        },
      },
    );

    expect(response.status()).toBe(404);
  });

  test("returns 404 for member from another department", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const otherDepartmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId: otherDepartmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });

    const response = await request.patch(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
      {
        data: {
          roleCode: "EMPLOYEE",
        },
      },
    );

    expect(response.status()).toBe(404);
  });

  test("rejects unauthenticated update", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "bob.manager@kanban.local",
      roleCode: "MANAGER",
    });

    const unauthenticatedContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });

    try {
      const response = await unauthenticatedContext.patch(
        `/api/departments/${departmentId}/members/${member.id}`,
        {
          data: {
            roleCode: "EMPLOYEE",
          },
        },
      );

      expect(response.status()).toBe(401);
    } finally {
      await unauthenticatedContext.dispose();
    }
  });
});
