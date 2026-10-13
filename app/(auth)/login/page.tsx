import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user?.passwordMustChange) {
    redirect("/change-password");
  }

  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <LoginForm />
    </div>
  );
}
