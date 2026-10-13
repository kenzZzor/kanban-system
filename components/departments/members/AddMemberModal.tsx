"use client";

import { useState, useEffect } from "react";
import { DEPARTMENT_ROLES } from "@/lib/constants/roles";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

interface Member {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentId: string;
  onSuccess: () => void;
}

export function AddMemberModal({
  isOpen,
  onClose,
  departmentId,
  onSuccess,
}: AddMemberModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [roleCode, setRoleCode] = useState("EMPLOYEE");
  const [managerId, setManagerId] = useState("");

  const [existingMembers, setExistingMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        setIsLoadingUsers(true);
        setError(null);
        try {
          const [usersRes, membersRes] = await Promise.all([
            fetch("/api/users"),
            fetch(`/api/departments/${departmentId}/members`),
          ]);

          const usersData = await usersRes.json();
          const membersData = await membersRes.json();

          if (!usersRes.ok) throw new Error(usersData.error?.message);
          if (!membersRes.ok) throw new Error(membersData.error?.message);

          setUsers(usersData.users || []);
          setExistingMembers(membersData.members || []);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Произошла ошибка");
        } finally {
          setIsLoadingUsers(false);
        }
      };
      fetchData();
    }
  }, [isOpen, departmentId]);

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedUserId("");
      setRoleCode("EMPLOYEE");
      setManagerId("");
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/departments/${departmentId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          roleCode,
          managerId: managerId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "Не удалось добавить участника");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Исключаем тех, кто уже в департаменте
  const availableUsers = users.filter(
    (u) => !existingMembers.some((m) => m.user.id === u.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-xl border border-border dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <h3 className="text-2xl font-semibold text-text-primary dark:text-zinc-50 mb-2 tracking-tight">
            Добавить участника
          </h3>
          <p className="text-sm text-text-secondary dark:text-zinc-400 mb-8">
            Выберите пользователя и назначьте ему роль в этом подразделении.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-danger/5 border border-danger/10 rounded-xl">
                <p className="text-xs font-medium text-danger">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-text-secondary dark:text-zinc-300 mb-2">
                Выберите пользователя
              </label>
              <select
                id="user-select"
                required
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={isLoadingUsers || isSubmitting}
                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-zinc-50"
              >
                <option value="" disabled={isLoadingUsers}>
                  {isLoadingUsers ? "Загрузка пользователей..." : "Выберите..."}
                </option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.lastName} {u.firstName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-secondary dark:text-zinc-300 mb-2">
                Роль
              </label>
              <select
                id="role-select"
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
                Руководитель (необязательно)
              </label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all dark:text-zinc-50"
              >
                <option value="">Без руководителя</option>
                {existingMembers.map((m) => (
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
                disabled={isSubmitting || !selectedUserId}
                className="px-6 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all shadow-sm active:transform active:scale-[0.98] disabled:opacity-50"
              >
                {isSubmitting ? "Добавление..." : "Добавить"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
