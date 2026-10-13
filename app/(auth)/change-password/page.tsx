import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.passwordMustChange) {
    redirect("/");
  }

  const temporaryPasswordExpired =
    user.temporaryPasswordExpiresAt === null ||
    user.temporaryPasswordExpiresAt <= new Date();

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg p-4">
      {temporaryPasswordExpired ? (
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-danger">
            Временный пароль истёк
          </p>
          <h1 className="text-2xl font-semibold text-text-primary">
            Обратитесь к системному администратору
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Срок действия временного пароля составляет 24 часа. Для входа
            нужен новый временный пароль.
          </p>
        </div>
      ) : (
        <ChangePasswordForm />
      )}
    </div>
  );
}
