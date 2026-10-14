import type {
  Prisma,
  PriorityCode,
  TaskStatusCode,
} from "@/app/generated/prisma/client";

import { logActivity } from "@/lib/activity/service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";

const TASK_READ_CODE = PERMISSION_CODES.TASKS_READ;
const TASK_CREATE_CODE = PERMISSION_CODES.TASKS_CREATE;
const TASK_UPDATE_CODE = PERMISSION_CODES.TASKS_UPDATE;
const TASK_ASSIGN_CODE = PERMISSION_CODES.TASKS_ASSIGN;
const TASK_STATUS_CHANGE_CODE = PERMISSION_CODES.TASKS_STATUS_CHANGE;
const COMMENT_CREATE_CODE = PERMISSION_CODES.COMMENTS_CREATE;

const DEFAULT_STATUS_CODE = "NEW";
const DEFAULT_PRIORITY_CODE = "MEDIUM";
const DEFAULT_TASK_TYPE_CODE = "TASK";
const DONE_STATUS_CODE = "DONE";

const taskHistoryActivityTypes = [
  "TASK_CREATED",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
] as const;

const statusDurationOrder: TaskStatusCode[] = [
  "NEW",
  "ANALYSIS",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "BACKLOG",
  "READY",
  "TESTING",
  "BLOCKED",
  "CANCELLED",
];

export const TASK_TRANSITION_ACTIONS = [
  "START_ANALYSIS",
  "START_PROGRESS",
  "SUBMIT_REVIEW",
  "APPROVE",
  "RETURN_TO_PROGRESS",
] as const;

export type TaskTransitionAction = (typeof TASK_TRANSITION_ACTIONS)[number];

interface TaskTransitionRule {
  from: TaskStatusCode;
  to: TaskStatusCode;
  actor: "assignee" | "reviewer";
  requiresReason?: boolean;
}

interface UpdateTaskInput {
  userId: string;
  taskId: string;
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  priorityCode?: PriorityCode;
}

const taskTransitionRules: Record<TaskTransitionAction, TaskTransitionRule> = {
  START_ANALYSIS: {
    from: "NEW",
    to: "ANALYSIS",
    actor: "assignee",
  },
  START_PROGRESS: {
    from: "ANALYSIS",
    to: "IN_PROGRESS",
    actor: "assignee",
  },
  SUBMIT_REVIEW: {
    from: "IN_PROGRESS",
    to: "REVIEW",
    actor: "assignee",
  },
  APPROVE: {
    from: "REVIEW",
    to: "DONE",
    actor: "reviewer",
  },
  RETURN_TO_PROGRESS: {
    from: "REVIEW",
    to: "IN_PROGRESS",
    actor: "reviewer",
    requiresReason: true,
  },
};

export const taskSelect = {
  id: true,
  title: true,
  description: true,
  createdById: true,
  sourceDepartmentId: true,
  assignedToId: true,
  assignedDepartmentId: true,
  projectId: true,
  statusId: true,
  priorityId: true,
  taskTypeId: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  createdBy: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
    },
  },
  sourceDepartment: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedDepartment: {
    select: {
      id: true,
      name: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      departmentId: true,
      isArchived: true,
    },
  },
  status: {
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      isFinal: true,
    },
  },
  priority: {
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
    },
  },
  taskType: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
} satisfies Prisma.TaskSelect;

type TaskHistoryActivityType = (typeof taskHistoryActivityTypes)[number];

