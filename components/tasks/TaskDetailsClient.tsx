"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TaskDetails {
  id: string;
  title: string;
  description: string | null;
  assignedToId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
  };
  sourceDepartment: {
    name: string;
  };
  assignedDepartment: {
    id: string;
    name: string;
  } | null;
  assignedTo: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
  } | null;
  project: {
    name: string;
  } | null;
  status: {
    code: string;
    name: string;
    isFinal: boolean;
  };
  priority: {
    code: string;
    name: string;
  };
  taskType: {
    code: string;
    name: string;
  };
  history: TaskHistoryEvent[];
  timing: TaskTiming;
}

interface AssigneeOption {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  isActive: boolean;
}

interface TaskHistoryUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

interface TaskHistoryEvent {
  id: string;
  type: "TASK_CREATED" | "TASK_ASSIGNED" | "TASK_STATUS_CHANGED";
  createdAt: string;
  actor: TaskHistoryUser;
  description: string;
  previousAssignedTo: TaskHistoryUser | null;
  assignedTo: TaskHistoryUser | null;
  previousStatusCode: string | null;
  newStatusCode: string | null;
  action: TaskTransitionAction | null;
  reason: string | null;
}

interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: TaskHistoryUser;
}

interface TaskStageDuration {
  statusCode: string;
  durationMs: number;
}

type TaskTiming =
  | {
      state: "NOT_STARTED" | "INSUFFICIENT_DATA";
      message: string;
      startedAt: null;
      endedAt: null;
      calculatedAt: string;
      totalElapsedMs: null;
      stageDurations: TaskStageDuration[];
    }
  | {
      state: "RUNNING" | "COMPLETED";
      message: string;
      startedAt: string;
      endedAt: string | null;
      calculatedAt: string;
      totalElapsedMs: number;
      stageDurations: TaskStageDuration[];
    };

interface TaskDetailsClientProps {
  taskId: string;
}

type TaskTransitionAction =
  | "START_ANALYSIS"
  | "START_PROGRESS"
  | "SUBMIT_REVIEW"
  | "APPROVE"
  | "RETURN_TO_PROGRESS";

const transitionLabels: Record<TaskTransitionAction, string> = {
  START_ANALYSIS: "Начать анализ",
  START_PROGRESS: "Начать выполнение",
  SUBMIT_REVIEW: "Передать на проверку",
  APPROVE: "Подтвердить результат",
  RETURN_TO_PROGRESS: "Вернуть на доработку",
};

const priorityOptions = [
  { code: "LOW", label: "Низкий" },
  { code: "MEDIUM", label: "Средний" },
  { code: "HIGH", label: "Высокий" },
  { code: "CRITICAL", label: "Критический" },
] as const;

function getAvailableTransitionActions(statusCode: string): TaskTransitionAction[] {
  if (statusCode === "NEW") {
    return ["START_ANALYSIS"];
  }

  if (statusCode === "ANALYSIS") {
    return ["START_PROGRESS"];
  }

  if (statusCode === "IN_PROGRESS") {
    return ["SUBMIT_REVIEW"];
  }

  if (statusCode === "REVIEW") {
    return ["APPROVE", "RETURN_TO_PROGRESS"];
  }

  return [];
}

function getApiErrorMessage(status: number, message?: string) {
  if (status === 400) {
    return message || "Некорректные данные запроса.";
  }

  if (status === 401) {
    return "Сессия истекла. Выполните вход снова.";
  }

  if (status === 403) {
    return "Недостаточно прав для просмотра задачи.";
  }

  if (status === 404) {
    return "Задача не найдена или недоступна.";
  }

  if (status === 409) {
    return message || "Задача изменилась. Обновите страницу и повторите.";
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateInput(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} д.`);
  }

  if (hours > 0) {
    parts.push(`${hours} ч.`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} мин.`);
  }

  return parts.join(" ");
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

