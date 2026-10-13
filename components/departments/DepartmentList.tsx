"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Department {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface DepartmentListProps {
  refreshTrigger: number;
}

export function DepartmentList({ refreshTrigger }: DepartmentListProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDepartments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/departments");
      const result = await response.json();

      if (!response.ok) {
        setError(result.error?.message || "Не удалось загрузить список подразделений.");
        return;
      }

      setDepartments(result.departments || []);
    } catch {
      setError("Произошла ошибка при загрузке данных.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDepartments();
  }, [fetchDepartments, refreshTrigger]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <div className="text-sm text-text-secondary animate-pulse font-medium">Загрузка подразделений...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm font-medium text-danger">{error}</p>
        <button
          onClick={fetchDepartments}
          className="mt-4 text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="py-24 text-center bg-surface-subtle/20 border border-dashed border-border rounded-2xl m-6">
        <p className="text-sm text-text-secondary font-medium">Подразделения не найдены.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border dark:border-zinc-800 bg-surface-subtle/20">
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Название</th>
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Описание</th>
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Создано</th>
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary text-right">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border dark:divide-zinc-900">
          {departments.map((dept) => (
            <tr
              key={dept.id}
              className="hover:bg-surface-subtle/40 transition-colors group"
            >
              <td className="py-4 px-6">
                <Link
                  href={`/departments/${dept.id}`}
                  className="text-sm font-semibold text-text-primary dark:text-zinc-50 hover:text-primary transition-colors"
                >
                  {dept.name}
                </Link>
              </td>
              <td className="py-4 px-6 text-sm text-text-secondary dark:text-zinc-400 max-w-xs truncate">
                {dept.description || <span className="text-text-disabled">—</span>}
              </td>
              <td className="py-4 px-6 text-sm text-text-secondary dark:text-zinc-400">
                {new Date(dept.createdAt).toLocaleDateString("ru-RU")}
              </td>
              <td className="py-4 px-6 text-sm text-right">
                <Link
                  href={`/departments/${dept.id}`}
                  className="inline-flex items-center justify-center px-3 py-1 text-xs font-semibold text-primary bg-primary-soft hover:bg-primary hover:text-white rounded-lg transition-all"
                >
                  Управление
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
