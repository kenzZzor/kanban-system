import { NextResponse } from "next/server";
import { z } from "zod";

import { ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  TASK_TRANSITION_ACTIONS,
  transitionTaskForUser,
} from "@/lib/services/tasks";

interface RouteContext {
  params: Promise<{
    taskId: string;
  }>;
}

const transitionTaskSchema = z.object({
  action: z.enum(TASK_TRANSITION_ACTIONS),
  reason: z
    .string()
    .trim()
    .max(2000, "Return reason must be 2000 characters or fewer.")
    .optional(),
});

export const POST = apiHandler(async (
  request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { taskId } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const data = transitionTaskSchema.parse(body);

  const task = await transitionTaskForUser({
    userId: currentUser.id,
    taskId,
    action: data.action,
    reason: data.reason,
  });

  return NextResponse.json({ task });
});
