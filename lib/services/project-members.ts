import type { Prisma } from "@/app/generated/prisma/client";

import { logActivity } from "@/lib/activity/service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors";
import { prisma } from "@/lib/db";
import type { PermissionCode } from "@/lib/permissions/codes";
import { PERMISSION_CODES } from "@/lib/permissions/codes";

const PROJECT_READ_CODE = PERMISSION_CODES.PROJECTS_READ;
const PROJECT_MANAGE_CODE = PERMISSION_CODES.PROJECTS_MANAGE;

export const projectMemberSelect = {
  id: true,
  projectId: true,
  userId: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
    },
  },
} satisfies Prisma.ProjectMemberSelect;

export const projectMemberCandidateSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  middleName: true,
  isActive: true,
} satisfies Prisma.UserSelect;

interface AccessibleProject {
  id: string;
  name: string;
  departmentId: string;
}

type ProjectMembersDbClient = typeof prisma | Prisma.TransactionClient;

async function getProjectById(
  db: ProjectMembersDbClient,
  projectId: string,
): Promise<AccessibleProject> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      departmentId: true,
    },
  });

  if (!project) {
    throw new NotFoundError("Project not found.");
  }

  return project;
}

async function hasProjectPermission({
  db,
  userId,
  permissionCode,
  departmentId,
}: {
  db: ProjectMembersDbClient;
  userId: string;
  permissionCode: PermissionCode;
  departmentId: string;
}) {
  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      isActive: true,
      systemRole: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user?.isActive) {
    return false;
  }

  if (user.systemRole?.code === "SYSTEM_ADMIN") {
    return true;
  }

  const membership = await db.departmentMember.findFirst({
    where: {
      departmentId,
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
      id: true,
    },
  });

  return membership !== null;
}

async function assertProjectPermission({
  db = prisma,
  userId,
  projectId,
  permissionCode,
}: {
  db?: ProjectMembersDbClient;
  userId: string;
  projectId: string;
  permissionCode: PermissionCode;
}): Promise<AccessibleProject> {
  const project = await getProjectById(db, projectId);

  const allowed = await hasProjectPermission({
    db,
    userId,
    permissionCode,
    departmentId: project.departmentId,
  });
  if (!allowed) {
    throw new ForbiddenError();
  }

  return project;
}

export async function listProjectMembersForUser({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  await assertProjectPermission({
    userId,
    projectId,
    permissionCode: PROJECT_READ_CODE,
  });

  return prisma.projectMember.findMany({
    where: {
      projectId,
    },
    orderBy: {
      joinedAt: "asc",
    },
    select: projectMemberSelect,
  });
}

export async function listProjectMemberCandidatesForUser({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  const project = await assertProjectPermission({
    userId,
    projectId,
    permissionCode: PROJECT_MANAGE_CODE,
  });

  return prisma.user.findMany({
    where: {
      isActive: true,
      memberships: {
        some: {
          departmentId: project.departmentId,
          leftAt: null,
        },
      },
      projectMemberships: {
        none: {
          projectId: project.id,
        },
      },
    },
    orderBy: [
      { lastName: "asc" },
      { firstName: "asc" },
      { email: "asc" },
    ],
    select: projectMemberCandidateSelect,
  });
}

export async function addProjectMemberForUser({
  userId,
  projectId,
  memberUserId,
  tx,
}: {
  userId: string;
  projectId: string;
  memberUserId: string;
  tx: Prisma.TransactionClient;
}) {
  const project = await assertProjectPermission({
    db: tx,
    userId,
    projectId,
    permissionCode: PROJECT_MANAGE_CODE,
  });

  const targetUser = await tx.user.findUnique({
    where: { id: memberUserId },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!targetUser) {
    throw new NotFoundError("User not found.");
  }

  if (!targetUser.isActive) {
    throw new ValidationError("Cannot add an inactive user to a project.");
  }

  const activeDepartmentMembership = await tx.departmentMember.findUnique({
    where: {
      departmentId_userId: {
        departmentId: project.departmentId,
        userId: memberUserId,
      },
    },
    select: {
      id: true,
      leftAt: true,
    },
  });

  if (!activeDepartmentMembership || activeDepartmentMembership.leftAt !== null) {
    throw new ValidationError(
      "User must be an active member of the project's department.",
    );
  }

  const existingMembership = await tx.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: memberUserId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingMembership) {
    throw new ConflictError("User is already a member of this project.");
  }

  const membership = await tx.projectMember.create({
    data: {
      projectId,
      userId: memberUserId,
    },
    select: projectMemberSelect,
  });

  await logActivity({
    type: "MEMBER_ADDED",
    actorId: userId,
    entityType: "ProjectMember",
    entityId: membership.id,
    departmentId: project.departmentId,
    description: `User ${memberUserId} was added to project ${projectId}.`,
    metadata: {
      projectId,
      memberId: membership.id,
      userId: memberUserId,
    },
    tx,
  });

  return membership;
}

export async function removeProjectMemberForUser({
  userId,
  projectId,
  memberId,
  tx,
}: {
  userId: string;
  projectId: string;
  memberId: string;
  tx: Prisma.TransactionClient;
}) {
  const project = await assertProjectPermission({
    userId,
    projectId,
    permissionCode: PROJECT_MANAGE_CODE,
  });

  const membership = await tx.projectMember.findUnique({
    where: {
      id: memberId,
    },
    select: {
      id: true,
      projectId: true,
      userId: true,
    },
  });

  if (!membership || membership.projectId !== projectId) {
    throw new NotFoundError("Project member not found.");
  }

  await tx.projectMember.delete({
    where: {
      id: membership.id,
    },
  });

  await logActivity({
    type: "MEMBER_REMOVED",
    actorId: userId,
    entityType: "ProjectMember",
    entityId: membership.id,
    departmentId: project.departmentId,
    description: `User ${membership.userId} was removed from project ${projectId}.`,
    metadata: {
      projectId,
      memberId: membership.id,
      userId: membership.userId,
    },
    tx,
  });

  return membership;
}
