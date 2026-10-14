import { NextResponse } from "next/server";
import { z } from "zod";

import { ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  assignTaskForUser,
  getTaskForUser,
  updateTaskForUser,
} from "@/lib/services/tasks";

interface RouteContext {
  params: Promise<{
    taskId: string;
  }>;
}

const assignTaskSchema = z.object({
  assignedToId: z
    .string({
      error: "Assignee is required.",
    })
    .trim()
    .min(1, "Assignee is required."),
});

const updateTaskSchema = z
  .object({
    title: z
      .string({
        error: "Task title is required.",
      })
      .trim()
      .min(1, "Task title is required.")
      .max(200, "Task title must be 200 characters or fewer.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(4000, "Task description must be 4000 characters or fewer.")
      .nullable()
      .optional(),
    dueDate: z
      .string()
      .trim()
      .min(1, "Due date must be a valid date.")
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "Due date must be a valid date.",
      })
      .nullable()
      .optional(),
    priorityCode: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.dueDate !== undefined ||
      data.priorityCode !== undefined,
    {
      message: "At least one editable task field is required.",
    },
  );

export const GET = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { taskId } = await params;

  const task = await getTaskForUser({
    userId: currentUser.id,
    taskId,
  });

  return NextResponse.json({ task });
});

export const PATCH = apiHandler(async (
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

  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    Object.prototype.hasOwnProperty.call(body, "assignedToId")
  ) {
    const data = assignTaskSchema.parse(body);

    const task = await assignTaskForUser({
      userId: currentUser.id,
      taskId,
      assignedToId: data.assignedToId,
    });

    return NextResponse.json({ task });
  }

  const data = updateTaskSchema.parse(body);

  const task = await updateTaskForUser({
    userId: currentUser.id,
    taskId,
    title: data.title,
    description:
      data.description === undefined
        ? undefined
        : data.description === null || data.description === ""
          ? null
          : data.description,
    dueDate:
      data.dueDate === undefined
        ? undefined
        : data.dueDate === null
          ? null
          : new Date(data.dueDate),
    priorityCode: data.priorityCode,
  });

  return NextResponse.json({ task });
});
