import { NextResponse } from "next/server";
import { z } from "zod";

import { ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  createTaskCommentForUser,
  listTaskCommentsForUser,
} from "@/lib/services/tasks";

interface RouteContext {
  params: Promise<{
    taskId: string;
  }>;
}

const createCommentSchema = z.object({
  body: z
    .string({
      error: "Comment text is required.",
    })
    .trim()
    .min(1, "Comment text is required.")
    .max(5000, "Comment text must be 5000 characters or fewer."),
});

export const GET = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { taskId } = await params;

  const comments = await listTaskCommentsForUser({
    userId: currentUser.id,
    taskId,
  });

  return NextResponse.json({ comments });
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

  const data = createCommentSchema.parse(body);

  const comment = await createTaskCommentForUser({
    userId: currentUser.id,
    taskId,
    body: data.body,
  });

  return NextResponse.json({ comment }, { status: 201 });
});
