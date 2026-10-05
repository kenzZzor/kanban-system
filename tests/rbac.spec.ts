import { expect, test } from "@playwright/test";

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const departmentAdmin = {
  email: "alice.admin@kanban.local",
  password: "DevOnly123!",
};

test("unauthenticated user cannot access users API", async ({ request }) => {
  const response = await request.get("/api/users");

  expect(response.status()).toBe(401);

  const body = await response.json();

  expect(body).toEqual({
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    },
  });
});

test("SYSTEM_ADMIN can read users", async ({ request }) => {
  const loginResponse = await request.post("/api/auth/login", {
    data: systemAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const response = await request.get("/api/users");

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(Array.isArray(body.users)).toBe(true);
  expect(body.users.length).toBeGreaterThan(0);

  for (const user of body.users) {
    expect(user).not.toHaveProperty("passwordHash");
  }
});

test("department role cannot use global USERS_READ permission", async ({
  request,
}) => {
  const loginResponse = await request.post("/api/auth/login", {
    data: departmentAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const response = await request.get("/api/users");

  expect(response.status()).toBe(403);

  const body = await response.json();

  expect(body).toEqual({
    error: {
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action.",
    },
  });
});