interface TaskHistoryActor {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

interface TaskHistoryUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

export interface TaskHistoryActivity {
  id: string;
  type: TaskHistoryActivityType;
  createdAt: Date;
  description: string;
  metadata: Prisma.JsonValue | null;
  actor: TaskHistoryActor;
}

export interface TaskHistoryEvent {
  id: string;
  type: TaskHistoryActivityType;
  createdAt: string;
  actor: TaskHistoryActor;
  description: string;
  previousAssignedTo: TaskHistoryUser | null;
  assignedTo: TaskHistoryUser | null;
  previousStatusCode: TaskStatusCode | null;
  newStatusCode: TaskStatusCode | null;
  action: TaskTransitionAction | null;
  reason: string | null;
}

export interface TaskStageDuration {
  statusCode: TaskStatusCode;
  durationMs: number;
}

export type TaskTiming =
  | {
      state: "NOT_STARTED";
      message: string;
      startedAt: null;
      endedAt: null;
      calculatedAt: string;
      totalElapsedMs: null;
      stageDurations: TaskStageDuration[];
    }
  | {
      state: "INSUFFICIENT_DATA";
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

interface TaskTimingInput {
  assignedToId: string | null;
  status: {
    code: TaskStatusCode;
  };
}

interface CreateTaskInput {
  userId: string;
  title: string;
  description?: string;
  sourceDepartmentId: string;
  projectId?: string;
  assignedToId?: string;
  dueDate?: Date;
}

interface AssignTaskInput {
  userId: string;
  taskId: string;
  assignedToId: string;
}

interface TransitionTaskInput {
  userId: string;
  taskId: string;
  action: TaskTransitionAction;
  reason?: string;
}

function isMetadataObject(
  metadata: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, Prisma.JsonValue>;
}

function metadataString(
  metadata: Record<string, Prisma.JsonValue>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataStatusCode(
  metadata: Record<string, Prisma.JsonValue>,
  key: string,
) {
  return metadataString(metadata, key) as TaskStatusCode | null;
}

function metadataTransitionAction(
  metadata: Record<string, Prisma.JsonValue>,
) {
  const action = metadataString(metadata, "action");
  return TASK_TRANSITION_ACTIONS.includes(action as TaskTransitionAction)
    ? (action as TaskTransitionAction)
    : null;
}

function sortHistoryActivities<T extends { id: string; createdAt: Date; type: string }>(
  activities: T[],
) {
  const typeOrder: Record<string, number> = {
    TASK_CREATED: 0,
    TASK_ASSIGNED: 1,
    TASK_STATUS_CHANGED: 2,
  };

  return [...activities].sort((left, right) => {
    const timeDiff = left.createdAt.getTime() - right.createdAt.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    const typeDiff = (typeOrder[left.type] ?? 99) - (typeOrder[right.type] ?? 99);
    if (typeDiff !== 0) {
      return typeDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

function insufficientTiming(calculatedAt: Date, message: string): TaskTiming {
  return {
    state: "INSUFFICIENT_DATA",
    message,
    startedAt: null,
    endedAt: null,
    calculatedAt: calculatedAt.toISOString(),
    totalElapsedMs: null,
    stageDurations: [],
  };
}

function stageDurationsFromMap(durations: Map<TaskStatusCode, number>) {
  return [...durations.entries()]
    .filter(([, durationMs]) => durationMs > 0)
    .sort(([left], [right]) => {
      const leftIndex = statusDurationOrder.indexOf(left);
      const rightIndex = statusDurationOrder.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    })
    .map(([statusCode, durationMs]) => ({
      statusCode,
      durationMs,
    }));
}

function addStageDuration(
  durations: Map<TaskStatusCode, number>,
  statusCode: TaskStatusCode,
  startedAt: Date,
  endedAt: Date,
) {
  const durationMs = endedAt.getTime() - startedAt.getTime();
  if (durationMs <= 0) {
    return;
  }

  durations.set(statusCode, (durations.get(statusCode) ?? 0) + durationMs);
}

export function reconstructTaskTiming({
  task,
  activities,
  now = new Date(),
}: {
  task: TaskTimingInput;
  activities: TaskHistoryActivity[];
  now?: Date;
}): TaskTiming {
  const sortedActivities = sortHistoryActivities(activities);
  const assignmentActivities = sortedActivities.filter(
    (activity) => activity.type === "TASK_ASSIGNED",
  );

  if (assignmentActivities.length === 0) {
    if (task.assignedToId === null) {
      return {
        state: "NOT_STARTED",
        message: "Таймер ещё не начат: задача не назначена.",
        startedAt: null,
        endedAt: null,
        calculatedAt: now.toISOString(),
        totalElapsedMs: null,
        stageDurations: [],
      };
    }

    return insufficientTiming(
      now,
      "Недостаточно данных: отсутствует надёжная запись первоначального назначения.",
    );
  }

  if (task.assignedToId === null) {
    return insufficientTiming(
      now,
      "Недостаточно данных: история содержит назначение, но текущий исполнитель не указан.",
    );
  }

  let reconstructedStatus = DEFAULT_STATUS_CODE as TaskStatusCode;
  let timerStartedAt: Date | null = null;
  let activeStageStartedAt: Date | null = null;
  let completedAt: Date | null = null;
  const stageDurations = new Map<TaskStatusCode, number>();

  for (const activity of sortedActivities) {
    const metadata = isMetadataObject(activity.metadata);

    if (activity.type === "TASK_ASSIGNED") {
      if (!metadataString(metadata, "assignedToId")) {
        return insufficientTiming(
          now,
          "Недостаточно данных: запись назначения не содержит исполнителя.",
        );
      }

      if (!timerStartedAt) {
        timerStartedAt = activity.createdAt;
        activeStageStartedAt = activity.createdAt;
      }

      continue;
    }

    if (activity.type !== "TASK_STATUS_CHANGED") {
      continue;
    }

    const previousStatusCode = metadataStatusCode(metadata, "previousStatusCode");
    const newStatusCode = metadataStatusCode(metadata, "newStatusCode");

    if (!previousStatusCode || !newStatusCode) {
      return insufficientTiming(
        now,
        "Недостаточно данных: запись перехода статуса неполная.",
      );
    }

    if (previousStatusCode !== reconstructedStatus) {
      return insufficientTiming(
        now,
        "Недостаточно данных: история переходов статусов противоречива.",
      );
    }

    if (timerStartedAt && activeStageStartedAt && !completedAt) {
      addStageDuration(
        stageDurations,
        reconstructedStatus,
        activeStageStartedAt,
        activity.createdAt,
      );
      activeStageStartedAt = activity.createdAt;
    }

    reconstructedStatus = newStatusCode;

    if (newStatusCode === DONE_STATUS_CODE && timerStartedAt && !completedAt) {
      completedAt = activity.createdAt;
      activeStageStartedAt = null;
    }
  }

  if (reconstructedStatus !== task.status.code) {
    return insufficientTiming(
      now,
      "Недостаточно данных: текущий статус не совпадает с восстановленной историей.",
    );
  }

  if (!timerStartedAt) {
    return insufficientTiming(
      now,
      "Недостаточно данных: отсутствует надёжная запись первоначального назначения.",
    );
  }

  if (task.status.code === DONE_STATUS_CODE) {
    if (!completedAt) {
      return insufficientTiming(
        now,
        "Недостаточно данных: нет надёжной записи завершения задачи.",
      );
    }

    return {
      state: "COMPLETED",
      message: "Расчёт выполнен по истории назначений и переходов статусов.",
      startedAt: timerStartedAt.toISOString(),
      endedAt: completedAt.toISOString(),
      calculatedAt: now.toISOString(),
      totalElapsedMs: completedAt.getTime() - timerStartedAt.getTime(),
      stageDurations: stageDurationsFromMap(stageDurations),
    };
  }

  if (completedAt) {
    return insufficientTiming(
      now,
      "Недостаточно данных: задача имеет события после завершения.",
    );
  }

  if (activeStageStartedAt) {
    addStageDuration(
      stageDurations,
      reconstructedStatus,
      activeStageStartedAt,
      now,
    );
  }

  return {
    state: "RUNNING",
    message: "Расчёт выполнен по истории назначений и переходов статусов.",
    startedAt: timerStartedAt.toISOString(),
    endedAt: null,
    calculatedAt: now.toISOString(),
    totalElapsedMs: now.getTime() - timerStartedAt.getTime(),
    stageDurations: stageDurationsFromMap(stageDurations),
  };
}

function buildTaskHistoryEvents({
  activities,
  usersById,
}: {
  activities: TaskHistoryActivity[];
  usersById: Map<string, TaskHistoryUser>;
}): TaskHistoryEvent[] {
  return sortHistoryActivities(activities).map((activity) => {
    const metadata = isMetadataObject(activity.metadata);
    const previousAssignedToId = metadataString(metadata, "previousAssignedToId");
    const assignedToId = metadataString(metadata, "assignedToId");

    return {
      id: activity.id,
      type: activity.type,
      createdAt: activity.createdAt.toISOString(),
      actor: activity.actor,
      description: activity.description,
      previousAssignedTo: previousAssignedToId
        ? usersById.get(previousAssignedToId) ?? null
        : null,
      assignedTo: assignedToId ? usersById.get(assignedToId) ?? null : null,
      previousStatusCode: metadataStatusCode(metadata, "previousStatusCode"),
      newStatusCode: metadataStatusCode(metadata, "newStatusCode"),
      action: metadataTransitionAction(metadata),
      reason: metadataString(metadata, "reason"),
    };
  });
}

async function findDepartmentIdsByPermission(
  userId: string,
  permissionCode: string,
) {
  const memberships = await prisma.departmentMember.findMany({
    where: {
      userId,
      leftAt: null,
      role: {
        permissions: {
          some: {
            permission: {
              code: permissionCode,
            },
          },
        },
      },
    },
    select: {
      departmentId: true,
    },
  });

  return memberships.map((membership) => membership.departmentId);
}

async function assertDepartmentExists(departmentId: string) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });

  if (!department) {
    throw new NotFoundError("Department not found.");
  }
}

async function assertTaskReadableByUser({
  userId,
  sourceDepartmentId,
  assignedDepartmentId,
}: {
  userId: string;
  sourceDepartmentId: string;
  assignedDepartmentId: string | null;
}) {
  const sourceAllowed = await hasPermission(
    userId,
    TASK_READ_CODE,
    sourceDepartmentId,
  );
  const assignedAllowed =
    assignedDepartmentId === sourceDepartmentId
      ? sourceAllowed
      : assignedDepartmentId
        ? await hasPermission(userId, TASK_READ_CODE, assignedDepartmentId)
        : false;

  if (!sourceAllowed && !assignedAllowed) {
    throw new ForbiddenError();
  }
}

async function getReadableDepartmentIds(userId: string) {
  const isSystemAdminReader = await hasPermission(userId, TASK_READ_CODE);
  if (isSystemAdminReader) {
    return null;
  }

  const readableDepartmentIds = await findDepartmentIdsByPermission(
    userId,
    TASK_READ_CODE,
  );

  if (readableDepartmentIds.length === 0) {
    throw new ForbiddenError();
  }

  return readableDepartmentIds;
}

function readableTaskWhere(departmentIds: string[] | null): Prisma.TaskWhereInput {
  if (departmentIds === null) {
    return {
      archivedAt: null,
    };
  }

  return {
    archivedAt: null,
    OR: [
      {
        sourceDepartmentId: {
          in: departmentIds,
        },
      },
      {
        assignedDepartmentId: {
          in: departmentIds,
        },
      },
    ],
  };
}

export async function listTasksForUser({
  userId,
  departmentId,
}: {
  userId: string;
  departmentId?: string;
}) {
  const readableDepartmentIds = await getReadableDepartmentIds(userId);

  if (departmentId) {
    await assertDepartmentExists(departmentId);

    if (
      readableDepartmentIds !== null &&
      !readableDepartmentIds.includes(departmentId)
    ) {
      throw new ForbiddenError();
    }
  }

  const where: Prisma.TaskWhereInput = {
    ...readableTaskWhere(
      departmentId
        ? [departmentId]
        : readableDepartmentIds,
    ),
  };

  return prisma.task.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "asc" },
    ],
    select: taskSelect,
  });
}

