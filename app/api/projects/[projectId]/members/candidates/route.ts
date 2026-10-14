import { NextResponse } from "next/server";

import { apiHandler, requireUser } from "@/lib/api/handler";
import { listProjectMemberCandidatesForUser } from "@/lib/services/project-members";

interface RouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

export const GET = apiHandler(async (
  _request: Request,
  { params }: RouteContext,
) => {
  const currentUser = await requireUser();
  const { projectId } = await params;

  const candidates = await listProjectMemberCandidatesForUser({
    userId: currentUser.id,
    projectId,
  });

  return NextResponse.json({ candidates });
});
