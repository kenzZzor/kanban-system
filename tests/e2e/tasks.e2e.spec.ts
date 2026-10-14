import { expect, test } from "@playwright/test";
import type { TaskStatusCode } from "@/app/generated/prisma/client";

import { prisma } from "../../lib/db";

const manager = {
  email: "bob.manager@kanban.local",
  password: "DevOnly123!",
};

const viewer = {
  email: "diana.viewer@kanban.local",
  password: "DevOnly123!",
};

const IT_DEPARTMENT_ID = "seed-department-it";
const INTERNAL_PROJECT_ID = "seed-project-internal-systems";
const createdTaskIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdMembershipIds: string[] = [];

function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
}

async function login(
  page: import("@playwright/test").Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/login");
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");
}

async function createTaskRecord({
  title,
  createdById,
  assignedToId,
  statusCode = "NEW",
}: {
  title: string;
  createdById: string;
  assignedToId: string;
  statusCode?: string;
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
      sourceDepartmentId: IT_DEPARTMENT_ID,
      assignedDepartmentId: IT_DEPARTMENT_ID,
      assignedToId,
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

  if (createdMembershipIds.length > 0) {
    await prisma.departmentMember.deleteMany({
      where: { id: { in: createdMembershipIds } },
    });
  }

  if (createdDepartmentIds.length > 0) {
    await prisma.department.deleteMany({
      where: { id: { in: createdDepartmentIds } },
    });
  }

  await prisma.$disconnect();
});

