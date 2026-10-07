import { ActivityType, Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db";

interface LogActivityParams {
  type: ActivityType;
  actorId: string;
  entityType: string;
  entityId: string;
  description: string;
  taskId?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function logActivity({
  type,
  actorId,
  entityType,
  entityId,
  description,
  taskId,
  metadata,
}: LogActivityParams) {
  return prisma.activityLog.create({
    data: {
      type,
      actorId,
      entityType,
      entityId,
      description,
      taskId,
      metadata,
    },
  });
}