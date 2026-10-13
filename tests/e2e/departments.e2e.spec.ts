import { expect, test } from "@playwright/test";

const adminUser = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const employeeUser = {
  email: "charlie.employee@kanban.local",
  password: "DevOnly123!",
};

test.describe("Departments E2E", () => {
  test("system admin can see departments and create one", async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('input[type="email"]', adminUser.email);
    await page.fill('input[type="password"]', adminUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Go to departments
    await page.click('a:has-text("Департаменты")');
    await expect(page).toHaveURL("/departments");
    await expect(page.locator("h1")).toContainText("Подразделения");

    // Check if create button is visible
    const createBtn = page.locator('button:has-text("Создать подразделение")');
    await expect(createBtn).toBeVisible();

    // Create new department
    const deptName = `Test Dept ${Date.now()}`;
    await createBtn.click();
    await expect(page.locator("h2")).toContainText("Новое подразделение");

    await page.fill('input[placeholder="Например, Отдел разработки"]', deptName);
    await page.fill('textarea[placeholder="Краткое описание деятельности..."]', "Test Description");
    await page.click('button[type="submit"]:has-text("Создать")');

    // Verify modal closed and dept appears in list
    await expect(page.locator("h2")).not.toBeVisible();
    await expect(page.locator("table")).toContainText(deptName);
  });

  test("employee can see their departments but cannot create", async ({ page }) => {
    // Login as employee
    await page.goto("/login");
    await page.fill('input[type="email"]', employeeUser.email);
    await page.fill('input[type="password"]', employeeUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // Go to departments
    await page.click('a:has-text("Департаменты")');
    await expect(page).toHaveURL("/departments");

    // Check if create button is HIDDEN
    const createBtn = page.locator('button:has-text("Создать подразделение")');
    await expect(createBtn).not.toBeVisible();

    // Verify list is visible (employee 1 should have memberships from seed)
    await expect(page.locator("table")).toBeVisible();
  });

  test("validation works in create modal", async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('input[type="email"]', adminUser.email);
    await page.fill('input[type="password"]', adminUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    await page.goto("/departments");
    await expect(page).toHaveURL("/departments");
    await page.click('button:has-text("Создать подразделение")');

    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Создать")');

    // Check for validation message
    await expect(page.locator("text=Название подразделения обязательно")).toBeVisible();
  });
});
