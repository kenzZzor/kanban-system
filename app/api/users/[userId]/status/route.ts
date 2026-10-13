import { NextResponse } from "next/server";
import { z } from "zod";

import { ConflictError, ValidationError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  isRetryableTransactionConflict,
  runSerializableTransaction,
} from "@/lib/db-transaction";
import {
  deactivateUserAccount,
  reactivateUserAccount,
} from "@/lib/services/users";

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const PATCH = apiHandler(async (
  request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { userId } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const data = updateUserStatusSchema.parse(body);

  try {
    const user = await runSerializableTransaction((tx) =>
      data.isActive
        ? reactivateUserAccount({
            tx,
            actorId: currentUser.id,
            userId,
          })
        : deactivateUserAccount({
            tx,
            actorId: currentUser.id,
            userId,
          }),
    );

    return NextResponse.json({ user });
  } catch (error) {
    if (isRetryableTransactionConflict(error)) {
      throw new ConflictError(
        "User account data changed concurrently. Refresh and try again.",
      );
    }

    throw error;
  }
});
