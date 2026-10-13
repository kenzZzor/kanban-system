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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

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

      router.push(data.passwordChangeRequired ? "/change-password" : "/");
      router.refresh();
    } catch {
      setError("Ошибка сети. Проверьте соединение.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm p-8 bg-surface rounded-2xl shadow-sm border border-border">
      <h1 className="text-2xl font-semibold mb-8 text-center text-text-primary">Вход в систему</h1>
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full px-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-white"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2" htmlFor="password">
            Пароль
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={isPasswordVisible ? "text" : "password"}
              required
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 pr-12 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              aria-label={isPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              className="absolute inset-y-1 right-1 inline-flex w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
              >
                {isPasswordVisible ? (
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
        </div>
        {error && <p className="text-danger text-sm font-medium">{error}</p>}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-all font-semibold shadow-sm active:transform active:scale-[0.98]"
        >
          {isLoading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
