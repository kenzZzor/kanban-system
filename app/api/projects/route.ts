import { NextResponse } from "next/server";
import { z } from "zod";

import { ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  createProjectForUser,
  listProjectsForUser,
} from "@/lib/services/projects";

const listProjectsQuerySchema = z.object({
  departmentId: z.string().trim().min(1).optional(),
});

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(200, "Project name must be 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(1000, "Project description must be 1000 characters or fewer.")
    .optional(),
  departmentId: z.string().trim().min(1, "Department is required."),
});

export const GET = apiHandler(async (request: Request) => {
  const currentUser = await requireUser();

  const url = new URL(request.url);
  const parsedQuery = listProjectsQuerySchema.parse({
    departmentId: url.searchParams.get("departmentId") ?? undefined,
  });

  const projects = await listProjectsForUser({
    userId: currentUser.id,
    departmentId: parsedQuery.departmentId,
  });

  return NextResponse.json({ projects });
});

export const POST = apiHandler(async (request: Request) => {
  const currentUser = await requireUser();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const data = createProjectSchema.parse(body);

  const project = await createProjectForUser({
    userId: currentUser.id,
    name: data.name,
    description: data.description,
    departmentId: data.departmentId,
  });

  return NextResponse.json({ project }, { status: 201 });
});
