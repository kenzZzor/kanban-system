import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Sidebar } from "@/components/layout/Sidebar";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.passwordMustChange) {
    redirect("/change-password");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      systemRole: {
        select: {
          code: true,
        },
      },
    },
  });
  const isSystemAdmin = currentUser?.systemRole?.code === "SYSTEM_ADMIN";

  return (
    <div className="flex h-[100dvh] min-w-0 overflow-hidden bg-app-bg dark:bg-black">
      <Sidebar user={user} isSystemAdmin={isSystemAdmin} />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