export async function getTaskForUser({
  userId,
  taskId,
}: {
  userId: string;
  taskId: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: taskSelect,
  });

  if (!task || task.archivedAt !== null) {
    throw new NotFoundError("Task not found.");
  }

  await assertTaskReadableByUser({
    userId,
    sourceDepartmentId: task.sourceDepartmentId,
    assignedDepartmentId: task.assignedDepartmentId,
  });

  const historyActivities = await prisma.activityLog.findMany({
    where: {
      taskId: task.id,
      type: {
        in: [...taskHistoryActivityTypes],
      },
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      type: true,
      createdAt: true,
      description: true,
      metadata: true,
      actor: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
        },
      },
    },
  });

  const taskHistoryActivities = historyActivities as TaskHistoryActivity[];
  const assignmentUserIds = new Set<string>();

  for (const activity of taskHistoryActivities) {
    const metadata = isMetadataObject(activity.metadata);
    const previousAssignedToId = metadataString(metadata, "previousAssignedToId");
    const assignedToId = metadataString(metadata, "assignedToId");

    if (previousAssignedToId) {
      assignmentUserIds.add(previousAssignedToId);
    }

    if (assignedToId) {
      assignmentUserIds.add(assignedToId);
    }
  }

  const assignmentUsers =
    assignmentUserIds.size > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: [...assignmentUserIds],
            },
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        })
      : [];

  const usersById = new Map(
    assignmentUsers.map((user) => [user.id, user]),
  );
  const calculatedAt = new Date();

  return {
    ...task,
    history: buildTaskHistoryEvents({
      activities: taskHistoryActivities,
      usersById,
    }),
    timing: reconstructTaskTiming({
      task,
      activities: taskHistoryActivities,
      now: calculatedAt,
    }),
  };
}

