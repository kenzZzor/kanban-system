import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { z } from "zod";

import { ConflictError, ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  isRetryableTransactionConflict,
  runSerializableTransaction,
} from "@/lib/db-transaction";
import {
  addProjectMemberForUser,
  listProjectMembersForUser,
} from "@/lib/services/project-members";

interface RouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

const addProjectMemberSchema = z.object({
  userId: z.string().trim().min(1, "User is required."),
});

export const GET = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { projectId } = await params;

  const members = await listProjectMembersForUser({
    userId: currentUser.id,
    projectId,
  });

  return NextResponse.json({ members });
});

export const POST = apiHandler(async (
  request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { projectId } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const { userId } = addProjectMemberSchema.parse(body);

  try {
    const member = await runSerializableTransaction((tx) =>
      addProjectMemberForUser({
        userId: currentUser.id,
        projectId,
        memberUserId: userId,
        tx,
      }),
    );

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError("User is already a member of this project.");
    }

    if (isRetryableTransactionConflict(error)) {
      throw new ConflictError(
        "Project membership changed concurrently. Refresh and try again.",
      );
    }

    throw error;
  }
});
