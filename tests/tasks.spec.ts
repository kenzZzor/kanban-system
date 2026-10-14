import { expect, test } from "@playwright/test";
import type { TaskStatusCode } from "@/app/generated/prisma/client";

import { prisma } from "../lib/db";
import {
  reconstructTaskTiming,
  type TaskHistoryActivity,
} from "../lib/services/tasks";

const users = {
  systemAdmin: { email: "system.admin@kanban.local", password: "DevOnly123!" },
  manager: { email: "bob.manager@kanban.local", password: "DevOnly123!" },
  employee: { email: "charlie.employee@kanban.local", password: "DevOnly123!" },
  viewer: { email: "diana.viewer@kanban.local", password: "DevOnly123!" },
  formerMember: { email: "former.member@kanban.local", password: "DevOnly123!" },
  analyticsEmployee: { email: "grace.employee@kanban.local", password: "DevOnly123!" },
};

const IT_DEPARTMENT_ID = "seed-department-it";
const ANALYTICS_DEPARTMENT_ID = "seed-department-analytics";
const INTERNAL_PROJECT_ID = "seed-project-internal-systems";
const ANALYTICS_PROJECT_ID = "seed-project-analytics-platform";
const createdTaskIds: string[] = [];

const timingActor = {
  id: "timing-actor",
  email: "timing.actor@kanban.local",
  firstName: "Timing",
  lastName: "Actor",
  middleName: null,
};

function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
}

function minutesAfter(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

function timingActivity(
  activity: Omit<TaskHistoryActivity, "actor" | "description"> & {
    description?: string;
  },
): TaskHistoryActivity {
  return {
    actor: timingActor,
    description: activity.description ?? activity.type,
    ...activity,
  };
}

function assignedActivity(id: string, createdAt: Date): TaskHistoryActivity {
  return timingActivity({
    id,
    type: "TASK_ASSIGNED",
    createdAt,
    metadata: {
      assignedToId: "assignee-1",
      previousAssignedToId: null,
    },
  });
}

function statusActivity({
  id,
  createdAt,
  previousStatusCode,
  newStatusCode,
}: {
  id: string;
  createdAt: Date;
  previousStatusCode: TaskStatusCode;
  newStatusCode: TaskStatusCode;
}): TaskHistoryActivity {
  return timingActivity({
    id,
    type: "TASK_STATUS_CHANGED",
    createdAt,
    metadata: {
      previousStatusCode,
      newStatusCode,
    },
  });
}

function durationsByStatus(
  timing: ReturnType<typeof reconstructTaskTiming>,
) {
  return new Map(
    timing.stageDurations.map((stage) => [stage.statusCode, stage.durationMs]),
  );
}

async function login(
  request: import("@playwright/test").APIRequestContext,
  credentials: { email: string; password: string },
) {
  const response = await request.post("/api/auth/login", {
    data: credentials,
  });

  expect(response.status()).toBe(200);
}

async function getUserId(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  expect(user).not.toBeNull();
  return user!.id;
}

async function createTaskRecord({
  title,
  createdById,
  assignedToId,
  statusCode = "NEW",
  sourceDepartmentId = IT_DEPARTMENT_ID,
  assignedDepartmentId = IT_DEPARTMENT_ID,
  projectId,
}: {
  title: string;
  createdById: string;
  assignedToId?: string;
  statusCode?: string;
  sourceDepartmentId?: string;
  assignedDepartmentId?: string;
  projectId?: string;
}) {
  const [status, priority, taskType] = await Promise.all([
    prisma.taskStatus.findUniqueOrThrow({
      where: { code: statusCode as TaskStatusCode },
      select: { id: true },
    }),
    prisma.priority.findUniqueOrThrow({
      where: { code: "MEDIUM" },
      select: { id: true },
    }),
    prisma.taskType.findUniqueOrThrow({
      where: { code: "TASK" },
      select: { id: true },
    }),
  ]);

  const task = await prisma.task.create({
    data: {
      title,
      createdById,
      sourceDepartmentId,
      assignedDepartmentId,
      assignedToId: assignedToId ?? null,
      projectId: projectId ?? null,
      statusId: status.id,
      priorityId: priority.id,
      taskTypeId: taskType.id,
    },
    select: { id: true },
  });

  createdTaskIds.push(task.id);

  return task;
}

test.afterAll(async () => {
  if (createdTaskIds.length > 0) {
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { taskId: { in: createdTaskIds } },
          {
            entityType: "Task",
            entityId: { in: createdTaskIds },
          },
        ],
      },
    });
    await prisma.task.deleteMany({
      where: { id: { in: createdTaskIds } },
    });
  }

  await prisma.$disconnect();
});