export async function listTaskCommentsForUser({
  userId,
  taskId,
}: {
  userId: string;
  taskId: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      sourceDepartmentId: true,
      assignedDepartmentId: true,
      archivedAt: true,
    },
  });

  if (!task || task.archivedAt !== null) {
    throw new NotFoundError("Task not found.");
  }

  await assertTaskReadableByUser({
    userId,
    sourceDepartmentId: task.sourceDepartmentId,
    assignedDepartmentId: task.assignedDepartmentId,
  });

  return prisma.comment.findMany({
    where: { taskId: task.id },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      taskId: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
        },
      },
    },
  });
}

export async function createTaskCommentForUser({
  userId,
  taskId,
  body,
}: {
  userId: string;
  taskId: string;
  body: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      sourceDepartmentId: true,
      assignedDepartmentId: true,
      archivedAt: true,
    },
  });

  if (!task || task.archivedAt !== null) {
    throw new NotFoundError("Task not found.");
  }

  await assertTaskReadableByUser({
    userId,
    sourceDepartmentId: task.sourceDepartmentId,
    assignedDepartmentId: task.assignedDepartmentId,
  });

  const sourceAllowed = await hasPermission(
    userId,
    COMMENT_CREATE_CODE,
    task.sourceDepartmentId,
  );
  const assignedAllowed =
    task.assignedDepartmentId === task.sourceDepartmentId
      ? sourceAllowed
      : task.assignedDepartmentId
        ? await hasPermission(userId, COMMENT_CREATE_CODE, task.assignedDepartmentId)
        : false;

  if (!sourceAllowed && !assignedAllowed) {
    throw new ForbiddenError("You do not have permission to comment on this task.");
  }

  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        taskId: task.id,
        authorId: userId,
        body,
      },
      select: {
        id: true,
        taskId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
      },
    });

    await logActivity({
      type: "COMMENT_ADDED",
      actorId: userId,
      entityType: "Comment",
      entityId: comment.id,
      taskId: task.id,
      departmentId: task.assignedDepartmentId ?? task.sourceDepartmentId,
      description: `Comment was added to task ${task.title}.`,
      metadata: {
        taskId: task.id,
        commentId: comment.id,
      },
      tx,
    });

    return comment;
  });
}

