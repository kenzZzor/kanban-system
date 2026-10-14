import { NextResponse } from "next/server";
import { z } from "zod";

import { ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  createTaskForUser,
  listTasksForUser,
} from "@/lib/services/tasks";

const listTasksQuerySchema = z.object({
  departmentId: z.string().trim().min(1).optional(),
});

const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Task title is required.")
    .max(200, "Task title must be 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(4000, "Task description must be 4000 characters or fewer.")
    .optional(),
  sourceDepartmentId: z.string().trim().min(1, "Source department is required."),
  projectId: z.string().trim().min(1).optional(),
  assignedToId: z.string().trim().min(1).optional(),
  dueDate: z
    .string()
    .trim()
    .min(1)
    .optional()
    .refine((value) => value === undefined || !Number.isNaN(Date.parse(value)), {
      message: "Due date must be a valid date.",
    }),
});

export const GET = apiHandler(async (request: Request) => {
  const currentUser = await requireUser();
  const url = new URL(request.url);
  const query = listTasksQuerySchema.parse({
    departmentId: url.searchParams.get("departmentId") ?? undefined,
  });

  const tasks = await listTasksForUser({
    userId: currentUser.id,
    departmentId: query.departmentId,
  });

  return NextResponse.json({ tasks });
});

export const POST = apiHandler(async (request: Request) => {
  const currentUser = await requireUser();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const data = createTaskSchema.parse(body);

  const task = await createTaskForUser({
    userId: currentUser.id,
    title: data.title,
    description: data.description,
    sourceDepartmentId: data.sourceDepartmentId,
    projectId: data.projectId,
    assignedToId: data.assignedToId,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
  });

  return NextResponse.json({ task }, { status: 201 });
});
