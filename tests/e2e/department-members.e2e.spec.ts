import { expect, test } from "@playwright/test";

const adminUser = {
  email: "system.admin@kanban.local",
  password: "DevOnly123!",
};

const employeeUser = {
  email: "alice.manager@kanban.local", // Alice is a manager in Alpha
  password: "DevOnly123!",
};

test.describe("Department Members E2E (Slice 2B)", () => {
  test("system admin can manage members", async ({ page }) => {
    // 1. Login as admin
    await page.goto("/login");
    await page.fill('input[type="email"]', adminUser.email);
    await page.fill('input[type="password"]', adminUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");

    // 2. Go to departments and select one (e.g., IT Department)
    await page.goto("/departments", { waitUntil: "networkidle" });
    await expect(page.locator("table")).toContainText("IT Department");
    // Click "Управление" in the IT Department row
    await page.locator('tr').filter({ hasText: "IT Department" }).locator('a:has-text("Управление")').click();

    await expect(page.locator("h1")).toContainText("IT Department");
    await expect(page.locator("h2")).toContainText("Участники");

    // 3. Add a member
    await page.click('button:has-text("Добавить участника")');
    await expect(page.locator("h3")).toContainText("Добавить участника");

    // Wait for the select to be enabled and contain the expected option
    await expect(page.locator("#user-select")).toBeEnabled({ timeout: 10000 });
    // Pick a user who is not in IT (Grace is employee in Analytics)
    await expect(page.locator("#user-select")).toContainText("Grace", { timeout: 10000 });

    await page.selectOption("#user-select", { label: "Employee Grace (grace.employee@kanban.local)" });
    await page.selectOption("#role-select", { label: "Сотрудник" });
    await page.click('button[type="submit"]:has-text("Добавить")');

    // 4. Verify member added
    await expect(page.locator("table")).toContainText("Employee Grace");

    // 5. Change role
    const graceRow = page.locator('tr').filter({ hasText: "Employee Grace" });
    await graceRow.locator('button:has-text("Изменить")').click();
    await expect(page.locator("h3")).toContainText("Изменить участника");

    await page.selectOption("#edit-role-select", { label: "Менеджер" });
    await page.click('button[type="submit"]:has-text("Сохранить")');

    // Verify role changed
    await expect(graceRow).toContainText("Менеджер");

    // 6. Delete member
    page.on('dialog', dialog => dialog.accept());
    await graceRow.locator('button:has-text("Удалить")').click();

    // Verify member removed
    await expect(page.locator("table")).not.toContainText("Employee Grace");
  });

  test("viewer cannot see manage buttons", async ({ page }) => {
    // Diana Viewer is viewer in IT Department
    await page.goto("/login");
    await page.fill('input[type="email"]', "diana.viewer@kanban.local");
    await page.fill('input[type="password"]', "DevOnly123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/"); // Wait for redirect to dashboard

    await page.goto("/departments", { waitUntil: "networkidle" });

    // Check if table is loaded (using h1 or specific text)
    await expect(page.locator("h1")).toContainText("Подразделения");

    // Click "Управление" in the IT Department row
    await page.locator('tr').filter({ hasText: "IT Department" }).locator('a:has-text("Управление")').click();

    // Check that "Добавить участника" is NOT visible
    await expect(page.locator('button:has-text("Добавить участника")')).not.toBeVisible();
    // Check that "Изменить" / "Удалить" in table are NOT visible
    await expect(page.locator('button:has-text("Изменить")')).not.toBeVisible();
  });
});
