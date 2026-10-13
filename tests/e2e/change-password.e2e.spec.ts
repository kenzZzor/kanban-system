import { expect, test } from "@playwright/test";

import { hashPassword } from "../../lib/auth/password";
import { prisma } from "../../lib/db";

const createdUserIds: string[] = [];

function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}@kanban.local`;
}

async function createTemporaryUser(temporaryPassword = "Temp1234") {
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail("change.password.ui"),
      firstName: "Change",
      lastName: "Password",
      passwordHash: await hashPassword(temporaryPassword),
      passwordMustChange: true,
      temporaryPasswordExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      passwordChangedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
    },
  });
  createdUserIds.push(user.id);

  return {
    ...user,
    temporaryPassword,
  };
}

test.afterAll(async () => {
  await prisma.session.deleteMany({
    where: { userId: { in: createdUserIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: createdUserIds } },
  });
  await prisma.$disconnect();
});

test.describe("Required password change UI", () => {
  test("password fields toggle visibility without clearing values", async ({
    page,
  }) => {
    const user = await createTemporaryUser();

    await page.goto("/login");
    await page.fill("#email", user.email);
    await page.fill("#password", user.temporaryPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/change-password");

    await expect(page.getByText("Требования к паролю: минимум 8 символов"))
      .toBeVisible();

    const currentPasswordInput = page.locator("#currentPassword");
    const newPasswordInput = page.locator("#newPassword");
    const confirmPasswordInput = page.locator("#confirmPassword");

    await currentPasswordInput.fill(user.temporaryPassword);
    await newPasswordInput.fill("Pass1234");
    await confirmPasswordInput.fill("Pass1234");

    await expect(currentPasswordInput).toHaveAttribute("type", "password");
    await expect(newPasswordInput).toHaveAttribute("type", "password");
    await expect(confirmPasswordInput).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Показать пароль" }).nth(0).click();
    await page.getByRole("button", { name: "Показать пароль" }).nth(0).click();
    await page.getByRole("button", { name: "Показать пароль" }).nth(0).click();

    await expect(currentPasswordInput).toHaveAttribute("type", "text");
    await expect(newPasswordInput).toHaveAttribute("type", "text");
    await expect(confirmPasswordInput).toHaveAttribute("type", "text");
    await expect(currentPasswordInput).toHaveValue(user.temporaryPassword);
    await expect(newPasswordInput).toHaveValue("Pass1234");
    await expect(confirmPasswordInput).toHaveValue("Pass1234");

    await page.getByRole("button", { name: "Скрыть пароль" }).nth(0).click();
    await expect(currentPasswordInput).toHaveAttribute("type", "password");
    await expect(currentPasswordInput).toHaveValue(user.temporaryPassword);
  });

  test("accepts an 8-character password with uppercase letter and digit", async ({
    page,
  }) => {
    const user = await createTemporaryUser();

    await page.goto("/login");
    await page.fill("#email", user.email);
    await page.fill("#password", user.temporaryPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/change-password");

    await page.fill("#currentPassword", user.temporaryPassword);
    await page.fill("#newPassword", "Pass1234");
    await page.fill("#confirmPassword", "Pass1234");
    await page.click('button[type="submit"]:has-text("Сменить пароль")');

    await expect(page).toHaveURL("/");
  });

  test("shows password policy errors before submitting invalid passwords", async ({
    page,
  }) => {
    const user = await createTemporaryUser();

    await page.goto("/login");
    await page.fill("#email", user.email);
    await page.fill("#password", user.temporaryPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/change-password");

    await page.fill("#currentPassword", user.temporaryPassword);
    await page.fill("#newPassword", "password1");
    await page.fill("#confirmPassword", "password1");
    await page.click('button[type="submit"]:has-text("Сменить пароль")');

    await expect(
      page.getByText(
        "Пароль должен содержать минимум 8 символов, одну заглавную латинскую букву (A-Z) и одну цифру (0-9).",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL("/change-password");
  });
});
