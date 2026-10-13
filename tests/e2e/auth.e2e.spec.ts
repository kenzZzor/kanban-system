import { expect, test } from "@playwright/test";

const testUser = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
  firstName: "System",
  lastName: "Administrator",
};

test.describe("Authentication E2E", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator("h1")).toContainText("Вход в систему");
  });

  test("user can login and see dashboard with their name", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/");
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("aside")).toContainText(`${testUser.firstName} ${testUser.lastName}`);
  });

  test("login password visibility can be toggled without clearing input", async ({
    page,
  }) => {
    await page.goto("/login");

    const passwordInput = page.locator("#password");
    await expect(passwordInput).toHaveAttribute("type", "password");

    await passwordInput.fill(testUser.password);
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await expect(passwordInput).toHaveValue(testUser.password);

    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
    await expect(passwordInput).toHaveValue(testUser.password);
  });

  test("authenticated user is redirected from login to dashboard", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Try to go to login again
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });

  test("user can logout", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Logout
    await page.click('button:has-text("Выйти")');
    await expect(page).toHaveURL(/.*\/login/);

    // Verify cannot access dashboard
    await page.goto("/");
    await expect(page).toHaveURL(/.*\/login/);
  });
});