function statusName(code: string) {
  return statusLabel(code, code);
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

function actionLabel(action: TaskTransitionAction | null) {
  if (!action) {
    return null;
  }

  return transitionLabels[action];
}

function historyEventTitle(event: TaskHistoryEvent) {
  if (event.type === "TASK_CREATED") {
    return "Задача создана";
  }

  if (event.type === "TASK_ASSIGNED") {
    return event.previousAssignedTo ? "Исполнитель изменён" : "Исполнитель назначен";
  }

  if (event.action === "SUBMIT_REVIEW") {
    return "Отправлена на проверку";
  }

  if (event.action === "RETURN_TO_PROGRESS") {
    return "Возвращена на доработку";
  }

  if (event.action === "APPROVE") {
    return "Результат подтверждён";
  }

  return "Статус изменён";
}

function historyEventDetails(event: TaskHistoryEvent) {
  if (event.type === "TASK_ASSIGNED") {
    const assignedTo = event.assignedTo
      ? formatFullName(event.assignedTo)
      : "исполнитель не найден";

    if (!event.previousAssignedTo) {
      return `Назначен: ${assignedTo}`;
    }

    return `${formatFullName(event.previousAssignedTo)} → ${assignedTo}`;
  }

  if (event.type === "TASK_STATUS_CHANGED") {
    const statusChange =
      event.previousStatusCode && event.newStatusCode
        ? `${statusName(event.previousStatusCode)} → ${statusName(event.newStatusCode)}`
        : "Статус изменён";
    const label = actionLabel(event.action);

    return label ? `${statusChange} · ${label}` : statusChange;
  }

  return event.description;
}

async function fetchTaskDetails(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response.status, payload.error?.message));
  }

  return payload.task as TaskDetails;
}

