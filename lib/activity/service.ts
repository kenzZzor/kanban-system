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
  tx?: Prisma.TransactionClient;
}

export async function logActivity({
  type,
  actorId,
  entityType,
  entityId,
  description,
  taskId,
  metadata,
  tx,
}: LogActivityParams) {
  const db = tx ?? prisma;

  return db.activityLog.create({
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
