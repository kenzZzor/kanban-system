"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

interface DepartmentOption {
  id: string;
  name: string;
}

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  createdById: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  department: {
    id: string;
    name: string;
  };
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
  };
}

interface ProjectsPageClientProps {
  canReadProjects: boolean;
  canCreateProjects: boolean;
}

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Название проекта обязательно.")
    .max(200, "Название проекта должно быть не длиннее 200 символов."),
  description: z
    .string()
    .trim()
    .max(1000, "Описание проекта должно быть не длиннее 1000 символов.")
    .optional(),
  departmentId: z.string().trim().min(1, "Выберите подразделение."),
});

type CreateProjectErrors = Partial<Record<keyof z.infer<typeof createProjectSchema>, string>>;

function getApiErrorMessage(status: number, message?: string) {
  if (status === 401) {
    return "Сессия истекла. Выполните вход снова.";
  }

  if (status === 403) {
    return "Недостаточно прав для выполнения операции.";
  }

  if (status === 404) {
    return "Подразделение не найдено или недоступно.";
  }

  if (status === 409) {
    return message || "Конфликт данных. Обновите страницу и повторите.";
  }

  return message || "Не удалось выполнить запрос.";
}

export function ProjectsPageClient({
  canReadProjects,
  canCreateProjects,
}: ProjectsPageClientProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CreateProjectErrors>({});
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectDepartmentId, setProjectDepartmentId] = useState("");

  const canShowCreateButton = canReadProjects && canCreateProjects;

  const fetchProjects = useCallback(async (departmentId?: string) => {
    setError(null);
    setIsForbidden(false);
    setIsLoadingProjects(true);

    try {
      const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
      const response = await fetch(`/api/projects${query}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setIsForbidden(true);
          setProjects([]);
          return;
        }

        throw new Error(getApiErrorMessage(response.status, data.error?.message));
      }

      setProjects(data.projects || []);
    } catch (fetchError: unknown) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Не удалось загрузить список проектов.",
      );
      setProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    if (!canReadProjects) {
      return;
    }

    setIsLoadingDepartments(true);
    try {
      const response = await fetch("/api/departments");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, data.error?.message));
      }

      const loadedDepartments = (data.departments || []).map(
        (department: { id: string; name: string }) => ({
          id: department.id,
          name: department.name,
        }),
      );
      setDepartments(loadedDepartments);
    } catch {
      setDepartments([]);
    } finally {
      setIsLoadingDepartments(false);
    }
  }, [canReadProjects]);

  useEffect(() => {
    if (!canReadProjects) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchProjects();
    void fetchDepartments();
  }, [canReadProjects, fetchDepartments, fetchProjects]);

  const filteredDepartmentName = useMemo(() => {
    if (!departmentFilter) {
      return null;
    }

    return departments.find((department) => department.id === departmentFilter)?.name ?? null;
  }, [departmentFilter, departments]);

  async function handleFilterChange(nextDepartmentId: string) {
    setDepartmentFilter(nextDepartmentId);
    await fetchProjects(nextDepartmentId || undefined);
  }

  function openCreateModal() {
    setIsCreateModalOpen(true);
    setError(null);
    setFieldErrors({});
    setProjectName("");
    setProjectDescription("");
    setProjectDepartmentId(departments[0]?.id ?? "");
  }

  function closeCreateModal() {
    if (isSubmitting) {
      return;
    }

    setIsCreateModalOpen(false);
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = createProjectSchema.safeParse({
      name: projectName,
      description: projectDescription,
      departmentId: projectDepartmentId,
    });

    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: issues.name?.[0],
        description: issues.description?.[0],
        departmentId: issues.departmentId?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.code === "VALIDATION_ERROR") {
          const details = result.error.details || {};
          setFieldErrors({
            name: details.name?.[0],
            description: details.description?.[0],
            departmentId: details.departmentId?.[0],
          });
          setError("Проверьте корректность полей формы.");
          return;
        }

        throw new Error(getApiErrorMessage(response.status, result.error?.message));
      }

      setIsCreateModalOpen(false);
      await fetchProjects(departmentFilter || undefined);
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось создать проект.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canReadProjects || isForbidden) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-10 text-center">
        <h1 className="text-xl font-semibold text-text-primary">Доступ запрещён</h1>
        <p className="mt-2 text-sm text-text-secondary">
          У вас нет прав на просмотр проектов.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary dark:text-zinc-50">
            Проекты
          </h1>
          <p className="mt-1 text-sm text-text-secondary dark:text-zinc-400">
            Список доступных проектов и создание новых в рамках прав доступа.
          </p>
        </div>

        {canShowCreateButton && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Создать проект
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          htmlFor="projects-department-filter"
          className="text-sm font-semibold text-text-secondary"
        >
          Подразделение
        </label>
        <select
          id="projects-department-filter"
          value={departmentFilter}
          disabled={isLoadingDepartments || departments.length === 0}
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

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
          <p className="text-sm font-medium text-danger">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {isLoadingProjects ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div className="text-sm font-medium text-text-secondary">
                Загрузка проектов...
              </div>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-text-secondary">
              {filteredDepartmentName
                ? `В подразделении «${filteredDepartmentName}» пока нет проектов.`
                : "Доступные проекты не найдены."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-subtle/20">
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Название
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Подразделение
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Создатель
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Статус
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Создан
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-surface-subtle/40">
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-text-primary">
                          {project.name}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {project.description || "Описание не указано"}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {project.department.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {project.createdBy.lastName} {project.createdBy.firstName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-lg border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                        {project.isArchived ? "Архивирован" : "Активен"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {new Intl.DateTimeFormat("ru-RU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(project.createdAt))}
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
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-text-primary">Новый проект</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Проект будет доступен в выбранном подразделении.
              </p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="project-name"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Название проекта
                </label>
                <input
                  id="project-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.name ? "border-danger" : "border-border"
                  }`}
                  placeholder="Например, Internal Platform"
                />
                {fieldErrors.name && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="project-department"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Подразделение
                </label>
                <select
                  id="project-department"
                  value={projectDepartmentId}
                  onChange={(event) => setProjectDepartmentId(event.target.value)}
                  disabled={isSubmitting || departments.length === 0}
                  className={`h-10 w-full rounded-xl border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.departmentId ? "border-danger" : "border-border"
                  }`}
                >
                  <option value="">Выберите подразделение</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.departmentId && (
                  <p className="mt-1.5 text-xs font-medium text-danger">
                    {fieldErrors.departmentId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="project-description"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Описание
                </label>
                <textarea
                  id="project-description"
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  disabled={isSubmitting}
                  rows={4}
                  className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:opacity-60 ${
                    fieldErrors.description ? "border-danger" : "border-border"
                  }`}
                  placeholder="Короткое описание проекта"
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
