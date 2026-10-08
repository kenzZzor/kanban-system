import { expect, test, type APIRequestContext } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

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

test.describe("Department Members API", () => {
  test("unauthenticated user cannot read department members", async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(401);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      },
    });
  });

  test("system admin can read department members", async ({ request }) => {
    await login(request, "system.admin@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.members).toHaveLength(4);
    expect(body.members.map((member: { role: { code: string } }) => member.role.code))
      .toEqual(["DEPARTMENT_ADMIN", "MANAGER", "EMPLOYEE", "VIEWER"]);
  });

  test("department admin can read members of own department", async ({
    request,
  }) => {
    await login(request, "alice.admin@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.members).toHaveLength(4);
  });

  test("manager can read members of own department", async ({ request }) => {
    await login(request, "bob.manager@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.members).toHaveLength(4);
  });

  test("former manager cannot read members of former department", async ({
    request,
  }) => {
    await login(request, "former.member@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(403);
  });

  test("employee cannot read department members", async ({ request }) => {
    await login(request, "charlie.employee@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(403);
  });

  test("viewer cannot read department members", async ({ request }) => {
    await login(request, "diana.viewer@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-it/members`,
    );

    expect(response.status()).toBe(403);
  });

  test("manager cannot read members of another department", async ({
    request,
  }) => {
    await login(request, "bob.manager@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/seed-department-analytics/members`,
    );

    expect(response.status()).toBe(403);
  });

  test("system admin receives 404 for nonexistent department", async ({
    request,
  }) => {
    await login(request, "system.admin@kanban.local");

    const response = await request.get(
      `${BASE_URL}/api/departments/nonexistent-department/members`,
    );

    expect(response.status()).toBe(404);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Department not found.",
      },
    });
  });
});