async function assertActiveAssigneeInDepartment(
  tx: Prisma.TransactionClient,
  assignedToId: string,
  departmentId: string,
) {
  const assignee = await tx.user.findUnique({
    where: { id: assignedToId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!assignee) {
    throw new NotFoundError("Assignee not found.");
  }

  if (!assignee.isActive) {
    throw new ValidationError("Assignee must be an active user.");
  }

  const membership = await tx.departmentMember.findUnique({
    where: {
      departmentId_userId: {
        departmentId,
        userId: assignedToId,
      },
    },
    select: {
      id: true,
      leftAt: true,
    },
  });

  if (!membership || membership.leftAt !== null) {
    throw new ValidationError(
      "Assignee must be an active member of the responsible department.",
    );
  }
}

async function assertManagerOrDepartmentAdminMembership(
  userId: string,
  departmentId: string,
) {
  const membership = await prisma.departmentMember.findUnique({
    where: {
      departmentId_userId: {
        departmentId,
        userId,
      },
    },
    select: {
      leftAt: true,
      role: {
        select: {
          code: true,
        },
      },
      user: {
        select: {
          isActive: true,
        },
      },
    },
  });

  if (
    !membership ||
    membership.leftAt !== null ||
    !membership.user.isActive ||
    !["MANAGER", "DEPARTMENT_ADMIN"].includes(membership.role.code)
  ) {
    throw new ForbiddenError(
      "Only a manager or department administrator can review this task.",
    );
  }
}

async function resolveTaskDefaults(tx: Prisma.TransactionClient) {
  const [status, priority, taskType] = await Promise.all([
    tx.taskStatus.findUnique({
      where: { code: DEFAULT_STATUS_CODE },
      select: { id: true },
    }),
    tx.priority.findUnique({
      where: { code: DEFAULT_PRIORITY_CODE },
      select: { id: true },
    }),
    tx.taskType.findUnique({
      where: { code: DEFAULT_TASK_TYPE_CODE },
      select: { id: true },
    }),
  ]);

  if (!status || !priority || !taskType) {
    throw new ValidationError(
      "Task defaults are not configured. Required defaults: NEW, MEDIUM, TASK.",
    );
  }

  return {
    statusId: status.id,
    priorityId: priority.id,
    taskTypeId: taskType.id,
  };
}

export async function createTaskForUser({
  userId,
  title,
  description,
  sourceDepartmentId,
  projectId,
  assignedToId,
  dueDate,
}: CreateTaskInput) {
  const canCreate = await hasPermission(
    userId,
    TASK_CREATE_CODE,
    sourceDepartmentId,
  );

  if (!canCreate) {
    throw new ForbiddenError();
  }

  await assertDepartmentExists(sourceDepartmentId);

  if (assignedToId) {
    const canAssign = await hasPermission(
      userId,
      TASK_ASSIGN_CODE,
      sourceDepartmentId,
    );

    if (!canAssign) {
      throw new ForbiddenError("You do not have permission to assign tasks.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const defaults = await resolveTaskDefaults(tx);

    if (projectId) {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          departmentId: true,
          isArchived: true,
        },
      });

      if (!project) {
        throw new NotFoundError("Project not found.");
      }

      if (project.departmentId !== sourceDepartmentId) {
        throw new ValidationError(
          "Project must belong to the task source department.",
        );
      }

      if (project.isArchived) {
        throw new ConflictError("Archived project cannot be used for new tasks.");
      }
    }

    if (assignedToId) {
      await assertActiveAssigneeInDepartment(tx, assignedToId, sourceDepartmentId);
    }

    const task = await tx.task.create({
      data: {
        title,
        description: description || null,
        createdById: userId,
        sourceDepartmentId,
        assignedDepartmentId: sourceDepartmentId,
        assignedToId: assignedToId || null,
        projectId: projectId || null,
        statusId: defaults.statusId,
        priorityId: defaults.priorityId,
        taskTypeId: defaults.taskTypeId,
        dueDate: dueDate ?? null,
      },
      select: taskSelect,
    });

    await logActivity({
      type: "TASK_CREATED",
      actorId: userId,
      entityType: "Task",
      entityId: task.id,
      taskId: task.id,
      departmentId: sourceDepartmentId,
      description: `Task ${task.title} was created.`,
      metadata: {
        taskId: task.id,
        sourceDepartmentId,
        assignedDepartmentId: sourceDepartmentId,
        projectId: projectId ?? null,
      },
      tx,
    });

    if (assignedToId) {
      await logActivity({
        type: "TASK_ASSIGNED",
        actorId: userId,
        entityType: "Task",
        entityId: task.id,
        taskId: task.id,
        departmentId: sourceDepartmentId,
        description: `Task ${task.title} was assigned to ${assignedToId}.`,
        metadata: {
          taskId: task.id,
          assignedToId,
          assignedDepartmentId: sourceDepartmentId,
        },
        tx,
      });
    }

    return task;
  });
}

