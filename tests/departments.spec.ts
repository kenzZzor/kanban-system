import { expect, test } from "@playwright/test";

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const departmentAdmin = {
  email: "alice.admin@kanban.local",
  password: "DevOnly123!",
};

test("unauthenticated user cannot access departments", async ({ request }) => {
  const response = await request.get("/api/departments");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    },
  });
});

test("SYSTEM_ADMIN can read all departments", async ({ page }) => {
  await page.goto("/");

  const loginResponse = await page.request.post("/api/auth/login", {
    data: systemAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const response = await page.request.get("/api/departments");

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.departments).toBeInstanceOf(Array);
  expect(body.departments.length).toBeGreaterThan(0);
});

test("department member can read own department", async ({ page }) => {
  await page.goto("/");

  const loginResponse = await page.request.post("/api/auth/login", {
    data: departmentAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const response = await page.request.get("/api/departments");

  expect(response.status()).toBe(200);

  const body = await response.json();

  expect(body.departments).toBeInstanceOf(Array);
  expect(body.departments.length).toBeGreaterThan(0);

  expect(
    body.departments.some(
      (department: { name: string }) => department.name === "IT Department",
    ),
  ).toBe(true);
});

test("department admin cannot create a department", async ({ page }) => {
  await page.goto("/");

  const loginResponse = await page.request.post("/api/auth/login", {
    data: departmentAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const response = await page.request.post("/api/departments", {
    data: {
      name: "Unauthorized Department",
      description: "This department must not be created.",
    },
  });

  expect(response.status()).toBe(403);

  await expect(response.json()).resolves.toEqual({
    error: {
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action.",
    },
  });
});

test("SYSTEM_ADMIN can create a department", async ({ page }) => {
  await page.goto("/");

  const loginResponse = await page.request.post("/api/auth/login", {
    data: systemAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const departmentName = `Test Department ${Date.now()}`;

  const response = await page.request.post("/api/departments", {
    data: {
      name: departmentName,
      description: "Created by Departments API test.",
    },
  });

  expect(response.status()).toBe(201);

  const body = await response.json();

  expect(body.department).toMatchObject({
    name: departmentName,
    description: "Created by Departments API test.",
    createdById: expect.any(String),
  });

  expect(body.department.managerId).toBeNull();
});

test("department creation validates request data", async ({ page }) => {
  await page.goto("/");

  const loginResponse = await page.request.post("/api/auth/login", {
    data: systemAdmin,
  });

  expect(loginResponse.status()).toBe(200);

  const response = await page.request.post("/api/departments", {
    data: {
      name: "",
    },
  });

  expect(response.status()).toBe(400);

  const body = await response.json();

  expect(body.error.code).toBe("BAD_REQUEST");
  expect(body.error.message).toBe("Invalid request data.");
  expect(body.error.details.name).toBeInstanceOf(Array);
});
