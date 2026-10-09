"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserMenuProps {
  user: {
    firstName: string;
    lastName: string;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="mt-auto border-t border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-zinc-900 truncate">
            {user.firstName} {user.lastName}
          </span>
          {error && <span className="text-xs text-red-600 mt-1">{error}</span>}
        </div>
        <button
          onClick={handleLogout}
          disabled={isLoading}
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Выход..." : "Выйти"}
        </button>
      </div>
    </div>
  );
}