async function fetchTaskComments(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/comments`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response.status, payload.error?.message));
  }

  return payload.comments as TaskComment[];
}

export function TaskDetailsClient({ taskId }: TaskDetailsClientProps) {
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriorityCode, setEditPriorityCode] = useState("MEDIUM");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [transitionAction, setTransitionAction] = useState<TaskTransitionAction | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentSubmitError, setCommentSubmitError] = useState<string | null>(null);
  const [commentSuccessMessage, setCommentSuccessMessage] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionSuccessMessage, setTransitionSuccessMessage] = useState<string | null>(null);

  function setEditFormFromTask(nextTask: TaskDetails) {
    setEditTitle(nextTask.title);
    setEditDescription(nextTask.description ?? "");
    setEditDueDate(formatDateInput(nextTask.dueDate));
    setEditPriorityCode(nextTask.priority.code);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTask() {
      setIsLoading(true);
      setError(null);

      try {
        const loadedTask = await fetchTaskDetails(taskId);

        if (!cancelled) {
          setTask(loadedTask);
          setEditFormFromTask(loadedTask);
          setSelectedAssigneeId(loadedTask.assignedToId ?? "");
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось загрузить задачу.",
          );
          setTask(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTask();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      setIsLoadingComments(true);
      setCommentsError(null);

      try {
        const loadedComments = await fetchTaskComments(taskId);

        if (!cancelled) {
          setComments(loadedComments);
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setCommentsError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось загрузить комментарии.",
          );
          setComments([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingComments(false);
        }
      }
    }

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignees(departmentId: string) {
      setIsLoadingAssignees(true);
      setAssignees([]);

      try {
        const response = await fetch(`/api/departments/${departmentId}/members`);
        const payload = await response.json();

        if (!response.ok) {
          return;
        }

        if (!cancelled) {
          setAssignees(
            (payload.members || [])
              .map((member: { user: AssigneeOption }) => member.user)
              .filter((user: AssigneeOption) => user.isActive),
          );
        }
      } catch {
        if (!cancelled) {
          setAssignees([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAssignees(false);
        }
      }
    }

    if (!task?.assignedDepartment?.id) {
      return undefined;
    }

    void loadAssignees(task.assignedDepartment.id);

    return () => {
      cancelled = true;
    };
  }, [task?.assignedDepartment?.id]);

  async function handleAssignTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError(null);
    setAssignSuccessMessage(null);

    if (!selectedAssigneeId) {
      setAssignError("Выберите активного исполнителя.");
      return;
    }

    setIsAssigning(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedToId: selectedAssigneeId,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.error?.message));
      }

      const loadedTask = await fetchTaskDetails(taskId);
      setTask(loadedTask);
      setEditFormFromTask(loadedTask);
      setSelectedAssigneeId(loadedTask.assignedToId ?? "");
      setAssignSuccessMessage("Исполнитель обновлён.");
    } catch (submitError: unknown) {
      setAssignError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось назначить исполнителя.",
      );
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleSaveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditError(null);
    setEditSuccessMessage(null);

    const normalizedTitle = editTitle.trim();
    const normalizedDescription = editDescription.trim();

    if (!normalizedTitle) {
      setEditError("Введите название задачи.");
      return;
    }

    setIsSavingTask(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: normalizedTitle,
          description: normalizedDescription || null,
          dueDate: editDueDate || null,
          priorityCode: editPriorityCode,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.error?.message));
      }

      const loadedTask = await fetchTaskDetails(taskId);
      setTask(loadedTask);
      setEditFormFromTask(loadedTask);
      setEditSuccessMessage("Задача обновлена.");
    } catch (submitError: unknown) {
      setEditError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось обновить задачу.",
      );
    } finally {
      setIsSavingTask(false);
    }
  }

  async function handleTransitionTask(action: TaskTransitionAction) {
    setTransitionError(null);
    setTransitionSuccessMessage(null);

    const normalizedReason = returnReason.trim();

    if (action === "RETURN_TO_PROGRESS" && !normalizedReason) {
      setTransitionError("Укажите причину возврата.");
      return;
    }

    setTransitionAction(action);
    setIsTransitioning(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/transitions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          reason: action === "RETURN_TO_PROGRESS" ? normalizedReason : undefined,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.error?.message));
      }

      const loadedTask = await fetchTaskDetails(taskId);
      setTask(loadedTask);
      setEditFormFromTask(loadedTask);
      setReturnReason("");
      setTransitionSuccessMessage("Статус задачи обновлён.");
    } catch (submitError: unknown) {
      setTransitionError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось изменить статус задачи.",
      );
    } finally {
      setIsTransitioning(false);
      setTransitionAction(null);
    }
  }

  async function handleSubmitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentSubmitError(null);
    setCommentSuccessMessage(null);

    const normalizedBody = commentBody.trim();

    if (!normalizedBody) {
      setCommentSubmitError("Введите текст комментария.");
      return;
    }

    if (normalizedBody.length > 5000) {
      setCommentSubmitError("Комментарий должен быть не длиннее 5000 символов.");
      return;
    }

    setIsSubmittingComment(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: normalizedBody,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload.error?.message));
      }

      const loadedComments = await fetchTaskComments(taskId);
      setComments(loadedComments);
      setCommentsError(null);
      setCommentBody("");
      setCommentSuccessMessage("Комментарий добавлен.");
    } catch (submitError: unknown) {
      setCommentSubmitError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось добавить комментарий.",
      );
    } finally {
      setIsSubmittingComment(false);
    }
  }

  const timerStartedAt = task?.timing.startedAt;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          href="/tasks"
          className="text-sm font-semibold text-primary hover:text-primary-hover"
        >
          ← К списку задач
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 text-sm font-medium text-text-secondary">
            Загрузка задачи...
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 p-10 text-center">
          <h1 className="text-xl font-semibold text-text-primary">Ошибка</h1>
          <p className="mt-2 text-sm text-danger">{error}</p>
        </div>
      ) : task ? (
        <>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                  {task.title}
                </h1>
                <p className="mt-2 text-sm text-text-secondary">
                  Создана {formatDateTime(task.createdAt)} · Автор {formatFullName(task.createdBy)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-lg border border-primary/20 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                  {statusLabel(task.status.code, task.status.name)}
                </span>
                <span className="inline-flex rounded-lg border border-border bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-text-secondary">
                  {priorityLabel(task.priority.code, task.priority.name)}
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                  Исходное подразделение
                </p>
                <p className="mt-1 text-sm text-text-primary">{task.sourceDepartment.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                  Ответственное подразделение
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  {task.assignedDepartment?.name ?? "Не указано"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                  Проект
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  {task.project?.name ?? "Без проекта"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                  Исполнитель
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  {task.assignedTo ? formatFullName(task.assignedTo) : "Не назначен"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                  Тип
                </p>
                <p className="mt-1 text-sm text-text-primary">{task.taskType.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                  Срок выполнения
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  {task.dueDate ? formatDate(task.dueDate) : "Не указан"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-text-primary">Описание</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
              {task.description || "Описание не указано."}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-text-primary">Редактирование задачи</h2>

            <form onSubmit={handleSaveTask} className="mt-4 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="task-edit-title"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Название
                </label>
                <input
                  id="task-edit-title"
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  disabled={isSavingTask || task.status.isFinal}
                  maxLength={200}
                  className="h-10 w-full rounded-xl border border-border bg-white px-4 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="task-edit-description"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Описание
                </label>
                <textarea
                  id="task-edit-description"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  disabled={isSavingTask || task.status.isFinal}
                  rows={4}
                  maxLength={4000}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="task-edit-due-date"
                    className="mb-2 block text-sm font-semibold text-text-secondary"
                  >
                    Срок выполнения
                  </label>
                  <input
                    id="task-edit-due-date"
                    type="date"
                    value={editDueDate}
                    onChange={(event) => setEditDueDate(event.target.value)}
                    disabled={isSavingTask || task.status.isFinal}
                    className="h-10 w-full rounded-xl border border-border bg-white px-4 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="task-edit-priority"
                    className="mb-2 block text-sm font-semibold text-text-secondary"
                  >
                    Приоритет
                  </label>
                  <select
                    id="task-edit-priority"
                    value={editPriorityCode}
                    onChange={(event) => setEditPriorityCode(event.target.value)}
                    disabled={isSavingTask || task.status.isFinal}
                    className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {priorityOptions.map((priority) => (
                      <option key={priority.code} value={priority.code}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {task.status.isFinal && (
                <p className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
                  Завершённую задачу нельзя редактировать.
                </p>
              )}

              {editSuccessMessage && (
                <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
                  <p className="text-sm font-medium text-success">
                    {editSuccessMessage}
                  </p>
                </div>
              )}

              {editError && (
                <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                  <p className="text-sm font-medium text-danger">{editError}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingTask || task.status.isFinal}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingTask ? "Сохранение..." : "Сохранить изменения"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Время выполнения
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {task.timing.message}
                </p>
              </div>
              {task.timing.totalElapsedMs !== null && (
                <div className="rounded-xl border border-border bg-surface-subtle px-4 py-3 text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                    Общее время
                  </p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {formatDuration(task.timing.totalElapsedMs)}
                  </p>
                </div>
              )}
            </div>

            {task.timing.state === "NOT_STARTED" ? (
              <p className="mt-4 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
                Таймер начнётся после первого назначения исполнителя.
              </p>
            ) : task.timing.state === "INSUFFICIENT_DATA" ? (
              <p className="mt-4 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
                Недостаточно данных для достоверного расчёта времени.
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                      Старт таймера
                    </p>
                    <p className="mt-1 text-sm text-text-primary">
                      {typeof timerStartedAt === "string"
                        ? formatDateTime(timerStartedAt)
                        : "Недоступно"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-disabled">
                      Завершение расчёта
                    </p>
                    <p className="mt-1 text-sm text-text-primary">
                      {task.timing.endedAt
                        ? formatDateTime(task.timing.endedAt)
                        : `Сейчас: ${formatDateTime(task.timing.calculatedAt)}`}
                    </p>
                  </div>
                </div>

                {task.timing.stageDurations.length > 0 && (
                  <div className="mt-5 overflow-hidden rounded-xl border border-border">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-surface-subtle">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-text-secondary">
                            Стадия
                          </th>
                          <th className="px-4 py-2 text-left font-semibold text-text-secondary">
                            Длительность
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {task.timing.stageDurations.map((stage) => (
                          <tr key={stage.statusCode}>
                            <td className="px-4 py-2 text-text-primary">
                              {statusName(stage.statusCode)}
                            </td>
                            <td className="px-4 py-2 text-text-secondary">
                              {formatDuration(stage.durationMs)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-text-primary">История задачи</h2>

            {task.history.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary">
                История действий для этой задачи пока недоступна.
              </p>
            ) : (
              <ol className="mt-4 space-y-4">
                {task.history.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-4">
                    <div className="flex flex-col justify-between gap-1 sm:flex-row">
                      <p className="text-sm font-semibold text-text-primary">
                        {historyEventTitle(event)}
                      </p>
                      <time className="text-xs font-medium text-text-disabled">
                        {formatDateTime(event.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">
                      {historyEventDetails(event)}
                    </p>
                    {event.reason && (
                      <p className="mt-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
                        Причина: {event.reason}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-text-disabled">
                      Автор: {formatFullName(event.actor)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-text-primary">Комментарии</h2>

            {isLoadingComments ? (
              <div className="mt-4 rounded-xl border border-border bg-surface-subtle px-4 py-3">
                <p className="text-sm text-text-secondary">Загрузка комментариев...</p>
              </div>
            ) : commentsError ? (
              <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                <p className="text-sm font-medium text-danger">{commentsError}</p>
              </div>
            ) : comments.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary">
                Комментариев пока нет.
              </p>
            ) : (
              <ol className="mt-4 space-y-4">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-xl border border-border bg-surface-subtle px-4 py-3">
                    <div className="flex flex-col justify-between gap-1 sm:flex-row">
                      <p className="text-sm font-semibold text-text-primary">
                        {formatFullName(comment.author)}
                      </p>
                      <time className="text-xs font-medium text-text-disabled">
                        {formatDateTime(comment.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                      {comment.body}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            <form onSubmit={handleSubmitComment} className="mt-5 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="task-comment-body"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Новый комментарий
                </label>
                <textarea
                  id="task-comment-body"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  disabled={isSubmittingComment}
                  rows={4}
                  maxLength={5000}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Введите комментарий"
                />
                <p className="mt-1.5 text-xs text-text-disabled">
                  {commentBody.trim().length}/5000
                </p>
              </div>

              {commentSuccessMessage && (
                <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
                  <p className="text-sm font-medium text-success">
                    {commentSuccessMessage}
                  </p>
                </div>
              )}

              {commentSubmitError && (
                <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                  <p className="text-sm font-medium text-danger">{commentSubmitError}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingComment}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingComment ? "Отправка..." : "Отправить"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-text-primary">Статус задачи</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Текущий статус: {statusLabel(task.status.code, task.status.name)}
            </p>

            {task.status.code === "REVIEW" && (
              <div className="mt-4">
                <label
                  htmlFor="task-return-reason"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Причина возврата
                </label>
                <textarea
                  id="task-return-reason"
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  disabled={isTransitioning || task.status.isFinal}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Укажите причину, если задача возвращается на доработку"
                />
              </div>
            )}

            {transitionSuccessMessage && (
              <div className="mt-4 rounded-xl border border-success/20 bg-success/10 px-4 py-3">
                <p className="text-sm font-medium text-success">
                  {transitionSuccessMessage}
                </p>
              </div>
            )}

            {transitionError && (
              <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                <p className="text-sm font-medium text-danger">{transitionError}</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              {getAvailableTransitionActions(task.status.code).length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Для текущего статуса нет доступных действий этого среза.
                </p>
              ) : (
                getAvailableTransitionActions(task.status.code).map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      void handleTransitionTask(action);
                    }}
                    disabled={isTransitioning || task.status.isFinal || !task.assignedTo}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isTransitioning && transitionAction === action
                      ? "Обновление..."
                      : transitionLabels[action]}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-text-primary">
              Назначение исполнителя
            </h2>

            <form onSubmit={handleAssignTask} className="mt-4 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="task-detail-assignee"
                  className="mb-2 block text-sm font-semibold text-text-secondary"
                >
                  Исполнитель
                </label>
                <select
                  id="task-detail-assignee"
                  value={selectedAssigneeId}
                  disabled={
                    isAssigning ||
                    isLoadingAssignees ||
                    task.status.isFinal ||
                    assignees.length === 0
                  }
                  onChange={(event) => setSelectedAssigneeId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-text-primary outline-none transition-all focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Выберите исполнителя</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {formatFullName(assignee)} ({assignee.email})
                    </option>
                  ))}
                </select>
                {task.status.isFinal ? (
                  <p className="mt-1.5 text-xs text-text-secondary">
                    Завершённую задачу нельзя переназначить.
                  </p>
                ) : assignees.length === 0 && task.assignedDepartment && !isLoadingAssignees ? (
                  <p className="mt-1.5 text-xs text-text-secondary">
                    Доступных исполнителей нет или список участников недоступен вашей роли.
                  </p>
                ) : null}
              </div>

              {assignSuccessMessage && (
                <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3">
                  <p className="text-sm font-medium text-success">
                    {assignSuccessMessage}
                  </p>
                </div>
              )}

              {assignError && (
                <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
                  <p className="text-sm font-medium text-danger">{assignError}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={
                    isAssigning ||
                    isLoadingAssignees ||
                    task.status.isFinal ||
                    assignees.length === 0
                  }
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAssigning ? "Назначение..." : "Назначить"}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
