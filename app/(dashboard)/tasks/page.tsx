import { redirect } from "next/navigation";

import { TasksPageClient } from "@/components/tasks/TasksPageClient";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canCreateTasks, canReadTasks } from "@/lib/services/tasks";

export default async function TasksPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [canRead, canCreate] = await Promise.all([
    canReadTasks(user.id),
    canCreateTasks(user.id),
  ]);

  return (
    <TasksPageClient
      canReadTasks={canRead}
      canCreateTasks={canCreate}
    />
  );
}
