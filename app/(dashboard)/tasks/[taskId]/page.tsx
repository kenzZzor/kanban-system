import { redirect } from "next/navigation";

import { TaskDetailsClient } from "@/components/tasks/TaskDetailsClient";
import { getCurrentUser } from "@/lib/auth/current-user";

interface TaskDetailsPageProps {
  params: Promise<{
    taskId: string;
  }>;
}

export default async function TaskDetailsPage({ params }: TaskDetailsPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { taskId } = await params;

  return <TaskDetailsClient taskId={taskId} />;
}
