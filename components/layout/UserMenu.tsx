"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserMenuProps {
  user: {
    firstName: string;
    lastName: string;
    email?: string;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const initials = [user.firstName, user.lastName]
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleLogout() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Не удалось выйти из системы");
      }

      router.push("/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при выходе");
      setIsLoading(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-sm font-semibold text-text-primary">
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-primary">
            {fullName || "Пользователь"}
          </span>
          <span className="block truncate text-xs text-text-secondary">
            {user.email || "Активная сессия"}
          </span>
          {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoading}
          className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Выход..." : "Выйти"}
        </button>
      </div>
    </div>
  );
}
