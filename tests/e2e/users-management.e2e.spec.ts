import { expect, request as playwrightRequest, test } from "@playwright/test";

import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";

const systemAdmin = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@kanban.local`;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', systemAdmin.email);
  await page.fill('input[type="password"]', systemAdmin.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
}

async function createDirectUser({
  email = uniqueEmail("ui.users"),
  password = "DevOnly123!",
  isActive = true,
}: {
  email?: string;
  password?: string;
  isActive?: boolean;
} = {}) {
  const user = await prisma.user.create({
    data: {
      email,
      firstName: "UI",
      lastName: "Lifecycle",
      passwordHash: await hashPassword(password),
      systemRoleId: null,
      isActive,
      passwordMustChange: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
    },
  });

  createdUserIds.push(user.id);
  return {
    ...user,
    password,
  };
}

test.afterAll(async () => {
  await prisma.session.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        {
          entityType: "User",
          entityId: { in: createdUserIds },
        },
        {
          actorId: { in: createdUserIds },
        },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: { id: { in: createdUserIds } },
  });
  await prisma.$disconnect();
});

test.describe("Users management UI", () => {
  test("system admin can open /users", async ({ page }) => {
    await login(page);
    await page.goto("/users");
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Пользователи" })).toBeVisible();
  });

  test("deactivation and reactivation update status only after successful response", async ({
    page,
  }) => {
    const target = await createDirectUser({
      email: uniqueEmail("ui.status.target"),
    });

    await page.route(`**/api/users/${target.id}/status`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await login(page);
    await page.goto("/users");

    const row = page.locator("tr", { hasText: target.email });
    await expect(row).toContainText("Активен");

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Деактивировать" }).click();

    await expect(row).toContainText("Активен");
    await expect(row.getByRole("button", { name: "..." })).toBeDisabled();
    await expect(row).toContainText("Неактивен");

    await row.getByRole("button", { name: "Реактивировать" }).click();
    await expect(row).toContainText("Активен");
  });

  test("reset password shows temporary password, allows copy, and clears after close", async ({
    page,
    context,
  }) => {
    const target = await createDirectUser({
      email: uniqueEmail("ui.reset.target"),
    });

    await context.grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin: "http://localhost:3000" },
    );

    await login(page);
    await page.goto("/users");

    const row = page.locator("tr", { hasText: target.email });
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Сбросить пароль" }).click();

    await expect(page.getByText("Пароль сброшен")).toBeVisible();
    const passwordCode = page.locator("code");
    await expect(passwordCode).toBeVisible();
    await expect(passwordCode).toHaveText(/^[A-Za-z0-9_-]{20,}$/);

    await page.getByRole("button", { name: "Копировать" }).click();
    await expect(page.getByText("Временный пароль скопирован.")).toBeVisible();

    await page.getByRole("button", { name: "Закрыть" }).click();
    await expect(page.getByText("Пароль сброшен")).toHaveCount(0);
  });

  test("cancel confirmation does not call deactivation API", async ({ page }) => {
    const target = await createDirectUser({
      email: uniqueEmail("ui.cancel.target"),
    });

    let statusCalls = 0;
    await page.route(`**/api/users/${target.id}/status`, async (route) => {
      statusCalls += 1;
      await route.continue();
    });

    await login(page);
    await page.goto("/users");

    const row = page.locator("tr", { hasText: target.email });
    await expect(row).toContainText("Активен");

    page.once("dialog", (dialog) => dialog.dismiss());
    await row.getByRole("button", { name: "Деактивировать" }).click();

    await expect.poll(() => statusCalls).toBe(0);
    await expect(row).toContainText("Активен");
  });

  test("shows API errors for status and reset operations", async ({ page }) => {
    const target = await createDirectUser({
      email: uniqueEmail("ui.error.target"),
    });

    await page.route(`**/api/users/${target.id}/status`, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "CONFLICT",
            message: "Cannot deactivate the last active system administrator.",
          },
        }),
      });
    });

    await page.route(`**/api/users/${target.id}/reset-password`, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "CONFLICT",
            message: "User account data changed concurrently. Refresh and try again.",
          },
        }),
      });
    });

    await login(page);
    await page.goto("/users");

    const row = page.locator("tr", { hasText: target.email });

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Деактивировать" }).click();
    await expect(
      page.getByText("Cannot deactivate the last active system administrator."),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Сбросить пароль" }).click();
    await expect(
      page.getByText("User account data changed concurrently. Refresh and try again."),
    ).toBeVisible();
  });

  test("deactivation via UI revokes existing target user session", async ({ page }) => {
    const target = await createDirectUser({
      email: uniqueEmail("ui.session.target"),
    });

    const targetContext = await playwrightRequest.newContext({
      baseURL: "http://localhost:3000",
    });

    try {
      const targetLoginResponse = await targetContext.post("/api/auth/login", {
        data: {
          email: target.email,
          password: target.password,
        },
      });
      expect(targetLoginResponse.status()).toBe(200);

      const targetProtectedBefore = await targetContext.get("/api/departments");
      expect(targetProtectedBefore.status()).toBe(200);

      await login(page);
      await page.goto("/users");
      const row = page.locator("tr", { hasText: target.email });
      page.once("dialog", (dialog) => dialog.accept());
      await row.getByRole("button", { name: "Деактивировать" }).click();
      await expect(row).toContainText("Неактивен");

      const targetProtectedAfter = await targetContext.get("/api/departments");
      expect(targetProtectedAfter.status()).toBe(401);
    } finally {
      await targetContext.dispose();
    }
  });
});