export async function assignTaskForUser({
  userId,
  taskId,
  assignedToId,
}: AssignTaskInput) {
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      sourceDepartmentId: true,
      assignedDepartmentId: true,
      archivedAt: true,
    },
  });

  if (!existingTask || existingTask.archivedAt !== null) {
    throw new NotFoundError("Task not found.");
  }

  await assertTaskReadableByUser({
    userId,
    sourceDepartmentId: existingTask.sourceDepartmentId,
    assignedDepartmentId: existingTask.assignedDepartmentId,
  });

  if (!existingTask.assignedDepartmentId) {
    throw new ConflictError("Task has no responsible department.");
  }

  const canAssign = await hasPermission(
    userId,
    TASK_ASSIGN_CODE,
    existingTask.assignedDepartmentId,
  );

  if (!canAssign) {
    throw new ForbiddenError("You do not have permission to assign tasks.");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        sourceDepartmentId: true,
        assignedDepartmentId: true,
        assignedToId: true,
        archivedAt: true,
        status: {
          select: {
            isFinal: true,
          },
        },
      },
    });

    if (!task || task.archivedAt !== null) {
      throw new NotFoundError("Task not found.");
    }

    if (!task.assignedDepartmentId) {
      throw new ConflictError("Task has no responsible department.");
    }

    if (task.status.isFinal) {
      throw new ConflictError("Completed task cannot be assigned.");
    }

    if (task.assignedDepartmentId !== existingTask.assignedDepartmentId) {
      throw new ConflictError("Task responsible department changed. Refresh and try again.");
    }

    await assertActiveAssigneeInDepartment(
      tx,
      assignedToId,
      task.assignedDepartmentId,
    );

    if (task.assignedToId === assignedToId) {
      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        select: taskSelect,
      });
    }

    const previousAssignedToId = task.assignedToId;

    const updatedTask = await tx.task.update({
      where: { id: task.id },
      data: {
        assignedToId,
      },
      select: taskSelect,
    });

    await logActivity({
      type: "TASK_ASSIGNED",
      actorId: userId,
      entityType: "Task",
      entityId: updatedTask.id,
      taskId: updatedTask.id,
      departmentId: task.assignedDepartmentId,
      description: `Task ${updatedTask.title} was assigned to ${assignedToId}.`,
      metadata: {
        taskId: updatedTask.id,
        actorId: userId,
        previousAssignedToId,
        assignedToId,
        assignedDepartmentId: task.assignedDepartmentId,
      },
      tx,
    });

    return updatedTask;
  });
}

