import { cookies } from "next/headers";

import { getSession } from "@/lib/auth/session";

const SESSION_COOKIE_NAME = "kanban_session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await getSession(token);

  if (!session) {
    return null;
  }

  return session.user;
}
