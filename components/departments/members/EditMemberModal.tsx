"use client";

import { useState } from "react";
import { DEPARTMENT_ROLES } from "@/lib/constants/roles";

interface Member {
  id: string;
  user: {
    firstName: string;
    lastName: string;
  };
  role: {
    code: string;
  };
  manager: {
    id: string;
  } | null;
}

interface EditMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentId: string;
  member: Member;
  onSuccess: () => void;
  allMembers: Member[];
}

export function EditMemberModal({
  isOpen,
  onClose,
  departmentId,
  member,
  onSuccess,
  allMembers,
}: EditMemberModalProps) {
  const [roleCode, setRoleCode] = useState(member.role.code);
  const [managerId, setManagerId] = useState(member.manager?.id || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/departments/${departmentId}/members/${member.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleCode,
            managerId: managerId || null,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "Не удалось обновить данные участника");
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Исключаем текущего пользователя из списка потенциальных руководителей
  const potentialManagers = allMembers.filter((m) => m.id !== member.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-xl border border-border dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <h3 className="text-2xl font-semibold text-text-primary dark:text-zinc-50 mb-2 tracking-tight">
            Изменить участника
          </h3>
          <p className="text-sm text-text-secondary dark:text-zinc-400 mb-8">
            Редактирование роли и руководителя для {member.user.lastName} {member.user.firstName}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-danger/5 border border-danger/10 rounded-xl">
                <p className="text-xs font-medium text-danger">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-text-secondary dark:text-zinc-300 mb-2">
                Роль
              </label>
              <select
                id="edit-role-select"
                required
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-zinc-50"
              >
                {DEPARTMENT_ROLES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary dark:text-zinc-300 mb-2">
                Руководитель
              </label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-zinc-50"
              >
                <option value="">Без руководителя</option>
                {potentialManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user.lastName} {m.user.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition-all"
                disabled={isSubmitting}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-sm active:transform active:scale-[0.98] disabled:opacity-50"
              >
                {isSubmitting ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
