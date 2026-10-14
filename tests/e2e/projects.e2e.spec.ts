import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/db";

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const manager = {
  email: "bob.manager@kanban.local",
  password: "DevOnly123!",
};

const departmentAdmin = {
  email: "alice.admin@kanban.local",
  password: "DevOnly123!",
};

const viewer = {
  email: "diana.viewer@kanban.local",
  password: "DevOnly123!",
};

const noProjectAccessUser = {
  email: "former.member@kanban.local",
  password: "DevOnly123!",
};

const createdProjectIds: string[] = [];
const createdProjectMemberIds: string[] = [];

function uniqueProjectName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
}

async function createProjectForMembersUiTest() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: departmentAdmin.email },
    select: { id: true },
  });

  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("UI Members Project"),
      description: "Temporary project for project members UI tests",
      departmentId: "seed-department-it",
      createdById: owner.id,
    },
    select: {
      id: true,
      name: true,
    },
  });

  createdProjectIds.push(project.id);
  return project;
}

async function login(
  page: import("@playwright/test").Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/login");
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
}

test.afterAll(async () => {
  if (createdProjectMemberIds.length > 0) {
    await prisma.activityLog.deleteMany({
      where: {
        entityType: "ProjectMember",
        entityId: { in: createdProjectMemberIds },
      },
    });
  }

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

test.describe("Projects UI", () => {
  test("system admin can open projects page and create project", async ({ page }) => {
    const projectName = uniqueProjectName("UI Project");

    await login(page, systemAdmin);
    await page.getByRole("link", { name: "Проекты" }).click();

    await expect(page).toHaveURL("/projects");
    await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible();
    await expect(page.getByText("Internal Systems")).toBeVisible();

    await page.getByRole("button", { name: "Создать проект" }).click();
    await page.fill("#project-name", projectName);
    await page.selectOption("#project-department", "seed-department-it");
    await page.fill("#project-description", "UI test project");
    await page.getByRole("button", { name: "Создать", exact: true }).click();

    await expect(page.getByText(projectName)).toBeVisible();

    const created = await prisma.project.findFirst({
      where: { name: projectName },
      select: { id: true },
    });
    expect(created).not.toBeNull();
    if (created) {
      createdProjectIds.push(created.id);
    }
  });

  test("manager sees own department projects and cannot read another by filter", async ({
    page,
  }) => {
    await login(page, manager);
    await page.goto("/projects");

    await expect(page.getByText("Internal Systems")).toBeVisible();
    await expect(page.getByText("Analytics Platform")).toHaveCount(0);

    const forbiddenResponse = await page.request.get(
      "/api/projects?departmentId=seed-department-analytics",
    );
    expect(forbiddenResponse.status()).toBe(403);
  });

  test("viewer can see projects but cannot create", async ({ page }) => {
    await login(page, viewer);
    await page.goto("/projects");

    await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Создать проект" })).toHaveCount(0);
  });

  test("user without project access sees forbidden state", async ({ page }) => {
    await login(page, noProjectAccessUser);
    await page.goto("/projects");

    await expect(page.getByText("Доступ запрещён")).toBeVisible();
    await expect(page.getByText("У вас нет прав на просмотр проектов.")).toBeVisible();
  });

  test("shows API error for failed project creation", async ({ page }) => {
    await login(page, systemAdmin);
    await page.goto("/projects");

    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Project data changed concurrently. Refresh and try again.",
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.getByRole("button", { name: "Создать проект" }).click();
    await page.fill("#project-name", uniqueProjectName("UI Error Project"));
    await page.selectOption("#project-department", "seed-department-it");
    await page.getByRole("button", { name: "Создать", exact: true }).click();

    await expect(
      page.getByText("Project data changed concurrently. Refresh and try again."),
    ).toBeVisible();
  });

  test("department admin can open members and add/remove participant", async ({ page }) => {
    const project = await createProjectForMembersUiTest();
    const viewerUser = await prisma.user.findUniqueOrThrow({
      where: { email: viewer.email },
      select: { id: true },
    });

    await prisma.projectMember.deleteMany({
      where: {
        projectId: project.id,
        userId: viewerUser.id,
      },
    });

    await login(page, departmentAdmin);
    await page.goto("/projects");

    await page
      .getByTestId(`project-members-button-${project.id}`)
      .click();

    await expect(page.getByRole("heading", { name: "Участники проекта" })).toBeVisible();
    await expect(page.getByText(`${project.name} · IT Department`)).toBeVisible();

    await page.selectOption("#project-member-candidate", viewerUser.id);
    await page.getByRole("button", { name: "Добавить", exact: true }).click();

    await expect(page.locator("tbody tr", { hasText: viewer.email })).toHaveCount(1);

    const createdMember = await prisma.projectMember.findUniqueOrThrow({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: viewerUser.id,
        },
      },
      select: { id: true },
    });
    createdProjectMemberIds.push(createdMember.id);

    page.on("dialog", (dialog) => dialog.accept());
    await page
      .locator("tr", { hasText: viewer.email })
      .getByRole("button", { name: "Удалить" })
      .click();

    await expect(page.locator("tbody tr", { hasText: viewer.email })).toHaveCount(0);
  });

  test("cancel member removal does not call API", async ({ page }) => {
    const project = await createProjectForMembersUiTest();
    const viewerUser = await prisma.user.findUniqueOrThrow({
      where: { email: viewer.email },
      select: { id: true },
    });

    const existingMember = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: viewerUser.id,
        },
      },
      update: {},
      create: {
        projectId: project.id,
        userId: viewerUser.id,
      },
      select: { id: true },
    });
    createdProjectMemberIds.push(existingMember.id);

    await login(page, departmentAdmin);
    await page.goto("/projects");
    await page
      .getByTestId(`project-members-button-${project.id}`)
      .click();

    let deleteRequestsCount = 0;
    await page.route(`**/api/projects/${project.id}/members/*`, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteRequestsCount += 1;
      }

      await route.continue();
    });

    page.on("dialog", (dialog) => dialog.dismiss());
    await page
      .locator("tr", { hasText: viewer.email })
      .getByRole("button", { name: "Удалить" })
      .click();

    await expect.poll(() => deleteRequestsCount).toBe(0);

    await prisma.projectMember.deleteMany({
      where: {
        projectId: project.id,
        userId: viewerUser.id,
      },
    });
  });

  test("shows API error for failed member add", async ({ page }) => {
    const project = await createProjectForMembersUiTest();
    const viewerUser = await prisma.user.findUniqueOrThrow({
      where: { email: viewer.email },
      select: { id: true },
    });

    await prisma.projectMember.deleteMany({
      where: {
        projectId: project.id,
        userId: viewerUser.id,
      },
    });

    await login(page, departmentAdmin);
    await page.goto("/projects");
    await page
      .getByTestId(`project-members-button-${project.id}`)
      .click();

    await page.route(`**/api/projects/${project.id}/members`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "User is already a member of this project.",
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.selectOption("#project-member-candidate", viewerUser.id);
    await page.getByRole("button", { name: "Добавить", exact: true }).click();

    await expect(page.getByText("User is already a member of this project.")).toBeVisible();
  });

  test("manager can view members but cannot manage them", async ({ page }) => {
    await login(page, manager);
    await page.goto("/projects");
    await page
      .getByTestId("project-members-button-seed-project-internal-systems")
      .click();

    await expect(page.getByRole("heading", { name: "Участники проекта" })).toBeVisible();
    await expect(
      page.getByText("Управление составом проекта недоступно для вашей роли."),
    ).toBeVisible();
    await expect(page.locator("#project-member-candidate")).toHaveCount(0);
  });

  test("department admin cannot access members from another department", async ({ page }) => {
    await login(page, departmentAdmin);

    const membersResponse = await page.request.get(
      "/api/projects/seed-project-analytics-platform/members",
    );
    expect(membersResponse.status()).toBe(403);

    const candidatesResponse = await page.request.get(
      "/api/projects/seed-project-analytics-platform/members/candidates",
    );
    expect(candidatesResponse.status()).toBe(403);
  });
});
