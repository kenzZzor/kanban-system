import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/db";

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const departmentAdmin = {
  email: "alice.admin@kanban.local",
  password: "DevOnly123!",
};

const createdEmails: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}@kanban.local`;
}

async function login(page: import("@playwright/test").Page, user = systemAdmin) {
  await page.goto("/login");
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
}

async function fillCreateUserForm(page: import("@playwright/test").Page, email: string) {
  await page.fill("#email", email);
  await page.fill("#lastName", "Тестов");
  await page.fill("#firstName", "Аккаунт");
  await page.fill("#middleName", "Системный");
}

test.afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: createdEmails } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  await prisma.session.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.activityLog.deleteMany({
    where: {
      entityType: "User",
      entityId: { in: userIds },
    },
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  });
  await prisma.$disconnect();
});

test.describe("Create global user UI", () => {
  test("system admin sees navigation link and creates a real account", async ({
    page,
  }) => {
    const email = uniqueEmail("ui.created");
    createdEmails.push(email);

    await login(page);

    const navLink = page.getByRole("link", { name: "Создать аккаунт" }).first();
    await expect(navLink).toBeVisible();
    await navLink.click();

    await expect(page).toHaveURL("/users/new");
    await expect(page.getByRole("heading", { name: "Создание аккаунта" }))
      .toBeVisible();

    await fillCreateUserForm(page, email);
    await page.getByRole("button", { name: "Создать аккаунт" }).click();

    await expect(page.getByText("Аккаунт создан")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Временный пароль", { exact: true }))
      .toBeVisible();
    await expect(page.locator("code")).toHaveText(/^[A-Za-z0-9_-]{20,}$/);

    const savedUser = await prisma.user.findUnique({
      where: { email },
      select: {
        passwordMustChange: true,
        temporaryPasswordExpiresAt: true,
        systemRoleId: true,
        memberships: { select: { id: true } },
      },
    });

    expect(savedUser).not.toBeNull();
    expect(savedUser?.passwordMustChange).toBe(true);
    expect(savedUser?.temporaryPasswordExpiresAt).not.toBeNull();
    expect(savedUser?.systemRoleId).toBeNull();
    expect(savedUser?.memberships).toHaveLength(0);
  });

  test("non-system-admin does not see link and cannot open page", async ({
    page,
  }) => {
    await login(page, departmentAdmin);

    await expect(page.getByRole("link", { name: "Создать аккаунт" }))
      .toHaveCount(0);

    await page.goto("/users/new");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Создание аккаунта" }))
      .toHaveCount(0);
  });

  test("shows validation and duplicate email errors", async ({ page }) => {
    const email = uniqueEmail("ui.duplicate");
    createdEmails.push(email);

    await login(page);
    await page.goto("/users/new");

    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page.getByText("Введите корректный email.")).toBeVisible();
    await expect(page.getByText("Имя обязательно.")).toBeVisible();
    await expect(page.getByText("Фамилия обязательна.")).toBeVisible();

    await fillCreateUserForm(page, email);
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page.getByText("Аккаунт создан")).toBeVisible();

    await fillCreateUserForm(page, email);
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page.getByText("Пользователь с таким email уже существует."))
      .toBeVisible();
  });

  test("disables repeated submit while creation request is in flight", async ({
    page,
  }) => {
    const email = uniqueEmail("ui.pending");
    createdEmails.push(email);

    await page.route("**/api/users", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await route.continue();
    });

    await login(page);
    await page.goto("/users/new");
    await fillCreateUserForm(page, email);

    const submitButton = page.getByRole("button", { name: "Создать аккаунт" });
    await submitButton.click();
    await expect(page.getByRole("button", { name: "Создание..." }))
      .toBeDisabled();
    await expect(page.getByText("Аккаунт создан")).toBeVisible();
  });
});
