import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/service";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import DepartmentsPageClient from "./DepartmentsPageClient";
import { redirect } from "next/navigation";

export default async function DepartmentsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const canCreate = await hasPermission(
    user.id,
    PERMISSION_CODES.DEPARTMENTS_MANAGE
  );

  return <DepartmentsPageClient canCreate={canCreate} />;
}
