import { redirect } from "next/navigation";

import { UsersPageClient } from "@/components/users/UsersPageClient";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export default async function UsersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
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

  if (currentUser?.systemRole?.code !== "SYSTEM_ADMIN") {
    redirect("/");
  }

  return <UsersPageClient />;
}