export async function updateTaskForUser({
  userId,
  taskId,
  title,
  description,
  dueDate,
  priorityCode,
}: UpdateTaskInput) {
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      sourceDepartmentId: true,
      assignedDepartmentId: true,
      priority: {
        select: {
          id: true,
          code: true,
        },
      },
      archivedAt: true,
      status: {
        select: {
          isFinal: true,
        },
      },
    },
  });

  if (!existingTask || existingTask.archivedAt !== null) {
    throw new NotFoundError("Task not found.");
  }

  await assertTaskReadableByUser({
    userId,
    sourceDepartmentId: existingTask.sourceDepartmentId,
    assignedDepartmentId: existingTask.assignedDepartmentId,
  });

  const updateDepartmentId =
    existingTask.assignedDepartmentId ?? existingTask.sourceDepartmentId;
  const canUpdate = await hasPermission(
    userId,
    TASK_UPDATE_CODE,
    updateDepartmentId,
  );

  if (!canUpdate) {
    throw new ForbiddenError("You do not have permission to update tasks.");
  }

  if (existingTask.status.isFinal) {
    throw new ConflictError("Completed task cannot be edited.");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        sourceDepartmentId: true,
        assignedDepartmentId: true,
        priorityId: true,
        priority: {
          select: {
            id: true,
            code: true,
          },
        },
        archivedAt: true,
        status: {
          select: {
            isFinal: true,
          },
        },
      },
    });

    if (!task || task.archivedAt !== null) {
      throw new NotFoundError("Task not found.");
    }

    if (task.status.isFinal) {
      throw new ConflictError("Completed task cannot be edited.");
    }

    if (
      task.assignedDepartmentId !== existingTask.assignedDepartmentId ||
      task.sourceDepartmentId !== existingTask.sourceDepartmentId
    ) {
      throw new ConflictError("Task department changed. Refresh and try again.");
    }

    const data: Prisma.TaskUpdateInput = {};
    const metadata: Record<string, unknown> = {
      taskId: task.id,
      actorId: userId,
    };

    if (title !== undefined && title !== task.title) {
      data.title = title;
      metadata.previousTitle = task.title;
      metadata.title = title;
    }

    if (description !== undefined && description !== task.description) {
      data.description = description;
      metadata.previousDescription = task.description;
      metadata.description = description;
    }

    const currentDueDateTime = task.dueDate?.getTime() ?? null;
    const nextDueDateTime = dueDate?.getTime() ?? null;

    if (dueDate !== undefined && nextDueDateTime !== currentDueDateTime) {
      data.dueDate = dueDate;
      metadata.previousDueDate = task.dueDate?.toISOString() ?? null;
      metadata.dueDate = dueDate?.toISOString() ?? null;
    }

    if (priorityCode !== undefined && priorityCode !== task.priority.code) {
      const priority = await tx.priority.findUnique({
        where: { code: priorityCode },
        select: { id: true, code: true },
      });

      if (!priority) {
        throw new ValidationError("Priority is not configured.");
      }

      data.priority = {
        connect: {
          id: priority.id,
        },
      };
      metadata.previousPriorityCode = task.priority.code;
      metadata.priorityCode = priority.code;
    }

    if (Object.keys(data).length === 0) {
      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        select: taskSelect,
      });
    }

    const updatedTask = await tx.task.update({
      where: { id: task.id },
      data,
      select: taskSelect,
    });

    await logActivity({
      type: "TASK_UPDATED",
      actorId: userId,
      entityType: "Task",
      entityId: updatedTask.id,
      taskId: updatedTask.id,
      departmentId: updateDepartmentId,
      description: `Task ${updatedTask.title} was updated.`,
      metadata: metadata as Prisma.InputJsonValue,
      tx,
    });

    return updatedTask;
  });
}

async function assertTransitionActor({
  userId,
  task,
  rule,
}: {
  userId: string;
  task: {
    createdById: string;
    assignedToId: string | null;
    assignedDepartmentId: string | null;
  };
  rule: (typeof taskTransitionRules)[TaskTransitionAction];
}) {
  if (!task.assignedDepartmentId) {
    throw new ConflictError("Task has no responsible department.");
  }

  if (!task.assignedToId) {
    throw new ConflictError("Task must be assigned before changing status.");
  }

  const canChangeStatus = await hasPermission(
    userId,
    TASK_STATUS_CHANGE_CODE,
    task.assignedDepartmentId,
  );

  if (!canChangeStatus) {
    throw new ForbiddenError("You do not have permission to change task status.");
  }

  if (rule.actor === "assignee") {
    if (task.assignedToId !== userId) {
      throw new ForbiddenError("Only the current assignee can perform this transition.");
    }

    return;
  }

  if (userId === task.assignedToId) {
    throw new ForbiddenError("Assignee cannot approve their own work.");
  }

  if (task.createdById === task.assignedToId) {
    await assertManagerOrDepartmentAdminMembership(
      userId,
      task.assignedDepartmentId,
    );
    return;
  }

  if (task.createdById !== userId) {
    throw new ForbiddenError("Only the task requester can review this task.");
  }
}

