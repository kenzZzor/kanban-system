import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";

import { prisma } from "../lib/db";

const BASE_URL = "http://localhost:3000";
const createdDepartmentIds: string[] = [];

type RoleCode = "DEPARTMENT_ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";

async function login(request: APIRequestContext, email: string) {
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password: "DevOnly123!" },
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
      name: `DELETE Members ${Date.now()} ${Math.random()}`,
      description: "Created by department member delete tests.",
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

test.describe("Department Member DELETE API", () => {
  test("soft removes a member and writes activity in the department", async ({
    request,
  }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });

    const response = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.member.id).toBe(member.id);
    expect(body.member.leftAt).not.toBeNull();

    const savedMember = await prisma.departmentMember.findUnique({
      where: { id: member.id },
      select: { leftAt: true, managerId: true },
    });
    expect(savedMember?.leftAt).not.toBeNull();

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "MEMBER_REMOVED",
        departmentId,
        entityId: member.id,
      },
    });
    expect(activity).not.toBeNull();
    expect(activity?.metadata).toMatchObject({
      departmentId,
      memberId: member.id,
      userId: member.user.id,
      previousRoleCode: "EMPLOYEE",
    });

    const listResponse = await request.get(
      `${BASE_URL}/api/departments/${departmentId}/members`,
    );
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.members.some((item: { id: string }) => item.id === member.id))
      .toBe(false);
  });

  test("rejects unauthenticated deletion", async () => {
    const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const response = await context.delete(
        "/api/departments/seed-department-it/members/missing-member",
      );
      expect(response.status()).toBe(401);
    } finally {
      await context.dispose();
    }
  });

  test("employee cannot remove a department member", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const target = await addMember({
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

    const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      await login(context, "charlie.employee@kanban.local");
      const response = await context.delete(
        `/api/departments/${departmentId}/members/${target.id}`,
      );
      expect(response.status()).toBe(403);
    } finally {
      await context.dispose();
    }
  });

  test("returns 404 for a nonexistent member", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const response = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/missing-member`,
    );
    expect(response.status()).toBe(404);
  });

  test("returns 404 when deleting an already removed member", async ({
    request,
  }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });

    const firstResponse = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
    );
    expect(firstResponse.status()).toBe(200);

    const secondResponse = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
    );
    expect(secondResponse.status()).toBe(404);
  });

  test("cannot remove the last active department admin", async ({ request }) => {
    const departmentId = await createDepartment(request);
    const admin = await addMember({
      request,
      departmentId,
      email: "alice.admin@kanban.local",
      roleCode: "DEPARTMENT_ADMIN",
    });

    const response = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/${admin.id}`,
    );
    expect(response.status()).toBe(409);

    const savedAdmin = await prisma.departmentMember.findUnique({
      where: { id: admin.id },
      select: { leftAt: true },
    });
    expect(savedAdmin?.leftAt).toBeNull();
  });

  test("cannot remove a member who still has active subordinates", async ({
    request,
  }) => {
    const departmentId = await createDepartment(request);
    const manager = await addMember({
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
      managerId: manager.id,
    });

    const response = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/${manager.id}`,
    );
    expect(response.status()).toBe(409);
  });

  test("reactivates a previously removed member without violating uniqueness", async ({
    request,
  }) => {
    const departmentId = await createDepartment(request);
    const member = await addMember({
      request,
      departmentId,
      email: "charlie.employee@kanban.local",
      roleCode: "EMPLOYEE",
    });

    const deleteResponse = await request.delete(
      `${BASE_URL}/api/departments/${departmentId}/members/${member.id}`,
    );
    expect(deleteResponse.status()).toBe(200);

    const addResponse = await request.post(
      `${BASE_URL}/api/departments/${departmentId}/members`,
      {
        data: {
          userId: member.user.id,
          roleCode: "VIEWER",
        },
      },
    );

    expect(addResponse.status()).toBe(201);
    const body = await addResponse.json();
    expect(body.member.id).toBe(member.id);
    expect(body.member.role.code).toBe("VIEWER");

    const savedMember = await prisma.departmentMember.findUnique({
      where: { id: member.id },
      select: { leftAt: true, joinedAt: true, role: { select: { code: true } } },
    });
    expect(savedMember?.leftAt).toBeNull();
    expect(savedMember?.role.code).toBe("VIEWER");

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "MEMBER_ADDED",
        departmentId,
        entityId: member.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(activity?.metadata).toMatchObject({ reactivated: true, userId: member.user.id });
  });
});
