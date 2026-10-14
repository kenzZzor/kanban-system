"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

interface DepartmentOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
  departmentId: string;
  isArchived: boolean;
}

interface AssigneeOption {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  isActive: boolean;
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  sourceDepartmentId: string;
  assignedDepartmentId: string | null;
  projectId: string | null;
  assignedToId: string | null;
  dueDate: string | null;
  createdAt: string;
  createdBy: {
    email: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
  };
  sourceDepartment: {
    id: string;
    name: string;
  };
  assignedDepartment: {
    id: string;
    name: string;
  } | null;
  assignedTo: AssigneeOption | null;
  project: {
    id: string;
    name: string;
    departmentId: string;
    isArchived: boolean;
  } | null;
  status: {
    code: string;
    name: string;
  };
  priority: {
    code: string;
    name: string;
  };
  taskType: {
    code: string;
    name: string;
  };
}

interface TasksPageClientProps {
  canReadTasks: boolean;
  canCreateTasks: boolean;
}

const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Название задачи обязательно.")
    .max(200, "Название задачи должно быть не длиннее 200 символов."),
  description: z
    .string()
    .trim()
    .max(4000, "Описание должно быть не длиннее 4000 символов.")
    .optional(),
  sourceDepartmentId: z.string().trim().min(1, "Выберите подразделение."),
  projectId: z.string().optional(),
  assignedToId: z.string().optional(),
  dueDate: z.string().optional(),
});

type CreateTaskErrors = Partial<Record<keyof z.infer<typeof createTaskSchema>, string>>;

function getApiErrorMessage(status: number, message?: string) {
  if (status === 400) {
    return message || "Некорректные данные запроса.";
  }

  if (status === 401) {
    return "Сессия истекла. Выполните вход снова.";
  }

  if (status === 403) {
    return "Недостаточно прав для выполнения операции.";
  }

  if (status === 404) {
    return "Ресурс не найден или недоступен.";
  }

  if (status === 409) {
    return message || "Конфликт данных. Обновите страницу и повторите.";
  }

  return message || "Не удалось выполнить запрос.";
}