export async function transitionTaskForUser({
  userId,
  taskId,
  action,
  reason,
}: TransitionTaskInput) {
  const rule = taskTransitionRules[action];
  const normalizedReason = reason?.trim();

  if (rule.requiresReason && !normalizedReason) {
    throw new ValidationError("Return reason is required.");
  }

  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      createdById: true,
      sourceDepartmentId: true,
      assignedDepartmentId: true,
      assignedToId: true,
      archivedAt: true,
      status: {
        select: {
          code: true,
          isFinal: true,
        },
      },
    },
  });

  if (!existingTask || existingTask.archivedAt !== null) {
    throw new NotFoundError("Task not found.");
  }

  await assertTaskReadableByUser({
    userId,
    sourceDepartmentId: existingTask.sourceDepartmentId,
    assignedDepartmentId: existingTask.assignedDepartmentId,
  });

  if (existingTask.status.isFinal) {
    throw new ConflictError("Completed task cannot change status.");
  }

  if (existingTask.status.code !== rule.from) {
    throw new ConflictError(
      `Action ${action} is not allowed from status ${existingTask.status.code}.`,
    );
  }

  await assertTransitionActor({
    userId,
    task: existingTask,
    rule,
  });

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        createdById: true,
        sourceDepartmentId: true,
        assignedDepartmentId: true,
        assignedToId: true,
        archivedAt: true,
        statusId: true,
        status: {
          select: {
            id: true,
            code: true,
            isFinal: true,
          },
        },
      },
    });

    if (!task || task.archivedAt !== null) {
      throw new NotFoundError("Task not found.");
    }

    if (task.status.isFinal) {
      throw new ConflictError("Completed task cannot change status.");
    }

    if (task.status.code !== rule.from) {
      throw new ConflictError(
        `Action ${action} is not allowed from status ${task.status.code}.`,
      );
    }

    if (
      task.assignedDepartmentId !== existingTask.assignedDepartmentId ||
      task.assignedToId !== existingTask.assignedToId ||
      task.createdById !== existingTask.createdById
    ) {
      throw new ConflictError("Task changed concurrently. Refresh and try again.");
    }

    const targetStatus = await tx.taskStatus.findUnique({
      where: { code: rule.to },
      select: {
        id: true,
        code: true,
      },
    });

    if (!targetStatus) {
      throw new ValidationError(`Task status ${rule.to} is not configured.`);
    }

    const previousStatusId = task.status.id;
    const previousStatusCode = task.status.code;
    const transitionedAt = new Date();

    const updateResult = await tx.task.updateMany({
      where: {
        id: task.id,
        statusId: previousStatusId,
        archivedAt: null,
      },
      data: {
        statusId: targetStatus.id,
      },
    });

    if (updateResult.count !== 1) {
      throw new ConflictError("Task status changed concurrently. Refresh and try again.");
    }

    const updatedTask = await tx.task.findUniqueOrThrow({
      where: { id: task.id },
      select: taskSelect,
    });

    await logActivity({
      type: "TASK_STATUS_CHANGED",
      actorId: userId,
      entityType: "Task",
      entityId: updatedTask.id,
      taskId: updatedTask.id,
      departmentId: task.assignedDepartmentId ?? task.sourceDepartmentId,
      description: `Task ${updatedTask.title} status changed from ${previousStatusCode} to ${targetStatus.code}.`,
      metadata: {
        taskId: updatedTask.id,
        actorId: userId,
        action,
        previousStatusId,
        previousStatusCode,
        newStatusId: targetStatus.id,
        newStatusCode: targetStatus.code,
        transitionedAt: transitionedAt.toISOString(),
        reason: normalizedReason ?? null,
      },
      tx,
    });

    return updatedTask;
  });
}

export async function canReadTasks(userId: string) {
  const isSystemAdminReader = await hasPermission(userId, TASK_READ_CODE);
  if (isSystemAdminReader) {
    return true;
  }

  const readableDepartmentIds = await findDepartmentIdsByPermission(
    userId,
    TASK_READ_CODE,
  );

  return readableDepartmentIds.length > 0;
}

export async function canCreateTasks(userId: string) {
  const isSystemAdminCreator = await hasPermission(userId, TASK_CREATE_CODE);
  if (isSystemAdminCreator) {
    return true;
  }

  const creatableDepartmentIds = await findDepartmentIdsByPermission(
    userId,
    TASK_CREATE_CODE,
  );

  return creatableDepartmentIds.length > 0;
}
