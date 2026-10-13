"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите временный пароль"),
    newPassword: z
      .string()
      .min(
        8,
        "Пароль должен содержать минимум 8 символов, одну заглавную латинскую букву (A-Z) и одну цифру (0-9).",
      )
      .max(128, "Новый пароль должен быть не длиннее 128 символов")
      .regex(
        /[A-Z]/,
        "Пароль должен содержать минимум 8 символов, одну заглавную латинскую букву (A-Z) и одну цифру (0-9).",
      )
      .regex(
        /[0-9]/,
        "Пароль должен содержать минимум 8 символов, одну заглавную латинскую букву (A-Z) и одну цифру (0-9).",
      ),
    confirmPassword: z.string().min(1, "Повторите новый пароль"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  function togglePasswordVisibility(field: keyof typeof visiblePasswords) {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    };

    const result = changePasswordSchema.safeParse(payload);

    if (!result.success) {
      setError(result.error.issues[0].message);
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: result.data.currentPassword,
          newPassword: result.data.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError(
            data.error?.message ||
              "Временный пароль неверен или срок его действия истёк.",
          );
        } else if (data.error?.code === "VALIDATION_ERROR") {
          setError(data.error.message || "Проверьте новый пароль.");
        } else {
          setError(data.error?.message || "Не удалось сменить пароль.");
        }
        return;
      }

      setSuccess("Пароль изменён. Сейчас откроется рабочая область.");
      router.push("/");
      router.refresh();
    } catch {
      setError("Ошибка сети. Проверьте соединение.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-primary">
          Первый вход
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">
          Смените временный пароль
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Для продолжения работы задайте постоянный пароль. Если временный
          пароль истёк, обратитесь к системному администратору.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="currentPassword"
            className="mb-2 block text-sm font-medium text-text-secondary"
          >
            Временный пароль
          </label>
          <PasswordField
            id="currentPassword"
            name="currentPassword"
            isVisible={visiblePasswords.current}
            disabled={isSubmitting}
            onToggle={() => togglePasswordVisibility("current")}
          />
        </div>

        <div>
          <label
            htmlFor="newPassword"
            className="mb-2 block text-sm font-medium text-text-secondary"
          >
            Новый пароль
          </label>
          <PasswordField
            id="newPassword"
            name="newPassword"
            isVisible={visiblePasswords.new}
            disabled={isSubmitting}
            onToggle={() => togglePasswordVisibility("new")}
          />
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Требования к паролю: минимум 8 символов, одна заглавная латинская
            буква (A-Z) и одна цифра (0-9).
          </p>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-2 block text-sm font-medium text-text-secondary"
          >
            Повторите новый пароль
          </label>
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            isVisible={visiblePasswords.confirm}
            disabled={isSubmitting}
            onToggle={() => togglePasswordVisibility("confirm")}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-danger/10 bg-danger/5 p-4">
            <p className="text-sm font-medium text-danger">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-success/10 bg-success/5 p-4">
            <p className="text-sm font-medium text-success">{success}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-primary px-4 py-2.5 font-semibold text-white shadow-sm transition-all hover:bg-primary-hover disabled:opacity-50"
        >
          {isSubmitting ? "Смена пароля..." : "Сменить пароль"}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  id,
  name,
  isVisible,
  disabled,
  onToggle,
}: {
  id: string;
  name: string;
  isVisible: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={isVisible ? "text" : "password"}
        required
        disabled={disabled}
        className="w-full rounded-xl border border-border bg-white px-4 py-2.5 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary disabled:opacity-60"
      />
      <button
        type="button"
        aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
        onClick={onToggle}
        disabled={disabled}
        className="absolute inset-y-1 right-1 inline-flex w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
        >
          {isVisible ? (
            <>
              <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M10.8 10.8a1.7 1.7 0 0 0 2.4 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M9.5 5.6A9.6 9.6 0 0 1 12 5.25c5 0 8.5 4.75 8.5 6.75a5.2 5.2 0 0 1-1.4 2.65M6.2 7.3C4.5 8.6 3.5 10.5 3.5 12c0 2 3.5 6.75 8.5 6.75 1.4 0 2.7-.38 3.82-.97" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <path d="M3.5 12c0-2 3.5-6.75 8.5-6.75S20.5 10 20.5 12 17 18.75 12 18.75 3.5 14 3.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z" stroke="currentColor" strokeWidth="1.8" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
