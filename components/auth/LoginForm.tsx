"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError("Неверный email или пароль");
        } else {
          setError(data.error?.message || "Произошла ошибка при входе");
        }
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Ошибка сети. Проверьте соединение.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md border border-zinc-200">
      <h1 className="text-2xl font-bold mb-6 text-center text-zinc-900">Вход в систему</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-500"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors font-medium"
        >
          {isLoading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
