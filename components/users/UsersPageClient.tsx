"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  isActive: boolean;
  passwordMustChange: boolean;
  temporaryPasswordExpiresAt: string | null;
  createdAt: string;
  systemRole: {
    code: string;
    name: string;
  } | null;
}

interface ResetPasswordResult {
  userId: string;
  email: string;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
}

type ActiveAction =
  | {
      userId: string;
      kind: "deactivate" | "reactivate" | "reset";
    }
  | null;

function getErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "Требуется повторный вход в систему.";
  }

  if (status === 403) {
    return "Недостаточно прав для выполнения действия.";
  }

  if (status === 404) {
    return "Учётная запись не найдена. Обновите страницу.";
  }

  if (status === 409) {
    return message || "Операция недоступна из-за конфликта данных.";
  }

  return message || "Не удалось выполнить операцию. Повторите попытку.";
}

function getTemporaryPasswordState(user: UserListItem) {
  if (!user.passwordMustChange) {
    return "Не требуется";
  }

  if (!user.temporaryPasswordExpiresAt) {
    return "Требуется смена пароля";
  }

  const expiresAt = new Date(user.temporaryPasswordExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return "Требуется смена пароля";
  }

  if (expiresAt <= new Date()) {
    return "Временный пароль истёк";
  }

  return `Действует до ${new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(expiresAt)}`;
}

export function UsersPageClient() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [resetResult, setResetResult] = useState<ResetPasswordResult | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setError(null);
    setIsForbidden(false);
    try {
      const response = await fetch("/api/users");
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setIsForbidden(true);
          return;
        }
        throw new Error(getErrorMessage(response.status, result.error?.message));
      }

      setUsers(result.users || []);
    } catch (fetchError: unknown) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Не удалось загрузить список пользователей.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers]);

  async function runStatusAction(user: UserListItem, isActive: boolean) {
    const isDeactivate = !isActive;
    const confirmationText = isDeactivate
      ? `Подтвердите деактивацию аккаунта ${user.email}.`
      : "";

    if (isDeactivate && !confirm(confirmationText)) {
      return;
    }

    setError(null);
    setActiveAction({
      userId: user.id,
      kind: isDeactivate ? "deactivate" : "reactivate",
    });

    try {
      const response = await fetch(`/api/users/${user.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, result.error?.message));
      }

      await fetchUsers();
    } catch (statusError: unknown) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Не удалось обновить статус пользователя.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function runResetPassword(user: UserListItem) {
    if (!confirm(`Сбросить пароль для аккаунта ${user.email}?`)) {
      return;
    }

    setError(null);
    setCopyMessage(null);
    setActiveAction({
      userId: user.id,
      kind: "reset",
    });

    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, result.error?.message));
      }

      setResetResult({
        userId: user.id,
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
        temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt,
      });
      await fetchUsers();
    } catch (resetError: unknown) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Не удалось сбросить пароль пользователя.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!resetResult) {
      return;
    }

    try {
      await navigator.clipboard.writeText(resetResult.temporaryPassword);
      setCopyMessage("Временный пароль скопирован.");
    } catch {
      setCopyMessage("Не удалось скопировать пароль.");
    }
  }

  function closeResetResult() {
    setResetResult(null);
    setCopyMessage(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <div className="text-sm font-medium text-text-secondary">
            Загрузка пользователей...
          </div>
        </div>
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-10 text-center">
        <h1 className="text-xl font-semibold text-text-primary">
          Доступ запрещён
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          У вас нет прав для просмотра глобального списка пользователей.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary dark:text-zinc-50">
            Пользователи
          </h1>
          <p className="mt-1 text-sm text-text-secondary dark:text-zinc-400">
            Глобальные учётные записи и административные операции доступа.
          </p>
        </div>
        <Link
          href="/users/new"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Создать аккаунт
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
          <p className="text-sm font-medium text-danger">{error}</p>
        </div>
      )}

      {resetResult && (
        <div className="rounded-2xl border border-success/20 bg-success/5 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-success">Пароль сброшен</p>
              <p className="text-sm text-text-primary">
                Временный пароль для <span className="font-semibold">{resetResult.email}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-surface-subtle px-3 py-2 text-sm font-semibold text-text-primary">
                  {resetResult.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={copyTemporaryPassword}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary"
                >
                  Копировать
                </button>
              </div>
              <p className="text-xs text-text-secondary">
                Пароль показан только для этой операции. Передайте его пользователю
                безопасным способом. Действует до{" "}
                {new Intl.DateTimeFormat("ru-RU", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(resetResult.temporaryPasswordExpiresAt))}
                .
              </p>
              {copyMessage && (
                <p className="text-xs font-medium text-text-secondary">{copyMessage}</p>
              )}
            </div>
            <button
              type="button"
              onClick={closeResetResult}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {users.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-text-secondary">
              Пользователи не найдены.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-subtle/20">
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Email
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Статус
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Системная роль
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Создан
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Временный пароль
                  </th>
                  <th className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const rowBusy = activeAction?.userId === user.id;
                  const statusBusy = rowBusy
                    && (activeAction.kind === "deactivate" || activeAction.kind === "reactivate");
                  const resetBusy = rowBusy && activeAction.kind === "reset";

                  return (
                    <tr key={user.id} data-testid={`user-row-${user.id}`} className="hover:bg-surface-subtle/40">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-text-primary">
                            {user.email}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {user.lastName} {user.firstName}
                            {user.middleName ? ` ${user.middleName}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${
                            user.isActive
                              ? "border border-success/20 bg-success/10 text-success"
                              : "border border-border bg-surface-subtle text-text-secondary"
                          }`}
                        >
                          {user.isActive ? "Активен" : "Неактивен"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {user.systemRole?.name || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {new Intl.DateTimeFormat("ru-RU", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(user.createdAt))}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {getTemporaryPasswordState(user)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => runStatusAction(user, !user.isActive)}
                            disabled={rowBusy}
                            className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              user.isActive
                                ? "border-danger/20 bg-danger/5 text-danger hover:border-danger/30 hover:bg-danger/10"
                                : "border-border bg-surface text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                            }`}
                          >
                            {statusBusy
                              ? "..."
                              : user.isActive
                                ? "Деактивировать"
                                : "Реактивировать"}
                          </button>
                          <button
                            type="button"
                            onClick={() => runResetPassword(user)}
                            disabled={rowBusy}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {resetBusy ? "..." : "Сбросить пароль"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
