import { NextResponse } from "next/server";

import { ConflictError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  isRetryableTransactionConflict,
  runSerializableTransaction,
} from "@/lib/db-transaction";
import { resetUserPassword } from "@/lib/services/users";

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

export const POST = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { userId } = await params;

  try {
    const result = await runSerializableTransaction((tx) =>
      resetUserPassword({
        tx,
        actorId: currentUser.id,
        userId,
      }),
    );

    return NextResponse.json({
      user: result.user,
      temporaryPassword: result.temporaryPassword,
      temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt,
    });
  } catch (error) {
    if (isRetryableTransactionConflict(error)) {
      throw new ConflictError(
        "User account data changed concurrently. Refresh and try again.",
      );
    }

    throw error;
  }
});
