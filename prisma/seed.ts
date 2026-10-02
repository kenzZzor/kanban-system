import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const SEED_PASSWORD = "DevOnly123!";

async function main() {
  console.log("Starting database seed...");

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  // ---------------------------------------------------------
  // Roles
  // ---------------------------------------------------------

  const roles = {
    SYSTEM_ADMIN: await prisma.role.upsert({
      where: { code: "SYSTEM_ADMIN" },
      update: {
        name: "System Administrator",
        description: "Global administrator with access to the entire system",
      },
      create: {
        code: "SYSTEM_ADMIN",
        name: "System Administrator",
        description: "Global administrator with access to the entire system",
      },
    }),

    DEPARTMENT_ADMIN: await prisma.role.upsert({
      where: { code: "DEPARTMENT_ADMIN" },
      update: {
        name: "Department Administrator",
        description: "Administrator of a specific department",
      },
      create: {
        code: "DEPARTMENT_ADMIN",
        name: "Department Administrator",
        description: "Administrator of a specific department",
      },
    }),

    MANAGER: await prisma.role.upsert({
      where: { code: "MANAGER" },
      update: {
        name: "Manager",
        description: "Manager within a specific department",
      },
      create: {
        code: "MANAGER",
        name: "Manager",
        description: "Manager within a specific department",
      },
    }),

    EMPLOYEE: await prisma.role.upsert({
      where: { code: "EMPLOYEE" },
      update: {
        name: "Employee",
        description: "Employee within a specific department",
      },
      create: {
        code: "EMPLOYEE",
        name: "Employee",
        description: "Employee within a specific department",
      },
    }),

    VIEWER: await prisma.role.upsert({
      where: { code: "VIEWER" },
      update: {
        name: "Viewer",
        description: "Read-only member of a specific department",
      },
      create: {
        code: "VIEWER",
        name: "Viewer",
        description: "Read-only member of a specific department",
      },
    }),
  };

  // ---------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------

  const permissionDefinitions = [
    ["USERS_READ", "Read users", "View users"],
    ["USERS_MANAGE", "Manage users", "Create and manage users"],
    [
      "DEPARTMENTS_READ",
      "Read departments",
      "View departments",
    ],
    [
      "DEPARTMENTS_MANAGE",
      "Manage departments",
      "Create and manage departments",
    ],
    ["MEMBERS_READ", "Read members", "View department members"],
    [
      "MEMBERS_MANAGE",
      "Manage members",
      "Add and manage department members",
    ],
    ["PROJECTS_READ", "Read projects", "View projects"],
    [
      "PROJECTS_MANAGE",
      "Manage projects",
      "Create and manage projects",
    ],
    ["TASKS_READ", "Read tasks", "View tasks"],
    ["TASKS_CREATE", "Create tasks", "Create new tasks"],
    ["TASKS_UPDATE", "Update tasks", "Update task information"],
    ["TASKS_ASSIGN", "Assign tasks", "Assign tasks to users"],
    [
      "TASKS_STATUS_CHANGE",
      "Change task status",
      "Change task workflow status",
    ],
    [
      "COMMENTS_CREATE",
      "Create comments",
      "Add comments to tasks",
    ],
    ["ACTIVITY_READ", "Read activity", "View activity history"],
    [
      "NOTIFICATIONS_READ",
      "Read notifications",
      "View notifications",
    ],
  ] as const;

  const permissions = new Map<
    string,
    { id: string; code: string }
  >();

  for (const [code, name, description] of permissionDefinitions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: {
        name,
        description,
      },
      create: {
        code,
        name,
        description,
      },
    });

    permissions.set(code, permission);
  }

  // ---------------------------------------------------------
  // Role permissions
  // ---------------------------------------------------------

  const allPermissions = Array.from(permissions.values());

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: roles.SYSTEM_ADMIN.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: roles.SYSTEM_ADMIN.id,
        permissionId: permission.id,
      },
    });
  }

  const departmentAdminPermissions = [
    "DEPARTMENTS_READ",
    "MEMBERS_READ",
    "MEMBERS_MANAGE",
    "PROJECTS_READ",
    "PROJECTS_MANAGE",
    "TASKS_READ",
    "TASKS_CREATE",
    "TASKS_UPDATE",
    "TASKS_ASSIGN",
    "TASKS_STATUS_CHANGE",
    "COMMENTS_CREATE",
    "ACTIVITY_READ",
    "NOTIFICATIONS_READ",
  ];

  const managerPermissions = [
    "MEMBERS_READ",
    "PROJECTS_READ",
    "TASKS_READ",
    "TASKS_CREATE",
    "TASKS_UPDATE",
    "TASKS_ASSIGN",
    "TASKS_STATUS_CHANGE",
    "COMMENTS_CREATE",
    "ACTIVITY_READ",
    "NOTIFICATIONS_READ",
  ];

  const employeePermissions = [
    "PROJECTS_READ",
    "TASKS_READ",
    "TASKS_CREATE",
    "TASKS_UPDATE",
    "TASKS_STATUS_CHANGE",
    "COMMENTS_CREATE",
    "NOTIFICATIONS_READ",
  ];

  const viewerPermissions = [
    "PROJECTS_READ",
    "TASKS_READ",
    "ACTIVITY_READ",
    "NOTIFICATIONS_READ",
  ];

  const rolePermissionMap = [
    [roles.DEPARTMENT_ADMIN.id, departmentAdminPermissions],
    [roles.MANAGER.id, managerPermissions],
    [roles.EMPLOYEE.id, employeePermissions],
    [roles.VIEWER.id, viewerPermissions],
  ] as const;

  for (const [roleId, permissionCodes] of rolePermissionMap) {
    for (const code of permissionCodes) {
      const permission = permissions.get(code);

      if (!permission) {
        throw new Error(`Permission ${code} was not created`);
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId,
          permissionId: permission.id,
        },
      });
    }
  }

  // ---------------------------------------------------------
  // Task statuses
  // ---------------------------------------------------------

  const statusDefinitions = [
    ["NEW", "New", 10, false],
    ["ANALYSIS", "Analysis", 20, false],
    ["BACKLOG", "Backlog", 30, false],
    ["READY", "Ready", 40, false],
    ["IN_PROGRESS", "In Progress", 50, false],
    ["REVIEW", "Review", 60, false],
    ["TESTING", "Testing", 70, false],
    ["DONE", "Done", 80, true],
    ["BLOCKED", "Blocked", 90, false],
    ["CANCELLED", "Cancelled", 100, true],
  ] as const;

  const statuses = new Map<
    string,
    { id: string; code: string }
  >();

  for (const [code, name, sortOrder, isFinal] of statusDefinitions) {
    const status = await prisma.taskStatus.upsert({
      where: { code },
      update: {
        name,
        sortOrder,
        isFinal,
      },
      create: {
        code,
        name,
        sortOrder,
        isFinal,
      },
    });

    statuses.set(code, status);
  }

  // ---------------------------------------------------------
  // Priorities
  // ---------------------------------------------------------

  const priorityDefinitions = [
    ["LOW", "Low", 10],
    ["MEDIUM", "Medium", 20],
    ["HIGH", "High", 30],
    ["CRITICAL", "Critical", 40],
  ] as const;

  const priorities = new Map<
    string,
    { id: string; code: string }
  >();

  for (const [code, name, sortOrder] of priorityDefinitions) {
    const priority = await prisma.priority.upsert({
      where: { code },
      update: {
        name,
        sortOrder,
      },
      create: {
        code,
        name,
        sortOrder,
      },
    });

    priorities.set(code, priority);
  }

  // ---------------------------------------------------------
  // Task types
  // ---------------------------------------------------------

  const taskTypeDefinitions = [
    ["TASK", "Task", "Regular work task"],
    ["BUG", "Bug", "Defect or problem"],
    ["REQUEST", "Request", "User or department request"],
    ["IMPROVEMENT", "Improvement", "Improvement or optimization"],
  ] as const;

  const taskTypes = new Map<
    string,
    { id: string; code: string }
  >();

  for (const [code, name, description] of taskTypeDefinitions) {
    const taskType = await prisma.taskType.upsert({
      where: { code },
      update: {
        name,
        description,
      },
      create: {
        code,
        name,
        description,
      },
    });

    taskTypes.set(code, taskType);
  }

  // ---------------------------------------------------------
  // Users
  // ---------------------------------------------------------

  const systemAdmin = await prisma.user.upsert({
    where: {
      email: "system.admin@kanban.local",
    },
    update: {
      firstName: "System",
      lastName: "Administrator",
      passwordHash,
      systemRoleId: roles.SYSTEM_ADMIN.id,
      isActive: true,
    },
    create: {
      email: "system.admin@kanban.local",
      passwordHash,
      firstName: "System",
      lastName: "Administrator",
      systemRoleId: roles.SYSTEM_ADMIN.id,
      isActive: true,
    },
  });

  const alice = await prisma.user.upsert({
    where: {
      email: "alice.admin@kanban.local",
    },
    update: {
      firstName: "Alice",
      lastName: "Admin",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "alice.admin@kanban.local",
      passwordHash,
      firstName: "Alice",
      lastName: "Admin",
      isActive: true,
    },
  });

  const bob = await prisma.user.upsert({
    where: {
      email: "bob.manager@kanban.local",
    },
    update: {
      firstName: "Bob",
      lastName: "Manager",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "bob.manager@kanban.local",
      passwordHash,
      firstName: "Bob",
      lastName: "Manager",
      isActive: true,
    },
  });

  const charlie = await prisma.user.upsert({
    where: {
      email: "charlie.employee@kanban.local",
    },
    update: {
      firstName: "Charlie",
      lastName: "Employee",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "charlie.employee@kanban.local",
      passwordHash,
      firstName: "Charlie",
      lastName: "Employee",
      isActive: true,
    },
  });

  const diana = await prisma.user.upsert({
    where: {
      email: "diana.viewer@kanban.local",
    },
    update: {
      firstName: "Diana",
      lastName: "Viewer",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "diana.viewer@kanban.local",
      passwordHash,
      firstName: "Diana",
      lastName: "Viewer",
      isActive: true,
    },
  });

  const eve = await prisma.user.upsert({
    where: {
      email: "eve.admin@kanban.local",
    },
    update: {
      firstName: "Eve",
      lastName: "Admin",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "eve.admin@kanban.local",
      passwordHash,
      firstName: "Eve",
      lastName: "Admin",
      isActive: true,
    },
  });

  const frank = await prisma.user.upsert({
    where: {
      email: "frank.manager@kanban.local",
    },
    update: {
      firstName: "Frank",
      lastName: "Manager",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "frank.manager@kanban.local",
      firstName: "Frank",
      lastName: "Manager",
      passwordHash,
      isActive: true,
    },
  });

  const grace = await prisma.user.upsert({
    where: {
      email: "grace.employee@kanban.local",
    },
    update: {
      firstName: "Grace",
      lastName: "Employee",
      passwordHash,
      systemRoleId: null,
      isActive: true,
    },
    create: {
      email: "grace.employee@kanban.local",
      firstName: "Grace",
      lastName: "Employee",
      passwordHash,
      isActive: true,
    },
  });

  // ---------------------------------------------------------
  // Departments
  // ---------------------------------------------------------

  const itDepartment = await prisma.department.upsert({
    where: {
      id: "seed-department-it",
    },
    update: {
      name: "IT Department",
      description: "Information technology department",
      createdById: systemAdmin.id,
    },
    create: {
      id: "seed-department-it",
      name: "IT Department",
      description: "Information technology department",
      createdById: systemAdmin.id,
    },
  });

  const analyticsDepartment = await prisma.department.upsert({
    where: {
      id: "seed-department-analytics",
    },
    update: {
      name: "Analytics Department",
      description: "Data and analytics department",
      createdById: systemAdmin.id,
    },
    create: {
      id: "seed-department-analytics",
      name: "Analytics Department",
      description: "Data and analytics department",
      createdById: systemAdmin.id,
    },
  });

  // ---------------------------------------------------------
  // Department managers
  // ---------------------------------------------------------

  await prisma.department.update({
    where: {
      id: itDepartment.id,
    },
    data: {
      managerId: bob.id,
    },
  });

  await prisma.department.update({
    where: {
      id: analyticsDepartment.id,
    },
    data: {
      managerId: frank.id,
    },
  });

  // ---------------------------------------------------------
  // Department memberships
  // ---------------------------------------------------------

  const memberships = [
    {
      departmentId: itDepartment.id,
      userId: alice.id,
      roleId: roles.DEPARTMENT_ADMIN.id,
    },
    {
      departmentId: itDepartment.id,
      userId: bob.id,
      roleId: roles.MANAGER.id,
    },
    {
      departmentId: itDepartment.id,
      userId: charlie.id,
      roleId: roles.EMPLOYEE.id,
      managerUserId: bob.id,
    },
    {
      departmentId: itDepartment.id,
      userId: diana.id,
      roleId: roles.VIEWER.id,
    },
    {
      departmentId: analyticsDepartment.id,
      userId: eve.id,
      roleId: roles.DEPARTMENT_ADMIN.id,
    },
    {
      departmentId: analyticsDepartment.id,
      userId: frank.id,
      roleId: roles.MANAGER.id,
    },
    {
      departmentId: analyticsDepartment.id,
      userId: grace.id,
      roleId: roles.EMPLOYEE.id,
      managerUserId: frank.id,
    },
  ];

  const membershipMap = new Map<string, { id: string }>();

  for (const membership of memberships) {
    let managerId: string | undefined;

    if (membership.managerUserId) {
      const managerMembership = memberships.find(
        (item) =>
          item.departmentId === membership.departmentId &&
          item.userId === membership.managerUserId,
      );

      if (managerMembership) {
        const existingManagerMembership =
          await prisma.departmentMember.findUnique({
            where: {
              departmentId_userId: {
                departmentId: managerMembership.departmentId,
                userId: managerMembership.userId,
              },
            },
          });

        managerId = existingManagerMembership?.id;
      }
    }

    const record = await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: {
          departmentId: membership.departmentId,
          userId: membership.userId,
        },
      },
      update: {
        roleId: membership.roleId,
        managerId,
      },
    create: {
        departmentId: membership.departmentId,
        userId: membership.userId,
        roleId: membership.roleId,
        managerId,
      },
    });

    membershipMap.set(
      `${membership.departmentId}:${membership.userId}`,
      record,
    );
  }

  // ---------------------------------------------------------
  // Projects
  // ---------------------------------------------------------

  const internalSystemsProject = await prisma.project.upsert({
    where: {
      id: "seed-project-internal-systems",
    },
    update: {
      name: "Internal Systems",
      description: "Internal corporate systems and infrastructure",
      departmentId: itDepartment.id,
      createdById: alice.id,
      isArchived: false,
    },
    create: {
      id: "seed-project-internal-systems",
      name: "Internal Systems",
      description: "Internal corporate systems and infrastructure",
      departmentId: itDepartment.id,
      createdById: alice.id,
    },
  });

  const analyticsPlatformProject = await prisma.project.upsert({
    where: {
      id: "seed-project-analytics-platform",
    },
    update: {
      name: "Analytics Platform",
      description: "Corporate analytics and reporting platform",
      departmentId: analyticsDepartment.id,
      createdById: eve.id,
      isArchived: false,
    },
    create: {
      id: "seed-project-analytics-platform",
      name: "Analytics Platform",
      description: "Corporate analytics and reporting platform",
      departmentId: analyticsDepartment.id,
      createdById: eve.id,
    },
  });

  // ---------------------------------------------------------
  // Project members
  // ---------------------------------------------------------

  const projectMemberships = [
    [internalSystemsProject.id, alice.id],
    [internalSystemsProject.id, bob.id],
    [internalSystemsProject.id, charlie.id],
    [analyticsPlatformProject.id, eve.id],
    [analyticsPlatformProject.id, frank.id],
    [analyticsPlatformProject.id, grace.id],
  ] as const;

  for (const [projectId, userId] of projectMemberships) {
    await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      update: {},
      create: {
        projectId,
        userId,
      },
    });
  }

  // ---------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------

  const taskNew = await prisma.task.upsert({
    where: {
      id: "seed-task-internal-access",
    },
    update: {
      title: "Configure internal system access",
      description: "Configure access for a new internal system.",
      createdById: alice.id,
      sourceDepartmentId: itDepartment.id,
      assignedToId: charlie.id,
      assignedDepartmentId: itDepartment.id,
      projectId: internalSystemsProject.id,
      statusId: statuses.get("IN_PROGRESS")!.id,
      priorityId: priorities.get("HIGH")!.id,
      taskTypeId: taskTypes.get("TASK")!.id,
      archivedAt: null,
    },
    create: {
      id: "seed-task-internal-access",
      title: "Configure internal system access",
      description: "Configure access for a new internal system.",
      createdById: alice.id,
      sourceDepartmentId: itDepartment.id,
      assignedToId: charlie.id,
      assignedDepartmentId: itDepartment.id,
      projectId: internalSystemsProject.id,
      statusId: statuses.get("IN_PROGRESS")!.id,
      priorityId: priorities.get("HIGH")!.id,
      taskTypeId: taskTypes.get("TASK")!.id,
    },
  });

  await prisma.task.upsert({
    where: {
      id: "seed-task-analytics-dashboard",
    },
    update: {
      title: "Prepare analytics dashboard",
      description: "Prepare the first version of the corporate analytics dashboard.",
      createdById: eve.id,
      sourceDepartmentId: analyticsDepartment.id,
      assignedToId: grace.id,
      assignedDepartmentId: analyticsDepartment.id,
      projectId: analyticsPlatformProject.id,
      statusId: statuses.get("REVIEW")!.id,
      priorityId: priorities.get("MEDIUM")!.id,
      taskTypeId: taskTypes.get("IMPROVEMENT")!.id,
      archivedAt: null,
    },
    create: {
      id: "seed-task-analytics-dashboard",
      title: "Prepare analytics dashboard",
      description: "Prepare the first version of the corporate analytics dashboard.",
      createdById: eve.id,
      sourceDepartmentId: analyticsDepartment.id,
      assignedToId: grace.id,
      assignedDepartmentId: analyticsDepartment.id,
      projectId: analyticsPlatformProject.id,
      statusId: statuses.get("REVIEW")!.id,
      priorityId: priorities.get("MEDIUM")!.id,
      taskTypeId: taskTypes.get("IMPROVEMENT")!.id,
    },
  });

  const crossDepartmentTask = await prisma.task.upsert({
    where: {
      id: "seed-task-cross-department",
    },
    update: {
      title: "Provide data for corporate report",
      description:
        "IT Department should provide data required by the Analytics Department.",
      createdById: bob.id,
      sourceDepartmentId: itDepartment.id,
      assignedToId: grace.id,
      assignedDepartmentId: analyticsDepartment.id,
      projectId: analyticsPlatformProject.id,
      statusId: statuses.get("READY")!.id,
      priorityId: priorities.get("HIGH")!.id,
      taskTypeId: taskTypes.get("REQUEST")!.id,
      archivedAt: null,
    },
    create: {
      id: "seed-task-cross-department",
      title: "Provide data for corporate report",
      description:
        "IT Department should provide data required by the Analytics Department.",
      createdById: bob.id,
      sourceDepartmentId: itDepartment.id,
      assignedToId: grace.id,
      assignedDepartmentId: analyticsDepartment.id,
      projectId: analyticsPlatformProject.id,
      statusId: statuses.get("READY")!.id,
      priorityId: priorities.get("HIGH")!.id,
      taskTypeId: taskTypes.get("REQUEST")!.id,
    },
  });

  // ---------------------------------------------------------
  // Comments
  // ---------------------------------------------------------

  await prisma.comment.upsert({
    where: {
      id: "seed-comment-internal-access",
    },
    update: {
      body: "Access configuration is currently in progress.",
      authorId: charlie.id,
    },
    create: {
      id: "seed-comment-internal-access",
      taskId: taskNew.id,
      authorId: charlie.id,
      body: "Access configuration is currently in progress.",
    },
  });

  await prisma.comment.upsert({
    where: {
      id: "seed-comment-cross-department",
    },
    update: {
      body: "Data requirements have been received.",
      authorId: grace.id,
    },
    create: {
      id: "seed-comment-cross-department",
      taskId: crossDepartmentTask.id,
      authorId: grace.id,
      body: "Data requirements have been received.",
    },
  });

  // ---------------------------------------------------------
  // Activity
  // ---------------------------------------------------------

  await prisma.activityLog.upsert({
    where: {
      id: "seed-activity-task-created",
    },
    update: {
      description: "Task was created.",
      actorId: alice.id,
      entityType: "TASK",
      entityId: taskNew.id,
    },
    create: {
      id: "seed-activity-task-created",
      type: "TASK_CREATED",
      taskId: taskNew.id,
      actorId: alice.id,
      entityType: "TASK",
      entityId: taskNew.id,
      description: "Task was created.",
    },
  });

  await prisma.activityLog.upsert({
    where: {
      id: "seed-activity-task-assigned",
    },
    update: {
      description: "Task was assigned to Charlie Employee.",
      actorId: alice.id,
      entityType: "TASK",
      entityId: taskNew.id,
    },
    create: {
      id: "seed-activity-task-assigned",
      type: "TASK_ASSIGNED",
      taskId: taskNew.id,
      actorId: alice.id,
      entityType: "TASK",
      entityId: taskNew.id,
      description: "Task was assigned to Charlie Employee.",
    },
  });

  await prisma.activityLog.upsert({
    where: {
      id: "seed-activity-cross-department",
    },
    update: {
      description: "Task was assigned across departments.",
      actorId: bob.id,
      entityType: "TASK",
      entityId: crossDepartmentTask.id,
    },
    create: {
      id: "seed-activity-cross-department",
      type: "TASK_ASSIGNED",
      taskId: crossDepartmentTask.id,
      actorId: bob.id,
      entityType: "TASK",
      entityId: crossDepartmentTask.id,
      description: "Task was assigned across departments.",
    },
  });

  // ---------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------

  await prisma.notification.upsert({
    where: {
      id: "seed-notification-charlie",
    },
    update: {
      title: "New task assigned",
      message: "You have been assigned a new task.",
      userId: charlie.id,
      taskId: taskNew.id,
      isRead: false,
      readAt: null,
    },
    create: {
      id: "seed-notification-charlie",
      userId: charlie.id,
      type: "TASK_ASSIGNED",
      title: "New task assigned",
      message: "You have been assigned a new task.",
      taskId: taskNew.id,
    },
  });

  await prisma.notification.upsert({
    where: {
      id: "seed-notification-grace",
    },
    update: {
      title: "Cross-department task",
      message: "A task from another department has been assigned to you.",
      userId: grace.id,
      taskId: crossDepartmentTask.id,
      isRead: false,
      readAt: null,
    },
    create: {
      id: "seed-notification-grace",
      userId: grace.id,
      type: "CROSS_DEPARTMENT_REQUEST",
      title: "Cross-department task",
      message: "A task from another department has been assigned to you.",
      taskId: crossDepartmentTask.id,
    },
  });

  console.log("");
  console.log("Database seed completed successfully.");
  console.log("");
  console.log("Development login:");
  console.log("  Password: DevOnly123!");
  console.log("");
  console.log("Users:");
  console.log("  system.admin@kanban.local");
  console.log("  alice.admin@kanban.local");
  console.log("  bob.manager@kanban.local");
  console.log("  charlie.employee@kanban.local");
  console.log("  diana.viewer@kanban.local");
  console.log("  eve.admin@kanban.local");
  console.log("  frank.manager@kanban.local");
  console.log("  grace.employee@kanban.local");
}

main()
  .catch((error) => {
    console.error("Database seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });