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

const viewer = {
  email: "diana.viewer@kanban.local",
  password: "DevOnly123!",
};

const noProjectAccessUser = {
  email: "former.member@kanban.local",
  password: "DevOnly123!",
};

const createdProjectIds: string[] = [];

function uniqueProjectName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
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
});
