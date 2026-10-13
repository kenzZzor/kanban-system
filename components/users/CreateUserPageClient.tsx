"use client";

import { useState } from "react";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email."),
  firstName: z
    .string()
    .trim()
    .min(1, "Имя обязательно.")
    .max(100, "Имя должно быть не длиннее 100 символов."),
  lastName: z
    .string()
    .trim()
    .min(1, "Фамилия обязательна.")
    .max(100, "Фамилия должна быть не длиннее 100 символов."),
  middleName: z
    .string()
    .trim()
    .max(100, "Отчество должно быть не длиннее 100 символов.")
    .optional(),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof createUserSchema>, string>>;

interface CreatedUserResult {
  user: {
    email: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
  };
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
}

function getApiErrorMessage(status: number, message?: string) {
  if (status === 409) {
    return "Пользователь с таким email уже существует.";
  }

  if (status === 403) {
    return "У вас нет прав для создания глобальных учётных записей.";
  }

  return message || "Не удалось создать учётную запись.";
}

export function CreateUserPageClient() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<CreatedUserResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setCreatedUser(null);
    setCopyMessage(null);

    const parsed = createUserSchema.safeParse({
      email,
      firstName,
      lastName,
      middleName,
    });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email?.[0],
        firstName: errors.firstName?.[0],
        lastName: errors.lastName?.[0],
        middleName: errors.middleName?.[0],
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.code === "VALIDATION_ERROR") {
          const details = result.error.details || {};
          setFieldErrors({
            email: details.email?.[0],
            firstName: details.firstName?.[0],
            lastName: details.lastName?.[0],
            middleName: details.middleName?.[0],
          });
          setError("Проверьте данные формы.");
        } else {
          setError(getApiErrorMessage(response.status, result.error?.message));
        }
        return;
      }

      setCreatedUser({
        user: result.user,
        temporaryPassword: result.temporaryPassword,
        temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt,
      });
      setEmail("");
      setFirstName("");
      setLastName("");
      setMiddleName("");
    } catch {
      setError("Ошибка сети. Проверьте соединение и повторите попытку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyTemporaryPassword() {
    if (!createdUser) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdUser.temporaryPassword);
      setCopyMessage("Пароль скопирован.");
    } catch {
      setCopyMessage("Не удалось скопировать пароль.");
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary dark:text-zinc-50">
          Создание аккаунта
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-secondary dark:text-zinc-400">
          Создайте глобальную учётную запись. Роли в подразделениях назначаются
          отдельно после создания пользователя.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm dark:border-zinc-800 dark:bg-black">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-text-secondary dark:text-zinc-300"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                    fieldErrors.email ? "border-danger" : "border-border dark:border-zinc-700"
                  }`}
                  placeholder="user@company.kz"
                />
                {fieldErrors.email && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="mb-2 block text-sm font-semibold text-text-secondary dark:text-zinc-300"
                >
                  Фамилия
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                    fieldErrors.lastName ? "border-danger" : "border-border dark:border-zinc-700"
                  }`}
                />
                {fieldErrors.lastName && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="firstName"
                  className="mb-2 block text-sm font-semibold text-text-secondary dark:text-zinc-300"
                >
                  Имя
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                    fieldErrors.firstName ? "border-danger" : "border-border dark:border-zinc-700"
                  }`}
                />
                {fieldErrors.firstName && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="middleName"
                  className="mb-2 block text-sm font-semibold text-text-secondary dark:text-zinc-300"
                >
                  Отчество
                </label>
                <input
                  id="middleName"
                  name="middleName"
                  type="text"
                  value={middleName}
                  onChange={(event) => setMiddleName(event.target.value)}
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                    fieldErrors.middleName ? "border-danger" : "border-border dark:border-zinc-700"
                  }`}
                />
                {fieldErrors.middleName && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.middleName}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-danger/10 bg-danger/5 p-4">
                <p className="text-sm font-medium text-danger">{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-w-44 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Создание..." : "Создать аккаунт"}
              </button>
            </div>
          </form>
        </div>

        <aside className="rounded-2xl border border-border bg-surface p-6 shadow-sm dark:border-zinc-800 dark:bg-black">
          <h2 className="text-base font-semibold text-text-primary dark:text-zinc-50">
            Доступ при первом входе
          </h2>
          <p className="mt-3 text-sm leading-6 text-text-secondary dark:text-zinc-400">
            После создания система покажет временный пароль один раз. Он
            действует 24 часа, а пользователь обязан сменить его при первом
            входе.
          </p>
        </aside>
      </div>

      {createdUser && (
        <div className="rounded-2xl border border-success/20 bg-success/5 p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-success">
                Аккаунт создан
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                {createdUser.user.email}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                Передайте временный пароль пользователю защищённым способом.
                Пароль действует 24 часа и будет запрошен только для смены на
                постоянный при первом входе.
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-surface p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-disabled">
                Временный пароль
              </p>
              <div className="flex min-w-0 items-center gap-3">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-subtle px-3 py-2 text-sm font-semibold text-text-primary">
                  {createdUser.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={copyTemporaryPassword}
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary"
                >
                  Копировать
                </button>
              </div>
              <p className="mt-3 text-xs text-text-secondary">
                Действует до{" "}
                {new Intl.DateTimeFormat("ru-RU", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(createdUser.temporaryPasswordExpiresAt))}
                .
              </p>
              {copyMessage && (
                <p className="mt-2 text-xs font-medium text-text-secondary">
                  {copyMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