test.describe("Task timing reconstruction", () => {
  test("sums calendar durations across multiple completed stages", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const timing = reconstructTaskTiming({
      task: {
        assignedToId: "assignee-1",
        status: { code: "DONE" },
      },
      now: minutesAfter(base, 90),
      activities: [
        assignedActivity("assign", base),
        statusActivity({
          id: "analysis",
          createdAt: minutesAfter(base, 10),
          previousStatusCode: "NEW",
          newStatusCode: "ANALYSIS",
        }),
        statusActivity({
          id: "progress",
          createdAt: minutesAfter(base, 30),
          previousStatusCode: "ANALYSIS",
          newStatusCode: "IN_PROGRESS",
        }),
        statusActivity({
          id: "review",
          createdAt: minutesAfter(base, 50),
          previousStatusCode: "IN_PROGRESS",
          newStatusCode: "REVIEW",
        }),
        statusActivity({
          id: "done",
          createdAt: minutesAfter(base, 60),
          previousStatusCode: "REVIEW",
          newStatusCode: "DONE",
        }),
      ],
    });

    expect(timing.state).toBe("COMPLETED");
    expect(timing.totalElapsedMs).toBe(60 * 60_000);

    const durations = durationsByStatus(timing);
    expect(durations.get("NEW")).toBe(10 * 60_000);
    expect(durations.get("ANALYSIS")).toBe(20 * 60_000);
    expect(durations.get("IN_PROGRESS")).toBe(20 * 60_000);
    expect(durations.get("REVIEW")).toBe(10 * 60_000);
  });

  test("sums repeated stage intervals after return to progress", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const timing = reconstructTaskTiming({
      task: {
        assignedToId: "assignee-1",
        status: { code: "DONE" },
      },
      now: minutesAfter(base, 90),
      activities: [
        assignedActivity("assign", base),
        statusActivity({
          id: "analysis",
          createdAt: minutesAfter(base, 10),
          previousStatusCode: "NEW",
          newStatusCode: "ANALYSIS",
        }),
        statusActivity({
          id: "progress-1",
          createdAt: minutesAfter(base, 20),
          previousStatusCode: "ANALYSIS",
          newStatusCode: "IN_PROGRESS",
        }),
        statusActivity({
          id: "review-1",
          createdAt: minutesAfter(base, 30),
          previousStatusCode: "IN_PROGRESS",
          newStatusCode: "REVIEW",
        }),
        statusActivity({
          id: "return",
          createdAt: minutesAfter(base, 40),
          previousStatusCode: "REVIEW",
          newStatusCode: "IN_PROGRESS",
        }),
        statusActivity({
          id: "review-2",
          createdAt: minutesAfter(base, 55),
          previousStatusCode: "IN_PROGRESS",
          newStatusCode: "REVIEW",
        }),
        statusActivity({
          id: "done",
          createdAt: minutesAfter(base, 60),
          previousStatusCode: "REVIEW",
          newStatusCode: "DONE",
        }),
      ],
    });

    expect(timing.state).toBe("COMPLETED");
    expect(timing.totalElapsedMs).toBe(60 * 60_000);

    const durations = durationsByStatus(timing);
    expect(durations.get("IN_PROGRESS")).toBe(25 * 60_000);
    expect(durations.get("REVIEW")).toBe(15 * 60_000);
  });

  test("calculates active task elapsed time up to current server time", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const timing = reconstructTaskTiming({
      task: {
        assignedToId: "assignee-1",
        status: { code: "ANALYSIS" },
      },
      now: minutesAfter(base, 25),
      activities: [
        assignedActivity("assign", base),
        statusActivity({
          id: "analysis",
          createdAt: minutesAfter(base, 10),
          previousStatusCode: "NEW",
          newStatusCode: "ANALYSIS",
        }),
      ],
    });

    expect(timing.state).toBe("RUNNING");
    expect(timing.totalElapsedMs).toBe(25 * 60_000);

    const durations = durationsByStatus(timing);
    expect(durations.get("NEW")).toBe(10 * 60_000);
    expect(durations.get("ANALYSIS")).toBe(15 * 60_000);
  });

  test("marks truly unassigned task as timer not started", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const timing = reconstructTaskTiming({
      task: {
        assignedToId: null,
        status: { code: "NEW" },
      },
      now: base,
      activities: [],
    });

    expect(timing.state).toBe("NOT_STARTED");
    expect(timing.totalElapsedMs).toBeNull();
    expect(timing.stageDurations).toEqual([]);
  });

  test("rejects assigned task timing when initial assignment history is missing", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const timing = reconstructTaskTiming({
      task: {
        assignedToId: "assignee-1",
        status: { code: "NEW" },
      },
      now: base,
      activities: [],
    });

    expect(timing.state).toBe("INSUFFICIENT_DATA");
    expect(timing.totalElapsedMs).toBeNull();
  });

  test("rejects contradictory status history", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const timing = reconstructTaskTiming({
      task: {
        assignedToId: "assignee-1",
        status: { code: "IN_PROGRESS" },
      },
      now: minutesAfter(base, 20),
      activities: [
        assignedActivity("assign", base),
        statusActivity({
          id: "contradiction",
          createdAt: minutesAfter(base, 10),
          previousStatusCode: "ANALYSIS",
          newStatusCode: "IN_PROGRESS",
        }),
      ],
    });

    expect(timing.state).toBe("INSUFFICIENT_DATA");
    expect(timing.totalElapsedMs).toBeNull();
  });
});

