import type { Prisma } from "@/app/generated/prisma/client";

import { logActivity } from "@/lib/activity/service";
import { ForbiddenError, NotFoundError } from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import { PERMISSION_CODES } from "@/lib/permissions/codes";
import { hasPermission } from "@/lib/permissions/service";

const PROJECT_READ_CODE = PERMISSION_CODES.PROJECTS_READ;
const PROJECT_MANAGE_CODE = PERMISSION_CODES.PROJECTS_MANAGE;

export const projectSelect = {
  id: true,
  name: true,
  description: true,
  departmentId: true,
  createdById: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
  department: {
    select: {
      id: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
    },
  },
} satisfies Prisma.ProjectSelect;

interface ListProjectsInput {
  userId: string;
  departmentId?: string;
}

interface CreateProjectInput {
  userId: string;
  name: string;
  description?: string;
  departmentId: string;
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

export async function listProjectsForUser({
  userId,
  departmentId,
}: ListProjectsInput) {
  const isSystemAdminReader = await hasPermission(userId, PROJECT_READ_CODE);

  if (isSystemAdminReader) {
    if (departmentId) {
      await assertDepartmentExists(departmentId);
    }

    return prisma.project.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: {
        createdAt: "asc",
      },
      select: projectSelect,
    });
  }

  if (departmentId) {
    const canReadDepartment = await hasPermission(
      userId,
      PROJECT_READ_CODE,
      departmentId,
    );

    if (!canReadDepartment) {
      throw new ForbiddenError();
    }

    await assertDepartmentExists(departmentId);

    return prisma.project.findMany({
      where: { departmentId },
      orderBy: {
        createdAt: "asc",
      },
      select: projectSelect,
    });
  }

  const readableDepartmentIds = await findDepartmentIdsByPermission(
    userId,
    PROJECT_READ_CODE,
  );

  if (readableDepartmentIds.length === 0) {
    throw new ForbiddenError();
  }

  return prisma.project.findMany({
    where: {
      departmentId: {
        in: readableDepartmentIds,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: projectSelect,
  });
}

export async function createProjectForUser({
  userId,
  name,
  description,
  departmentId,
}: CreateProjectInput) {
  const isSystemAdminManager = await hasPermission(userId, PROJECT_MANAGE_CODE);

  if (!isSystemAdminManager) {
    const canManageDepartment = await hasPermission(
      userId,
      PROJECT_MANAGE_CODE,
      departmentId,
    );

    if (!canManageDepartment) {
      throw new ForbiddenError();
    }
  }

  await assertDepartmentExists(departmentId);

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name,
        description: description || null,
        departmentId,
        createdById: userId,
      },
      select: projectSelect,
    });

    await logActivity({
      type: "PROJECT_CREATED",
      actorId: userId,
      entityType: "Project",
      entityId: project.id,
      departmentId: project.departmentId,
      description: `Project ${project.name} was created.`,
      metadata: {
        projectId: project.id,
        name: project.name,
        departmentId: project.departmentId,
      },
      tx,
    });

    return project;
  });
}

export async function canCreateProjects(userId: string) {
  const isSystemAdminManager = await hasPermission(userId, PROJECT_MANAGE_CODE);
  if (isSystemAdminManager) {
    return true;
  }

  const manageableDepartmentIds = await findDepartmentIdsByPermission(
    userId,
    PROJECT_MANAGE_CODE,
  );

  return manageableDepartmentIds.length > 0;
}

export async function canReadProjects(userId: string) {
  const isSystemAdminReader = await hasPermission(userId, PROJECT_READ_CODE);
  if (isSystemAdminReader) {
    return true;
  }

  const readableDepartmentIds = await findDepartmentIdsByPermission(
    userId,
    PROJECT_READ_CODE,
  );

  return readableDepartmentIds.length > 0;
}