function formatFullName(user: {
  firstName: string;
  lastName: string;
  middleName: string | null;
}) {
  return `${user.lastName} ${user.firstName}${user.middleName ? ` ${user.middleName}` : ""}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(code: string, name: string) {
  const labels: Record<string, string> = {
    NEW: "Новая",
    ANALYSIS: "На анализе",
    BACKLOG: "Бэклог",
    READY: "Готова",
    IN_PROGRESS: "В работе",
    REVIEW: "На проверке",
    TESTING: "Тестирование",
    DONE: "Завершена",
    BLOCKED: "Заблокирована",
    CANCELLED: "Отменена",
  };

  return labels[code] ?? name;
}

function priorityLabel(code: string, name: string) {
  const labels: Record<string, string> = {
    LOW: "Низкий",
    MEDIUM: "Средний",
    HIGH: "Высокий",
    CRITICAL: "Критический",
  };

  return labels[code] ?? name;
}

export function TasksPageClient({
  canReadTasks,
  canCreateTasks,
}: TasksPageClientProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CreateTaskErrors>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceDepartmentId, setSourceDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const fetchTasks = useCallback(async (departmentId?: string) => {
    setError(null);
    setIsForbidden(false);
    setIsLoadingTasks(true);

    try {
      const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
      const response = await fetch(`/api/tasks${query}`);
      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setIsForbidden(true);
          setTasks([]);
          return;
        }

        throw new Error(getApiErrorMessage(response.status, payload.error?.message));
      }

      setTasks(payload.tasks || []);
    } catch (fetchError: unknown) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Не удалось загрузить список задач.",
      );
      setTasks([]);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  const fetchOptions = useCallback(async () => {
    if (!canReadTasks) {
      return;
    }

    setIsLoadingOptions(true);
    try {
      const [departmentsResponse, projectsResponse] = await Promise.all([
        fetch("/api/departments"),
        fetch("/api/projects"),
      ]);
      const departmentsPayload = await departmentsResponse.json();
      const projectsPayload = await projectsResponse.json();

      if (!departmentsResponse.ok) {
        throw new Error(
          getApiErrorMessage(departmentsResponse.status, departmentsPayload.error?.message),
        );
      }

      setDepartments(
        (departmentsPayload.departments || []).map(
          (department: { id: string; name: string }) => ({
            id: department.id,
            name: department.name,
          }),
        ),
      );

      if (projectsResponse.ok) {
        setProjects(
          (projectsPayload.projects || []).map(
            (project: ProjectOption) => ({
              id: project.id,
              name: project.name,
              departmentId: project.departmentId,
              isArchived: project.isArchived,
            }),
          ),
        );
      } else {
        setProjects([]);
      }
    } catch {
      setDepartments([]);
      setProjects([]);
    } finally {
      setIsLoadingOptions(false);
    }
  }, [canReadTasks]);

  useEffect(() => {
    if (!canReadTasks) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTasks();
    void fetchOptions();
  }, [canReadTasks, fetchOptions, fetchTasks]);

  const availableProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          !project.isArchived &&
          (!sourceDepartmentId || project.departmentId === sourceDepartmentId),
      ),
    [projects, sourceDepartmentId],
  );

  async function fetchAssignees(nextDepartmentId: string) {
    setAssignees([]);
    setAssignedToId("");

    if (!nextDepartmentId) {
      return;
    }

    setIsLoadingAssignees(true);
    try {
      const response = await fetch(`/api/departments/${nextDepartmentId}/members`);
      const payload = await response.json();

      if (!response.ok) {
        setAssignees([]);
        return;
      }

      setAssignees(
        (payload.members || [])
          .map((member: { user: AssigneeOption }) => member.user)
          .filter((user: AssigneeOption) => user.isActive),
      );
    } catch {
      setAssignees([]);
    } finally {
      setIsLoadingAssignees(false);
    }
  }

  async function handleFilterChange(nextDepartmentId: string) {
    setDepartmentFilter(nextDepartmentId);
    await fetchTasks(nextDepartmentId || undefined);
  }

  function openCreateModal() {
    setIsCreateModalOpen(true);
    setError(null);
    setSuccessMessage(null);
    setFieldErrors({});
    setTitle("");
    setDescription("");
    setSourceDepartmentId(departments[0]?.id ?? "");
    setProjectId("");
    setAssignedToId("");
    setDueDate("");
    setAssignees([]);

    if (departments[0]?.id) {
      void fetchAssignees(departments[0].id);
    }
  }

  function closeCreateModal() {
    if (isSubmitting) {
      return;
    }

    setIsCreateModalOpen(false);
  }

  async function handleSourceDepartmentChange(nextDepartmentId: string) {
    setSourceDepartmentId(nextDepartmentId);
    setProjectId("");
    await fetchAssignees(nextDepartmentId);
  }

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const parsed = createTaskSchema.safeParse({
      title,
      description,
      sourceDepartmentId,
      projectId,
      assignedToId,
      dueDate,
    });

    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        title: issues.title?.[0],
        description: issues.description?.[0],
        sourceDepartmentId: issues.sourceDepartmentId?.[0],
        projectId: issues.projectId?.[0],
        assignedToId: issues.assignedToId?.[0],
        dueDate: issues.dueDate?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: parsed.data.title,
          description: parsed.data.description || undefined,
          sourceDepartmentId: parsed.data.sourceDepartmentId,
          projectId: parsed.data.projectId || undefined,
          assignedToId: parsed.data.assignedToId || undefined,
          dueDate: parsed.data.dueDate || undefined,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 400 && payload.error?.code === "VALIDATION_ERROR") {
          const details = payload.error.details || {};
          setFieldErrors({
            title: details.title?.[0],
            description: details.description?.[0],
            sourceDepartmentId: details.sourceDepartmentId?.[0],
            projectId: details.projectId?.[0],
            assignedToId: details.assignedToId?.[0],
            dueDate: details.dueDate?.[0],
          });
        }

        throw new Error(getApiErrorMessage(response.status, payload.error?.message));
      }

      setIsCreateModalOpen(false);
      setSuccessMessage("Задача создана.");
      await fetchTasks(departmentFilter || undefined);
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось создать задачу.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canReadTasks || isForbidden) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-10 text-center">
        <h1 className="text-xl font-semibold text-text-primary">Доступ запрещён</h1>
        <p className="mt-2 text-sm text-text-secondary">
          У вас нет прав на просмотр задач.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            Задачи
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Реальные задачи из доступных подразделений без Kanban workflow этого этапа.
          </p>
        </div>

        {canCreateTasks && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Создать задачу
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          htmlFor="tasks-department-filter"
          className="text-sm font-semibold text-text-secondary"
        >
          Подразделение
        </label>
        <select
          id="tasks-department-filter"
          value={departmentFilter}
          disabled={isLoadingOptions || departments.length === 0}
          onChange={(event) => {
            void handleFilterChange(event.target.value);
          }}
          className="h-10 min-w-56 rounded-xl border border-border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">Все доступные подразделения</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>

      {successMessage && (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
          <p className="text-sm font-medium text-success">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
          <p className="text-sm font-medium text-danger">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {isLoadingTasks ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div className="text-sm font-medium text-text-secondary">
                Загрузка задач...
              </div>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-text-secondary">
              Доступные задачи не найдены.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-subtle/20">
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Задача
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Подразделение
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Исполнитель
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Статус / приоритет
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Срок
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-surface-subtle/40">
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="text-sm font-semibold text-primary hover:text-primary-hover"
                        >
                          {task.title}
                        </Link>
                        <p className="max-w-md truncate text-sm text-text-secondary">
                          {task.project ? task.project.name : "Без проекта"}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Автор: {formatFullName(task.createdBy)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {task.sourceDepartment.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {task.assignedTo ? formatFullName(task.assignedTo) : "Не назначен"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex w-fit rounded-lg border border-primary/20 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                          {statusLabel(task.status.code, task.status.name)}
                        </span>
                        <span className="inline-flex w-fit rounded-lg border border-border bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-text-secondary">
                          {priorityLabel(task.priority.code, task.priority.name)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {task.dueDate ? formatDate(task.dueDate) : "Не указан"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-text-primary">Новая задача</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Задача создаётся в выбранном подразделении. Проект и исполнитель необязательны.
              </p>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="task-title"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Название
                </label>
                <input
                  id="task-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.title ? "border-danger" : "border-border"
                  }`}
                  placeholder="Например, Подготовить доступы"
                />
                {fieldErrors.title && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors.title}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="task-source-department"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Подразделение
                </label>
                <select
                  id="task-source-department"
                  value={sourceDepartmentId}
                  disabled={isSubmitting || departments.length === 0}
                  onChange={(event) => {
                    void handleSourceDepartmentChange(event.target.value);
                  }}
                  className={`h-10 w-full rounded-xl border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.sourceDepartmentId ? "border-danger" : "border-border"
                  }`}
                >
                  <option value="">Выберите подразделение</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.sourceDepartmentId && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.sourceDepartmentId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="task-project"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Проект
                </label>
                <select
                  id="task-project"
                  value={projectId}
                  disabled={isSubmitting || availableProjects.length === 0}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">Без проекта</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="task-assignee"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Исполнитель
                </label>
                <select
                  id="task-assignee"
                  value={assignedToId}
                  disabled={isSubmitting || isLoadingAssignees || assignees.length === 0}
                  onChange={(event) => setAssignedToId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">Без исполнителя</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {formatFullName(assignee)} ({assignee.email})
                    </option>
                  ))}
                </select>
                {assignees.length === 0 && sourceDepartmentId && !isLoadingAssignees && (
                  <p className="mt-1.5 text-xs text-text-secondary">
                    Доступных исполнителей нет или список участников недоступен вашей роли.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="task-due-date"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Срок выполнения
                </label>
                <input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={isSubmitting}
                  className={`h-10 w-full rounded-xl border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.dueDate ? "border-danger" : "border-border"
                  }`}
                />
                {fieldErrors.dueDate && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors.dueDate}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="task-description"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Описание
                </label>
                <textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isSubmitting}
                  rows={4}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.description ? "border-danger" : "border-border"
                  }`}
                  placeholder="Короткое описание задачи"
                />
                {fieldErrors.description && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.description}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isSubmitting}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
