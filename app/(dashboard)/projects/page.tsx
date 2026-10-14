import { redirect } from "next/navigation";

import { ProjectsPageClient } from "@/components/projects/ProjectsPageClient";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canCreateProjects, canReadProjects } from "@/lib/services/projects";

export default async function ProjectsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [canRead, canCreate] = await Promise.all([
    canReadProjects(user.id),
    canCreateProjects(user.id),
  ]);

  return (
    <ProjectsPageClient
      canReadProjects={canRead}
      canCreateProjects={canCreate}
    />
  );
}
