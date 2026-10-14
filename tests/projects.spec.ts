import { expect, test } from "@playwright/test";

import { prisma } from "../lib/db";

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const departmentAdmin = {
  email: "alice.admin@kanban.local",
  password: "DevOnly123!",
};

const manager = {
  email: "bob.manager@kanban.local",
  password: "DevOnly123!",
};

const viewer = {
  email: "diana.viewer@kanban.local",
  password: "DevOnly123!",
};

const createdProjectIds: string[] = [];

function uniqueProjectName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
}

async function login(
  request: import("@playwright/test").APIRequestContext,
  credentials: { email: string; password: string },
) {
  const response = await request.post("/api/auth/login", {
    data: credentials,
  });

  expect(response.status()).toBe(200);
}

test.afterAll(async () => {
  await prisma.activityLog.deleteMany({
    where: {
      entityType: "Project",
      entityId: { in: createdProjectIds },
    },
  });
  await prisma.projectMember.deleteMany({
    where: { projectId: { in: createdProjectIds } },
  });
  await prisma.task.deleteMany({
    where: { projectId: { in: createdProjectIds } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: createdProjectIds } },
  });
  await prisma.$disconnect();
});

test.describe("Projects API", () => {
  test("unauthenticated user cannot read or create projects", async ({ request }) => {
    const listResponse = await request.get("/api/projects");
    expect(listResponse.status()).toBe(401);

    const createResponse = await request.post("/api/projects", {
      data: {
        name: "Unauthorized Project",
        departmentId: "seed-department-it",
      },
    });
    expect(createResponse.status()).toBe(401);
  });

  test("system admin can create project and activity is written", async ({ request }) => {
    await login(request, systemAdmin);

    const projectName = uniqueProjectName("API Project");
    const response = await request.post("/api/projects", {
      data: {
        name: projectName,
        description: "Created by API test",
        departmentId: "seed-department-it",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();

    expect(body.project).toMatchObject({
      name: projectName,
      description: "Created by API test",
      departmentId: "seed-department-it",
      isArchived: false,
    });

    createdProjectIds.push(body.project.id);

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "PROJECT_CREATED",
        entityType: "Project",
        entityId: body.project.id,
      },
    });

    expect(activity).not.toBeNull();
  });

  test("department admin can create project in own department", async ({ request }) => {
    await login(request, departmentAdmin);

    const response = await request.post("/api/projects", {
      data: {
        name: uniqueProjectName("Dept Admin Project"),
        departmentId: "seed-department-it",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdProjectIds.push(body.project.id);
    expect(body.project.departmentId).toBe("seed-department-it");
  });

  test("viewer cannot create project", async ({ request }) => {
    await login(request, viewer);

    const response = await request.post("/api/projects", {
      data: {
        name: uniqueProjectName("Viewer Project"),
        departmentId: "seed-department-it",
      },
    });

    expect(response.status()).toBe(403);
  });

  test("manager cannot create project in another department", async ({ request }) => {
    await login(request, manager);

    const response = await request.post("/api/projects", {
      data: {
        name: uniqueProjectName("Cross Department Project"),
        departmentId: "seed-department-analytics",
      },
    });

    expect(response.status()).toBe(403);
  });

  test("system admin gets 404 for nonexistent department on creation", async ({ request }) => {
    await login(request, systemAdmin);

    const response = await request.post("/api/projects", {
      data: {
        name: uniqueProjectName("Missing Department Project"),
        departmentId: "missing-department-id",
      },
    });

    expect(response.status()).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Department not found.",
      },
    });
  });

  test("cannot spoof createdById from request body", async ({ request }) => {
    await login(request, systemAdmin);

    const meResponse = await request.get("/api/auth/me");
    const meBody = await meResponse.json();
    const actorId = meBody.user.id;

    const response = await request.post("/api/projects", {
      data: {
        name: uniqueProjectName("Spoofed Creator Project"),
        departmentId: "seed-department-it",
        createdById: "malicious-user-id",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdProjectIds.push(body.project.id);

    expect(body.project.createdById).toBe(actorId);
    expect(body.project.createdBy.id).toBe(actorId);
  });

  test("project creation validates payload", async ({ request }) => {
    await login(request, systemAdmin);

    const response = await request.post("/api/projects", {
      data: {
        name: "   ",
        departmentId: "",
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("list returns only accessible projects and supports department filter", async ({
    request,
  }) => {
    await login(request, manager);

    const allResponse = await request.get("/api/projects");
    expect(allResponse.status()).toBe(200);
    const allBody = await allResponse.json();
    expect(Array.isArray(allBody.projects)).toBe(true);
    expect(
      allBody.projects.some(
        (project: { departmentId: string }) => project.departmentId === "seed-department-it",
      ),
    ).toBe(true);
    expect(
      allBody.projects.some(
        (project: { departmentId: string }) => project.departmentId === "seed-department-analytics",
      ),
    ).toBe(false);

    const ownDepartmentResponse = await request.get(
      "/api/projects?departmentId=seed-department-it",
    );
    expect(ownDepartmentResponse.status()).toBe(200);
    const ownDepartmentBody = await ownDepartmentResponse.json();
    expect(
      ownDepartmentBody.projects.every(
        (project: { departmentId: string }) => project.departmentId === "seed-department-it",
      ),
    ).toBe(true);

    const anotherDepartmentResponse = await request.get(
      "/api/projects?departmentId=seed-department-analytics",
    );
    expect(anotherDepartmentResponse.status()).toBe(403);
  });
});
