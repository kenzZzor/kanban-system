"use client";

import { useState } from "react";
import { DepartmentList } from "@/components/departments/DepartmentList";
import { CreateDepartmentModal } from "@/components/departments/CreateDepartmentModal";

interface DepartmentsPageClientProps {
  canCreate: boolean;
}

export default function DepartmentsPageClient({ canCreate }: DepartmentsPageClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary dark:text-zinc-50 tracking-tight">
            Подразделения
          </h1>
          <p className="text-sm text-text-secondary dark:text-zinc-400 mt-1">
            Управление организационной структурой компании.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-sm active:transform active:scale-[0.98]"
          >
            Создать подразделение
          </button>
        )}
      </div>

      <div className="bg-surface dark:bg-black border border-border dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <DepartmentList refreshTrigger={refreshTrigger} />
      </div>

      <CreateDepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
