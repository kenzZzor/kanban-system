import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <Sidebar user={user} />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