test.describe("Tasks UI", () => {
  test("manager can open tasks page, create task and view details", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Task");
    const assignee = await prisma.user.findUniqueOrThrow({
      where: { email: "charlie.employee@kanban.local" },
      select: { id: true },
    });

    await login(page, manager);
    await page.getByRole("link", { name: "Задачи" }).click();

    await expect(page).toHaveURL("/tasks");
    await expect(page.getByRole("heading", { name: "Задачи" })).toBeVisible();
    await expect(page.getByText("Configure internal system access")).toBeVisible();

    await page.getByRole("button", { name: "Создать задачу" }).click();
    await page.fill("#task-title", taskTitle);
    await page.selectOption("#task-source-department", "seed-department-it");
    await page.selectOption("#task-project", "seed-project-internal-systems");
    await expect(page.locator(`#task-assignee option[value="${assignee.id}"]`)).toHaveCount(1);
    await page.selectOption("#task-assignee", assignee.id);
    await page.fill("#task-due-date", "2026-12-31");
    await page.fill("#task-description", "Created by E2E task core test");
    await page.getByRole("button", { name: "Создать", exact: true }).click();

    await expect(page.getByText("Задача создана.")).toBeVisible();
    await expect(page.getByRole("link", { name: taskTitle })).toBeVisible();

    const created = await prisma.task.findFirst({
      where: { title: taskTitle },
      select: { id: true },
    });
    expect(created).not.toBeNull();
    if (created) {
      createdTaskIds.push(created.id);
    }

    await page.getByRole("link", { name: taskTitle }).click();
    await expect(page).toHaveURL(/\/tasks\/.+/);
    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();
    await expect(page.getByText("Internal Systems")).toBeVisible();
    await expect(page.getByText("Employee Charlie", { exact: true })).toBeVisible();
  });

  test("details page shows task history and timing", async ({ page }) => {
    const taskTitle = uniqueTitle("UI History Timing Task");
    const [managerUser, employeeUser, doneStatus, priority, taskType] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: manager.email },
          select: { id: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "charlie.employee@kanban.local" },
          select: { id: true },
        }),
        prisma.taskStatus.findUniqueOrThrow({
          where: { code: "DONE" },
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

    const base = new Date("2026-01-01T00:00:00.000Z");
    const task = await prisma.task.create({
      data: {
        title: taskTitle,
        createdById: managerUser.id,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: employeeUser.id,
        statusId: doneStatus.id,
        priorityId: priority.id,
        taskTypeId: taskType.id,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    await prisma.activityLog.createMany({
      data: [
        {
          type: "TASK_CREATED",
          actorId: managerUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: `Task ${taskTitle} was created.`,
          metadata: { taskId: task.id },
          createdAt: base,
        },
        {
          type: "TASK_ASSIGNED",
          actorId: managerUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: `Task ${taskTitle} was assigned.`,
          metadata: {
            taskId: task.id,
            assignedToId: employeeUser.id,
            assignedDepartmentId: IT_DEPARTMENT_ID,
          },
          createdAt: base,
        },
        {
          type: "TASK_STATUS_CHANGED",
          actorId: employeeUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: "Task status changed from NEW to ANALYSIS.",
          metadata: {
            taskId: task.id,
            action: "START_ANALYSIS",
            previousStatusCode: "NEW",
            newStatusCode: "ANALYSIS",
            reason: null,
          },
          createdAt: new Date(base.getTime() + 10 * 60_000),
        },
        {
          type: "TASK_STATUS_CHANGED",
          actorId: employeeUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: "Task status changed from ANALYSIS to IN_PROGRESS.",
          metadata: {
            taskId: task.id,
            action: "START_PROGRESS",
            previousStatusCode: "ANALYSIS",
            newStatusCode: "IN_PROGRESS",
            reason: null,
          },
          createdAt: new Date(base.getTime() + 20 * 60_000),
        },
        {
          type: "TASK_STATUS_CHANGED",
          actorId: employeeUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: "Task status changed from IN_PROGRESS to REVIEW.",
          metadata: {
            taskId: task.id,
            action: "SUBMIT_REVIEW",
            previousStatusCode: "IN_PROGRESS",
            newStatusCode: "REVIEW",
            reason: null,
          },
          createdAt: new Date(base.getTime() + 30 * 60_000),
        },
        {
          type: "TASK_STATUS_CHANGED",
          actorId: managerUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: "Task status changed from REVIEW to IN_PROGRESS.",
          metadata: {
            taskId: task.id,
            action: "RETURN_TO_PROGRESS",
            previousStatusCode: "REVIEW",
            newStatusCode: "IN_PROGRESS",
            reason: "Нужно уточнить результат.",
          },
          createdAt: new Date(base.getTime() + 40 * 60_000),
        },
        {
          type: "TASK_STATUS_CHANGED",
          actorId: employeeUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: "Task status changed from IN_PROGRESS to REVIEW.",
          metadata: {
            taskId: task.id,
            action: "SUBMIT_REVIEW",
            previousStatusCode: "IN_PROGRESS",
            newStatusCode: "REVIEW",
            reason: null,
          },
          createdAt: new Date(base.getTime() + 55 * 60_000),
        },
        {
          type: "TASK_STATUS_CHANGED",
          actorId: managerUser.id,
          entityType: "Task",
          entityId: task.id,
          taskId: task.id,
          departmentId: IT_DEPARTMENT_ID,
          description: "Task status changed from REVIEW to DONE.",
          metadata: {
            taskId: task.id,
            action: "APPROVE",
            previousStatusCode: "REVIEW",
            newStatusCode: "DONE",
            reason: null,
          },
          createdAt: new Date(base.getTime() + 60 * 60_000),
        },
      ],
    });

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Время выполнения" })).toBeVisible();
    await expect(page.getByText("Общее время")).toBeVisible();
    await expect(page.getByText("1 ч.", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "История задачи" })).toBeVisible();
    await expect(page.getByText("Задача создана")).toBeVisible();
    await expect(page.getByText("Исполнитель назначен")).toBeVisible();
    await expect(page.getByText("Новая → На анализе")).toBeVisible();
    await expect(page.getByText("Возвращена на доработку")).toBeVisible();
    await expect(page.getByText("Причина: Нужно уточнить результат.")).toBeVisible();
    await expect(page.getByText("Результат подтверждён")).toBeVisible();
    await expect(page.getByText("Автор: Manager Bob").first()).toBeVisible();
  });

  test("manager can add a comment from task details", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Comment Task");
    const managerUser = await prisma.user.findUniqueOrThrow({
      where: { email: manager.email },
      select: { id: true },
    });
    const task = await createTaskRecord({
      title: taskTitle,
      createdById: managerUser.id,
      assignedToId: managerUser.id,
    });
    const commentText = `Comment from details ${Date.now()}`;

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Комментарии" })).toBeVisible();
    await expect(page.getByText("Комментариев пока нет.")).toBeVisible();

    await page.fill("#task-comment-body", commentText);
    await page.getByRole("button", { name: "Отправить" }).click();

    await expect(page.getByText("Комментарий добавлен.")).toBeVisible();
    await expect(page.getByText(commentText)).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: commentText }).getByText("Manager Bob"),
    ).toBeVisible();
  });

  test("manager can edit task details from details page", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Editable Task");
    const managerUser = await prisma.user.findUniqueOrThrow({
      where: { email: manager.email },
      select: { id: true },
    });
    const task = await createTaskRecord({
      title: taskTitle,
      createdById: managerUser.id,
      assignedToId: managerUser.id,
    });
    const updatedTitle = uniqueTitle("UI Updated Task");

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();

    await page.fill("#task-edit-title", updatedTitle);
    await page.fill("#task-edit-description", "Updated from E2E edit form");
    await page.fill("#task-edit-due-date", "2026-12-29");
    await page.selectOption("#task-edit-priority", "HIGH");
    await page.getByRole("button", { name: "Сохранить изменения" }).click();

    await expect(page.getByText("Задача обновлена.")).toBeVisible();
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await expect(
      page.locator("p").filter({ hasText: "Updated from E2E edit form" }),
    ).toBeVisible();
    await expect(page.locator("span").filter({ hasText: "Высокий" })).toBeVisible();
  });

  test("viewer sees tasks but cannot create them", async ({ page }) => {
    await login(page, viewer);
    await page.goto("/tasks");

    await expect(page.getByRole("heading", { name: "Задачи" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Создать задачу" })).toHaveCount(0);
  });

  test("manager can reassign task from details page", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Reassign Task");
    const [managerUser, initialAssignee, nextAssignee, status, priority, taskType] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: manager.email },
          select: { id: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "charlie.employee@kanban.local" },
          select: { id: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: viewer.email },
          select: { id: true },
        }),
        prisma.taskStatus.findUniqueOrThrow({
          where: { code: "NEW" },
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

    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: INTERNAL_PROJECT_ID,
          userId: nextAssignee.id,
        },
      },
      select: { id: true },
    });
    expect(projectMember).toBeNull();

    const task = await prisma.task.create({
      data: {
        title: taskTitle,
        createdById: managerUser.id,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: initialAssignee.id,
        projectId: INTERNAL_PROJECT_ID,
        statusId: status.id,
        priorityId: priority.id,
        taskTypeId: taskType.id,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();
    await expect(page.getByText("Employee Charlie", { exact: true })).toBeVisible();

    await page.selectOption("#task-detail-assignee", nextAssignee.id);
    await page.getByRole("button", { name: "Назначить" }).click();

    await expect(page.getByText("Исполнитель обновлён.")).toBeVisible();
    await expect(page.getByText("Viewer Diana", { exact: true })).toBeVisible();

    const updatedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: {
        assignedToId: true,
        createdById: true,
        sourceDepartmentId: true,
        assignedDepartmentId: true,
        projectId: true,
      },
    });
    expect(updatedTask).toMatchObject({
      assignedToId: nextAssignee.id,
      createdById: managerUser.id,
      sourceDepartmentId: IT_DEPARTMENT_ID,
      assignedDepartmentId: IT_DEPARTMENT_ID,
      projectId: INTERNAL_PROJECT_ID,
    });
  });

  test("assignee can start analysis from details page", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Start Analysis Task");
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: manager.email },
      select: { id: true },
    });
    const task = await createTaskRecord({
      title: taskTitle,
      createdById: user.id,
      assignedToId: user.id,
    });

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await expect(page.getByRole("heading", { name: taskTitle })).toBeVisible();
    await page.getByRole("button", { name: "Начать анализ" }).click();

    await expect(page.getByText("Статус задачи обновлён.")).toBeVisible();
    await expect(page.getByText("Текущий статус: На анализе")).toBeVisible();

    const updatedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: {
        status: {
          select: { code: true },
        },
      },
    });
    expect(updatedTask.status.code).toBe("ANALYSIS");
  });

  test("reviewer must provide reason before returning task", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Return Task");
    const [managerUser, employeeUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: manager.email },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "charlie.employee@kanban.local" },
        select: { id: true },
      }),
    ]);
    const task = await createTaskRecord({
      title: taskTitle,
      createdById: managerUser.id,
      assignedToId: employeeUser.id,
      statusCode: "REVIEW",
    });

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await page.getByRole("button", { name: "Вернуть на доработку" }).click();
    await expect(page.getByText("Укажите причину возврата.")).toBeVisible();

    await page.fill("#task-return-reason", "Нужно уточнить результат.");
    await page.getByRole("button", { name: "Вернуть на доработку" }).click();

    await expect(page.getByText("Статус задачи обновлён.")).toBeVisible();
    await expect(page.getByText("Текущий статус: В работе")).toBeVisible();

    const activity = await prisma.activityLog.findFirst({
      where: {
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    expect(activity?.metadata).toMatchObject({
      action: "RETURN_TO_PROGRESS",
      reason: "Нужно уточнить результат.",
    });
  });

  test("shows empty list for accessible department without tasks", async ({ page }) => {
    const managerUser = await prisma.user.findUniqueOrThrow({
      where: { email: manager.email },
      select: { id: true },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: "MANAGER" },
      select: { id: true },
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "system.admin@kanban.local" },
      select: { id: true },
    });
    const department = await prisma.department.create({
      data: {
        name: uniqueTitle("Empty Tasks Department"),
        createdById: owner.id,
      },
      select: { id: true },
    });
    createdDepartmentIds.push(department.id);

    const membership = await prisma.departmentMember.create({
      data: {
        departmentId: department.id,
        userId: managerUser.id,
        roleId: role.id,
      },
      select: { id: true },
    });
    createdMembershipIds.push(membership.id);

    await login(page, manager);
    await page.goto("/tasks");
    await page.selectOption("#tasks-department-filter", department.id);

    await expect(page.getByText("Доступные задачи не найдены.")).toBeVisible();
  });

  test("shows API error for failed task creation", async ({ page }) => {
    await login(page, manager);
    await page.goto("/tasks");

    await page.route("**/api/tasks", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Task data changed concurrently. Refresh and try again.",
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.getByRole("button", { name: "Создать задачу" }).click();
    await page.fill("#task-title", uniqueTitle("UI Task Error"));
    await page.selectOption("#task-source-department", "seed-department-it");
    await page.getByRole("button", { name: "Создать", exact: true }).click();

    await expect(
      page.getByText("Task data changed concurrently. Refresh and try again."),
    ).toBeVisible();
  });

  test("shows API error for failed assignment", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Assign Error Task");
    const [managerUser, assignee, status, priority, taskType] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: manager.email },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "charlie.employee@kanban.local" },
        select: { id: true },
      }),
      prisma.taskStatus.findUniqueOrThrow({
        where: { code: "NEW" },
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
        title: taskTitle,
        createdById: managerUser.id,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: assignee.id,
        statusId: status.id,
        priorityId: priority.id,
        taskTypeId: taskType.id,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await page.route(`**/api/tasks/${task.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Completed task cannot be assigned.",
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.getByRole("button", { name: "Назначить" }).click();

    await expect(page.getByText("Completed task cannot be assigned.")).toBeVisible();
  });

  test("shows API error for failed task edit", async ({ page }) => {
    const taskTitle = uniqueTitle("UI Failed Edit Task");
    const [managerUser, assignee, status, priority, taskType] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: manager.email },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: viewer.email },
        select: { id: true },
      }),
      prisma.taskStatus.findUniqueOrThrow({
        where: { code: "NEW" },
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
        title: taskTitle,
        createdById: managerUser.id,
        sourceDepartmentId: IT_DEPARTMENT_ID,
        assignedDepartmentId: IT_DEPARTMENT_ID,
        assignedToId: assignee.id,
        statusId: status.id,
        priorityId: priority.id,
        taskTypeId: taskType.id,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    await login(page, manager);
    await page.goto(`/tasks/${task.id}`);

    await page.route(`**/api/tasks/${task.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Completed task cannot be edited.",
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.fill("#task-edit-title", "Rejected edit title");
    await page.getByRole("button", { name: "Сохранить изменения" }).click();

    await expect(page.getByText("Completed task cannot be edited.")).toBeVisible();
  });
});
