"use client";

import { useState, useEffect, useCallback } from "react";
import { getRoleName } from "@/lib/constants/roles";
import { EditMemberModal } from "./EditMemberModal";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

interface Member {
  id: string;
  user: User;
  role: {
    code: string;
    name: string;
  };
  manager: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
    };
  } | null;
  joinedAt: string;
}

interface MemberListProps {
  departmentId: string;
  canManage: boolean;
  refreshTrigger: number;
  onMemberChange: () => void;
}

export function MemberList({
  departmentId,
  canManage,
  refreshTrigger,
  onMemberChange,
}: MemberListProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/departments/${departmentId}/members`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Не удалось загрузить список участников");
      }

      setMembers(data.members || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMembers();
  }, [fetchMembers, refreshTrigger]);

  const handleDelete = async (memberId: string) => {
    if (!confirm("Вы уверены, что хотите исключить этого участника?")) {
      return;
    }

    setIsDeleting(memberId);
    try {
      const response = await fetch(
        `/api/departments/${departmentId}/members/${memberId}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Не удалось удалить участника");
      }

      onMemberChange();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <div className="text-sm text-text-secondary animate-pulse font-medium">Загрузка участников...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm font-medium text-danger">{error}</p>
        <button
          onClick={fetchMembers}
          className="mt-4 text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="py-24 text-center">
        <div className="text-sm text-text-secondary font-medium">В этом подразделении пока нет участников.</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border dark:border-zinc-800 bg-surface-subtle/20">
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Сотрудник
            </th>
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Роль
            </th>
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Руководитель
            </th>
            <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Дата вступления
            </th>
            {canManage && (
              <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary text-right">
                Действия
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border dark:divide-zinc-900">
          {members.map((member) => (
            <tr
              key={member.id}
              className="hover:bg-surface-subtle/40 transition-colors group"
            >
              <td className="py-4 px-6">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-text-primary dark:text-zinc-50">
                    {member.user.lastName} {member.user.firstName}{" "}
                    {member.user.middleName}
                  </span>
                  <span className="text-xs text-text-secondary">{member.user.email}</span>
                </div>
              </td>
              <td className="py-4 px-6">
                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-primary-soft text-primary border border-primary/10">
                  {getRoleName(member.role.code)}
                </span>
              </td>
              <td className="py-4 px-6 text-sm text-text-secondary dark:text-zinc-400">
                {member.manager
                  ? `${member.manager.user.lastName} ${member.manager.user.firstName}`
                  : <span className="text-text-disabled">—</span>}
              </td>
              <td className="py-4 px-6 text-sm text-text-secondary dark:text-zinc-400">
                {new Date(member.joinedAt).toLocaleDateString("ru-RU")}
              </td>
              {canManage && (
                <td className="py-4 px-6">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingMember(member)}
                      className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member.id)}
                      disabled={isDeleting === member.id}
                      className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-danger/20 bg-danger/5 px-3 text-sm font-semibold text-danger transition-colors hover:border-danger/30 hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-subtle disabled:text-text-disabled disabled:opacity-70"
                    >
                      {isDeleting === member.id ? "..." : "Удалить"}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {editingMember && (
        <EditMemberModal
          isOpen={!!editingMember}
          onClose={() => setEditingMember(null)}
          departmentId={departmentId}
          member={editingMember}
          onSuccess={() => {
            setEditingMember(null);
            onMemberChange();
          }}
          allMembers={members}
        />
      )}
    </div>
  );
}