test.describe("Tasks API", () => {
  test("unauthenticated user cannot read, view or create tasks", async ({ request }) => {
    const listResponse = await request.get("/api/tasks");
    expect(listResponse.status()).toBe(401);

    const detailResponse = await request.get("/api/tasks/seed-task-internal-access");
    expect(detailResponse.status()).toBe(401);

    const assignResponse = await request.patch("/api/tasks/seed-task-internal-access", {
      data: {
        assignedToId: "seed-user-charlie",
      },
    });
    expect(assignResponse.status()).toBe(401);

    const updateResponse = await request.patch("/api/tasks/seed-task-internal-access", {
      data: {
        title: "Unauthorized Update",
      },
    });
    expect(updateResponse.status()).toBe(401);

    const createResponse = await request.post("/api/tasks", {
      data: {
        title: "Unauthorized Task",
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(createResponse.status()).toBe(401);

    const commentsListResponse = await request.get(
      "/api/tasks/seed-task-internal-access/comments",
    );
    expect(commentsListResponse.status()).toBe(401);

    const commentCreateResponse = await request.post(
      "/api/tasks/seed-task-internal-access/comments",
      {
        data: {
          body: "Unauthorized comment",
        },
      },
    );
    expect(commentCreateResponse.status()).toBe(401);
  });

  test("employee can create task without project and without assignee", async ({
    request,
  }) => {
    await login(request, users.employee);
    const title = uniqueTitle("API Unassigned Task");

    const response = await request.post("/api/tasks", {
      data: {
        title,
        description: "Created without project or assignee",
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdTaskIds.push(body.task.id);

    expect(body.task).toMatchObject({
      title,
      description: "Created without project or assignee",
      createdBy: {
        email: users.employee.email,
      },
      sourceDepartmentId: IT_DEPARTMENT_ID,
      assignedDepartmentId: IT_DEPARTMENT_ID,
      projectId: null,
      assignedToId: null,
      status: { code: "NEW" },
      priority: { code: "MEDIUM" },
      taskType: { code: "TASK" },
    });
  });

  test("manager can create task with project and assignee and activity is written", async ({
    request,
  }) => {
    await login(request, users.manager);
    const assigneeId = await getUserId(users.employee.email);
    const title = uniqueTitle("API Assigned Task");

    const response = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        projectId: INTERNAL_PROJECT_ID,
        assignedToId: assigneeId,
        dueDate: "2026-12-31",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdTaskIds.push(body.task.id);

    expect(body.task).toMatchObject({
      title,
      sourceDepartmentId: IT_DEPARTMENT_ID,
      assignedDepartmentId: IT_DEPARTMENT_ID,
      projectId: INTERNAL_PROJECT_ID,
      assignedToId: assigneeId,
      status: { code: "NEW" },
      priority: { code: "MEDIUM" },
      taskType: { code: "TASK" },
    });
    expect(body.task.dueDate).not.toBeNull();

    const activities = await prisma.activityLog.findMany({
      where: {
        taskId: body.task.id,
        type: { in: ["TASK_CREATED", "TASK_ASSIGNED"] },
      },
      select: { type: true },
    });

    expect(activities.map((activity) => activity.type).sort()).toEqual([
      "TASK_ASSIGNED",
      "TASK_CREATED",
    ]);
  });

  test("created task can be listed and viewed by an authorized user", async ({
    request,
  }) => {
    await login(request, users.manager);
    const title = uniqueTitle("API Readable Task");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    const listResponse = await request.get("/api/tasks");
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(
      listBody.tasks.some((task: { id: string }) => task.id === createdBody.task.id),
    ).toBe(true);

    const detailResponse = await request.get(`/api/tasks/${createdBody.task.id}`);
    expect(detailResponse.status()).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.task).toMatchObject({
      id: createdBody.task.id,
      title,
    });
  });

  test("manager can edit task fields and activity is written", async ({
    request,
  }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Editable Task"),
      createdById: managerId,
    });

    const response = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        title: "Updated task title",
        description: "Updated task description",
        dueDate: "2026-12-30",
        priorityCode: "HIGH",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.task).toMatchObject({
      id: task.id,
      title: "Updated task title",
      description: "Updated task description",
      priority: { code: "HIGH" },
    });
    expect(body.task.dueDate).not.toBeNull();

    const activity = await prisma.activityLog.findFirst({
      where: {
        taskId: task.id,
        type: "TASK_UPDATED",
      },
      select: {
        actorId: true,
        departmentId: true,
        metadata: true,
      },
    });
    expect(activity).toMatchObject({
      actorId: managerId,
      departmentId: IT_DEPARTMENT_ID,
    });
    expect(activity?.metadata).toMatchObject({
      previousTitle: expect.any(String),
      title: "Updated task title",
      previousPriorityCode: "MEDIUM",
      priorityCode: "HIGH",
    });
  });

  test("partial task patch changes only provided editable fields", async ({
    request,
  }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Partial Editable Task"),
      createdById: managerId,
    });

    const response = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        priorityCode: "CRITICAL",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.task).toMatchObject({
      id: task.id,
      priority: { code: "CRITICAL" },
    });
    expect(body.task.title).toContain("API Partial Editable Task");
    expect(body.task.description).toBeNull();
  });

  test("rejects invalid task edit input", async ({ request }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Invalid Edit Task"),
      createdById: managerId,
    });

    const emptyTitleResponse = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        title: "   ",
      },
    });
    expect(emptyTitleResponse.status()).toBe(400);

    const invalidPriorityResponse = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        priorityCode: "URGENT",
      },
    });
    expect(invalidPriorityResponse.status()).toBe(400);
  });

  test("rejects protected fields in task edit payload", async ({ request }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const employeeId = await getUserId(users.employee.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Protected Edit Task"),
      createdById: managerId,
    });

    const response = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        title: "Protected field edit attempt",
        assignedToId: employeeId,
        statusId: "malicious-status-id",
        projectId: INTERNAL_PROJECT_ID,
        sourceDepartmentId: ANALYTICS_DEPARTMENT_ID,
        createdById: employeeId,
      },
    });

    expect(response.status()).toBe(400);

    const storedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: {
        title: true,
        assignedToId: true,
        projectId: true,
        sourceDepartmentId: true,
        createdById: true,
      },
    });
    expect(storedTask.title).not.toBe("Protected field edit attempt");
    expect(storedTask.assignedToId).toBeNull();
    expect(storedTask.projectId).toBeNull();
    expect(storedTask.sourceDepartmentId).toBe(IT_DEPARTMENT_ID);
    expect(storedTask.createdById).toBe(managerId);
  });

  test("viewer cannot edit task and inaccessible task edits are forbidden", async ({
    request,
  }) => {
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Viewer Edit Task"),
      createdById: managerId,
    });

    await login(request, users.viewer);
    const viewerResponse = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        title: "Viewer attempted edit",
      },
    });
    expect(viewerResponse.status()).toBe(403);

    await login(request, users.manager);
    const inaccessibleResponse = await request.patch(
      "/api/tasks/seed-task-analytics-dashboard",
      {
        data: {
          title: "Inaccessible edit",
        },
      },
    );
    expect(inaccessibleResponse.status()).toBe(403);
  });

  test("rejects editing completed task", async ({ request }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Completed Edit Task"),
      createdById: managerId,
      statusCode: "DONE",
    });

    const response = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        title: "Completed edit attempt",
      },
    });

    expect(response.status()).toBe(409);
  });

  test("manager can create and list task comments with activity", async ({
    request,
  }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Commented Task"),
      createdById: managerId,
    });

    const response = await request.post(`/api/tasks/${task.id}/comments`, {
      data: {
        body: "  Please check the deployment notes.  ",
        authorId: "malicious-user-id",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.comment).toMatchObject({
      taskId: task.id,
      body: "Please check the deployment notes.",
      author: {
        id: managerId,
        email: users.manager.email,
      },
    });

    const listResponse = await request.get(`/api/tasks/${task.id}/comments`);
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.comments).toHaveLength(1);
    expect(listBody.comments[0]).toMatchObject({
      id: body.comment.id,
      body: "Please check the deployment notes.",
      author: {
        email: users.manager.email,
      },
    });

    const activity = await prisma.activityLog.findFirst({
      where: {
        taskId: task.id,
        type: "COMMENT_ADDED",
        entityType: "Comment",
        entityId: body.comment.id,
      },
      select: { id: true },
    });
    expect(activity).not.toBeNull();
  });

  test("rejects empty and too long task comments", async ({ request }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Invalid Comment Task"),
      createdById: managerId,
    });

    const emptyResponse = await request.post(`/api/tasks/${task.id}/comments`, {
      data: {
        body: "   ",
      },
    });
    expect(emptyResponse.status()).toBe(400);

    const tooLongResponse = await request.post(`/api/tasks/${task.id}/comments`, {
      data: {
        body: "x".repeat(5001),
      },
    });
    expect(tooLongResponse.status()).toBe(400);

    const commentsCount = await prisma.comment.count({
      where: { taskId: task.id },
    });
    expect(commentsCount).toBe(0);
  });

  test("viewer can read comments but cannot create them", async ({ request }) => {
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Viewer Comment Task"),
      createdById: managerId,
    });

    await prisma.comment.create({
      data: {
        taskId: task.id,
        authorId: managerId,
        body: "Visible existing comment",
      },
    });

    await login(request, users.viewer);

    const listResponse = await request.get(`/api/tasks/${task.id}/comments`);
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.comments[0]).toMatchObject({
      body: "Visible existing comment",
    });

    const createResponse = await request.post(`/api/tasks/${task.id}/comments`, {
      data: {
        body: "Viewer cannot add this",
      },
    });
    expect(createResponse.status()).toBe(403);
  });

  test("cannot read or create comments for an inaccessible task", async ({
    request,
  }) => {
    await login(request, users.manager);

    const listResponse = await request.get(
      "/api/tasks/seed-task-analytics-dashboard/comments",
    );
    expect(listResponse.status()).toBe(403);

    const createResponse = await request.post(
      "/api/tasks/seed-task-analytics-dashboard/comments",
      {
        data: {
          body: "Not allowed here",
        },
      },
    );
    expect(createResponse.status()).toBe(403);
  });

  test("rejects project from another department", async ({ request }) => {
    await login(request, users.manager);

    const response = await request.post("/api/tasks", {
      data: {
        title: uniqueTitle("API Wrong Project"),
        sourceDepartmentId: IT_DEPARTMENT_ID,
        projectId: ANALYTICS_PROJECT_ID,
      },
    });

    expect(response.status()).toBe(400);
  });

  test("rejects inactive assignee account", async ({ request }) => {
    await login(request, users.manager);
    const assigneeId = await getUserId(users.viewer.email);

    await prisma.user.update({
      where: { id: assigneeId },
      data: { isActive: false },
    });

    try {
      const response = await request.post("/api/tasks", {
        data: {
          title: uniqueTitle("API Inactive Assignee"),
          sourceDepartmentId: IT_DEPARTMENT_ID,
          assignedToId: assigneeId,
        },
      });

      expect(response.status()).toBe(400);
    } finally {
      await prisma.user.update({
        where: { id: assigneeId },
        data: { isActive: true },
      });
    }
  });

  test("rejects assignee without active membership in responsible department", async ({
    request,
  }) => {
    await login(request, users.manager);
    const formerMemberId = await getUserId(users.formerMember.email);

    const response = await request.post("/api/tasks", {
      data: {
        title: uniqueTitle("API Inactive Membership"),
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: formerMemberId,
      },
    });

    expect(response.status()).toBe(400);
  });

  test("enforces permissions and cross-department read restrictions", async ({
    request,
  }) => {
    await login(request, users.viewer);

    const createResponse = await request.post("/api/tasks", {
      data: {
        title: uniqueTitle("Viewer Forbidden Task"),
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(createResponse.status()).toBe(403);

    await login(request, users.manager);
    const analyticsListResponse = await request.get(
      `/api/tasks?departmentId=${ANALYTICS_DEPARTMENT_ID}`,
    );
    expect(analyticsListResponse.status()).toBe(403);

    const analyticsDetailResponse = await request.get(
      "/api/tasks/seed-task-analytics-dashboard",
    );
    expect(analyticsDetailResponse.status()).toBe(403);
  });

  test("cannot spoof createdById from request body", async ({ request }) => {
    await login(request, users.manager);
    const managerId = await getUserId(users.manager.email);

    const response = await request.post("/api/tasks", {
      data: {
        title: uniqueTitle("API Spoofed Creator"),
        sourceDepartmentId: IT_DEPARTMENT_ID,
        createdById: "malicious-user-id",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdTaskIds.push(body.task.id);

    expect(body.task.createdById).toBe(managerId);
    expect(body.task.createdBy.email).toBe(users.manager.email);
  });

  test("system admin can read tasks globally", async ({ request }) => {
    await login(request, users.systemAdmin);

    const response = await request.get("/api/tasks");
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(
      body.tasks.some(
        (task: { sourceDepartmentId: string }) =>
          task.sourceDepartmentId === ANALYTICS_DEPARTMENT_ID,
      ),
    ).toBe(true);
  });

  test("employee cannot assign during creation without TASKS_ASSIGN", async ({
    request,
  }) => {
    await login(request, users.employee);
    const assigneeId = await getUserId(users.employee.email);

    const response = await request.post("/api/tasks", {
      data: {
        title: uniqueTitle("API Employee Assign"),
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: assigneeId,
      },
    });

    expect(response.status()).toBe(403);
  });

  test("manager can reassign existing task without project membership and writes activity", async ({
    request,
  }) => {
    await login(request, users.manager);
    const assigneeId = await getUserId(users.viewer.email);
    const managerId = await getUserId(users.manager.email);
    const title = uniqueTitle("API Reassign Task");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        projectId: INTERNAL_PROJECT_ID,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: INTERNAL_PROJECT_ID,
          userId: assigneeId,
        },
      },
      select: { id: true },
    });
    expect(projectMember).toBeNull();

    const response = await request.patch(`/api/tasks/${createdBody.task.id}`, {
      data: {
        assignedToId: assigneeId,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.task).toMatchObject({
      id: createdBody.task.id,
      createdById: managerId,
      sourceDepartmentId: IT_DEPARTMENT_ID,
      assignedDepartmentId: IT_DEPARTMENT_ID,
      projectId: INTERNAL_PROJECT_ID,
      assignedToId: assigneeId,
      status: { code: "NEW" },
    });

    const activity = await prisma.activityLog.findFirst({
      where: {
        taskId: createdBody.task.id,
        type: "TASK_ASSIGNED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        actorId: true,
        departmentId: true,
        metadata: true,
      },
    });

    expect(activity).not.toBeNull();
    expect(activity).toMatchObject({
      actorId: managerId,
      departmentId: IT_DEPARTMENT_ID,
    });
    expect(activity?.metadata).toMatchObject({
      actorId: managerId,
      previousAssignedToId: null,
      assignedToId: assigneeId,
      assignedDepartmentId: IT_DEPARTMENT_ID,
    });
  });

  test("rejects empty assignee on existing task assignment", async ({ request }) => {
    await login(request, users.manager);
    const title = uniqueTitle("API Empty Reassign Task");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    const response = await request.patch(`/api/tasks/${createdBody.task.id}`, {
      data: {
        assignedToId: "",
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid request data.",
    });
  });

  test("reassigning to the same assignee does not write duplicate activity", async ({
    request,
  }) => {
    await login(request, users.manager);
    const assigneeId = await getUserId(users.employee.email);
    const title = uniqueTitle("API Same Assignee Task");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: assigneeId,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    const beforeCount = await prisma.activityLog.count({
      where: {
        taskId: createdBody.task.id,
        type: "TASK_ASSIGNED",
      },
    });

    const response = await request.patch(`/api/tasks/${createdBody.task.id}`, {
      data: {
        assignedToId: assigneeId,
      },
    });

    expect(response.status()).toBe(200);

    const afterCount = await prisma.activityLog.count({
      where: {
        taskId: createdBody.task.id,
        type: "TASK_ASSIGNED",
      },
    });

    expect(afterCount).toBe(beforeCount);
  });

  test("employee cannot assign existing task without TASKS_ASSIGN", async ({
    request,
  }) => {
    await login(request, users.employee);
    const assigneeId = await getUserId(users.employee.email);
    const title = uniqueTitle("API Employee Existing Assign");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    const response = await request.patch(`/api/tasks/${createdBody.task.id}`, {
      data: {
        assignedToId: assigneeId,
      },
    });

    expect(response.status()).toBe(403);
  });

  test("rejects assigning existing task to inactive account or inactive membership", async ({
    request,
  }) => {
    await login(request, users.manager);
    const inactiveAssigneeId = await getUserId(users.viewer.email);
    const formerMemberId = await getUserId(users.formerMember.email);
    const title = uniqueTitle("API Invalid Existing Assignee");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    await prisma.user.update({
      where: { id: inactiveAssigneeId },
      data: { isActive: false },
    });

    try {
      const inactiveUserResponse = await request.patch(
        `/api/tasks/${createdBody.task.id}`,
        {
          data: {
            assignedToId: inactiveAssigneeId,
          },
        },
      );

      expect(inactiveUserResponse.status()).toBe(400);
    } finally {
      await prisma.user.update({
        where: { id: inactiveAssigneeId },
        data: { isActive: true },
      });
    }

    const inactiveMembershipResponse = await request.patch(
      `/api/tasks/${createdBody.task.id}`,
      {
        data: {
          assignedToId: formerMemberId,
        },
      },
    );

    expect(inactiveMembershipResponse.status()).toBe(400);
  });

  test("rejects assigning completed task", async ({ request }) => {
    await login(request, users.manager);
    const assigneeId = await getUserId(users.employee.email);
    const title = uniqueTitle("API Completed Assign");

    const created = await request.post("/api/tasks", {
      data: {
        title,
        sourceDepartmentId: IT_DEPARTMENT_ID,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    createdTaskIds.push(createdBody.task.id);

    const doneStatus = await prisma.taskStatus.findUniqueOrThrow({
      where: { code: "DONE" },
      select: { id: true },
    });

    await prisma.task.update({
      where: { id: createdBody.task.id },
      data: { statusId: doneStatus.id },
    });

    const response = await request.patch(`/api/tasks/${createdBody.task.id}`, {
      data: {
        assignedToId: assigneeId,
      },
    });

    expect(response.status()).toBe(409);
  });

  test("assignee and requester can move task through the approved workflow and activity is written", async ({
    request,
  }) => {
    const managerId = await getUserId(users.manager.email);
    const employeeId = await getUserId(users.employee.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Workflow Task"),
      createdById: managerId,
      assignedToId: employeeId,
    });

    await login(request, users.employee);

    for (const [action, expectedStatus] of [
      ["START_ANALYSIS", "ANALYSIS"],
      ["START_PROGRESS", "IN_PROGRESS"],
      ["SUBMIT_REVIEW", "REVIEW"],
    ] as const) {
      const response = await request.post(`/api/tasks/${task.id}/transitions`, {
        data: { action },
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.task.status.code).toBe(expectedStatus);
    }

    await login(request, users.manager);
    const approveResponse = await request.post(`/api/tasks/${task.id}/transitions`, {
      data: { action: "APPROVE" },
    });

    expect(approveResponse.status()).toBe(200);
    const approveBody = await approveResponse.json();
    expect(approveBody.task.status.code).toBe("DONE");

    const activities = await prisma.activityLog.findMany({
      where: {
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
      },
      orderBy: { createdAt: "asc" },
      select: {
        actorId: true,
        metadata: true,
      },
    });

    expect(activities).toHaveLength(4);
    expect(activities[0].metadata).toMatchObject({
      actorId: employeeId,
      action: "START_ANALYSIS",
      previousStatusCode: "NEW",
      newStatusCode: "ANALYSIS",
      reason: null,
    });
    expect(activities[3]).toMatchObject({
      actorId: managerId,
    });
    expect(activities[3].metadata).toMatchObject({
      actorId: managerId,
      action: "APPROVE",
      previousStatusCode: "REVIEW",
      newStatusCode: "DONE",
      reason: null,
    });
  });

  test("rejects transition from the wrong current status", async ({ request }) => {
    const managerId = await getUserId(users.manager.email);
    const employeeId = await getUserId(users.employee.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Wrong Transition"),
      createdById: managerId,
      assignedToId: employeeId,
    });

    await login(request, users.employee);
    const response = await request.post(`/api/tasks/${task.id}/transitions`, {
      data: { action: "START_PROGRESS" },
    });

    expect(response.status()).toBe(409);
  });

  test("viewer cannot transition assigned task without status permission", async ({
    request,
  }) => {
    const managerId = await getUserId(users.manager.email);
    const viewerId = await getUserId(users.viewer.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Viewer Status Forbidden"),
      createdById: managerId,
      assignedToId: viewerId,
    });

    await login(request, users.viewer);
    const response = await request.post(`/api/tasks/${task.id}/transitions`, {
      data: { action: "START_ANALYSIS" },
    });

    expect(response.status()).toBe(403);
  });

  test("rejects return to progress without reason", async ({ request }) => {
    const managerId = await getUserId(users.manager.email);
    const employeeId = await getUserId(users.employee.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Return Reason Required"),
      createdById: managerId,
      assignedToId: employeeId,
      statusCode: "REVIEW",
    });

    await login(request, users.manager);
    const response = await request.post(`/api/tasks/${task.id}/transitions`, {
      data: { action: "RETURN_TO_PROGRESS", reason: "   " },
    });

    expect(response.status()).toBe(400);
  });

  test("assignee cannot approve own work and manager can review when creator is assignee", async ({
    request,
  }) => {
    const employeeId = await getUserId(users.employee.email);
    const managerId = await getUserId(users.manager.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Self Approval"),
      createdById: employeeId,
      assignedToId: employeeId,
      statusCode: "REVIEW",
    });

    await login(request, users.employee);
    const selfApproveResponse = await request.post(
      `/api/tasks/${task.id}/transitions`,
      {
        data: { action: "APPROVE" },
      },
    );
    expect(selfApproveResponse.status()).toBe(403);

    await login(request, users.manager);
    const returnResponse = await request.post(`/api/tasks/${task.id}/transitions`, {
      data: {
        action: "RETURN_TO_PROGRESS",
        reason: "Needs another pass before approval.",
      },
    });
    expect(returnResponse.status()).toBe(200);
    const returnBody = await returnResponse.json();
    expect(returnBody.task.status.code).toBe("IN_PROGRESS");

    const activity = await prisma.activityLog.findFirst({
      where: {
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        actorId: true,
        metadata: true,
      },
    });

    expect(activity).toMatchObject({ actorId: managerId });
    expect(activity?.metadata).toMatchObject({
      actorId: managerId,
      action: "RETURN_TO_PROGRESS",
      previousStatusCode: "REVIEW",
      newStatusCode: "IN_PROGRESS",
      reason: "Needs another pass before approval.",
    });
  });

  test("concurrent transitions only write one status activity", async ({ request }) => {
    const managerId = await getUserId(users.manager.email);
    const employeeId = await getUserId(users.employee.email);
    const task = await createTaskRecord({
      title: uniqueTitle("API Concurrent Transition"),
      createdById: managerId,
      assignedToId: employeeId,
    });

    await login(request, users.employee);

    const responses = await Promise.all([
      request.post(`/api/tasks/${task.id}/transitions`, {
        data: { action: "START_ANALYSIS" },
      }),
      request.post(`/api/tasks/${task.id}/transitions`, {
        data: { action: "START_ANALYSIS" },
      }),
    ]);

    expect(responses.map((response) => response.status()).sort()).toEqual([
      200,
      409,
    ]);

    const activityCount = await prisma.activityLog.count({
      where: {
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
      },
    });
    expect(activityCount).toBe(1);
  });
});
