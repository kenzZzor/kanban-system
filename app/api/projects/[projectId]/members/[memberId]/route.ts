import { NextResponse } from "next/server";

import { ConflictError } from "@/lib/api/errors";
import { apiHandler, requireUser } from "@/lib/api/handler";
import {
  isRetryableTransactionConflict,
  runSerializableTransaction,
} from "@/lib/db-transaction";
import { removeProjectMemberForUser } from "@/lib/services/project-members";

interface RouteContext {
  params: Promise<{
    projectId: string;
    memberId: string;
  }>;
}

export const DELETE = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { projectId, memberId } = await params;

  try {
    const member = await runSerializableTransaction((tx) =>
      removeProjectMemberForUser({
        userId: currentUser.id,
        projectId,
        memberId,
        tx,
      }),
    );

    return NextResponse.json({ member });
  } catch (error) {
    if (isRetryableTransactionConflict(error)) {
      throw new ConflictError(
        "Project membership changed concurrently. Refresh and try again.",
      );
    }

    throw error;
  }
});
