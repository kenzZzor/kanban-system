import { expect, test } from "@playwright/test";

const testUser = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

test("user can login, access current user, and logout", async ({ request }) => {
  const loginResponse = await request.post("/api/auth/login", {
    data: testUser,
  });

  expect(loginResponse.status()).toBe(200);

  const loginBody = await loginResponse.json();

  expect(loginBody).toEqual({
    message: "Login successful",
  });

  const meResponse = await request.get("/api/auth/me");

  expect(meResponse.status()).toBe(200);

  const meBody = await meResponse.json();

  expect(meBody.user).toMatchObject({
    email: testUser.email,
    firstName: "System",
    lastName: "Administrator",
    isActive: true,
  });

  const logoutResponse = await request.post("/api/auth/logout");

  expect(logoutResponse.status()).toBe(200);

  const logoutBody = await logoutResponse.json();

  expect(logoutBody).toEqual({
    message: "Logout successful",
  });

  const unauthorizedResponse = await request.get("/api/auth/me");

  expect(unauthorizedResponse.status()).toBe(401);

  const unauthorizedBody = await unauthorizedResponse.json();

  expect(unauthorizedBody).toEqual({
    error: "Unauthorized",
  });
});


test("login rejects invalid password", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: {
      email: testUser.email,
      password: "WrongPassword123!",
    },
  });

  expect(response.status()).toBe(401);

  const body = await response.json();

  expect(body).toEqual({
    error: "Invalid email or password",
  });
});

test("login rejects missing credentials", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: {
      email: testUser.email,
    },
  });

  expect(response.status()).toBe(400);

  const body = await response.json();

  expect(body).toEqual({
    error: "Email and password are required",
  });
});
