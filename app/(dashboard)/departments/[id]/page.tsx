import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/service";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import DepartmentDetailsClient from "./DepartmentDetailsClient";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function DepartmentPage({ params }: PageProps) {
  const user = await getCurrentUser();
  const { id: departmentId } = await params;

  if (!user) {
    redirect("/login");
  }

  const canReadMembers = await hasPermission(
    user.id,
    PERMISSION_CODES.MEMBERS_READ,
    departmentId
  );

  if (!canReadMembers) {
    // Если нет прав даже на чтение участников, возможно, нет доступа к департаменту
    // Но мы также проверяем DEPARTMENTS_READ внутри API.
    // Для простоты, если нет прав, перенаправляем или показываем ошибку.
    // Но лучше позволить клиенту обработать 403 от API для единообразия.
  }

  const canManageMembers = await hasPermission(
    user.id,
    PERMISSION_CODES.MEMBERS_MANAGE,
    departmentId
  );

  return (
    <DepartmentDetailsClient
      departmentId={departmentId}
      canManageMembers={canManageMembers}
    />
  );
}
