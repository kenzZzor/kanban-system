"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { MemberList } from "@/components/departments/members/MemberList";
import { AddMemberModal } from "@/components/departments/members/AddMemberModal";

interface Department {
  id: string;
  name: string;
  description: string | null;
}

interface DepartmentDetailsClientProps {
  departmentId: string;
  canManageMembers: boolean;
}

export default function DepartmentDetailsClient({
  departmentId,
  canManageMembers,
}: DepartmentDetailsClientProps) {
  const [department, setDepartment] = useState<Department | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchDepartment = useCallback(async () => {
    try {
      const response = await fetch(`/api/departments/${departmentId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Не удалось загрузить данные подразделения");
      }

      setDepartment(data.department);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDepartment();
  }, [fetchDepartment, refreshTrigger]);

  const handleMemberChange = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-border dark:bg-zinc-800 rounded-lg"></div>
          <div className="h-10 w-64 bg-border dark:bg-zinc-800 rounded-lg"></div>
        </div>
        <div className="h-64 bg-surface dark:bg-zinc-900/50 rounded-2xl border border-border"></div>
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-2xl">
        <p className="text-danger font-medium">{error || "Подразделение не найдено"}</p>
        <Link
          href="/departments"
          className="mt-6 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all"
        >
          Вернуться к списку
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div>
          <nav className="flex items-center text-sm text-text-secondary dark:text-zinc-400 mb-2">
            <Link href="/departments" className="hover:text-primary transition-colors">
              Подразделения
            </Link>
            <span className="mx-2 text-border">/</span>
            <span className="text-text-primary dark:text-zinc-100 font-medium">
              {department.name}
            </span>
          </nav>
          <h1 className="text-3xl font-semibold text-text-primary dark:text-zinc-50 tracking-tight">
            {department.name}
          </h1>
          {department.description && (
            <p className="mt-2 text-text-secondary dark:text-zinc-400 leading-relaxed">
              {department.description}
            </p>
          )}
        </div>

        {canManageMembers && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-sm active:transform active:scale-[0.98]"
          >
            Добавить участника
          </button>
        )}
      </div>

      <div className="bg-surface dark:bg-black border border-border dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border dark:border-zinc-800 bg-surface-subtle/30 dark:bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-text-primary dark:text-zinc-50">
            Участники
          </h2>
        </div>
        <MemberList
          departmentId={departmentId}
          canManage={canManageMembers}
          refreshTrigger={refreshTrigger}
          onMemberChange={handleMemberChange}
        />
      </div>

      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        departmentId={departmentId}
        onSuccess={handleMemberChange}
      />
    </div>
  );
}
