import { NextResponse } from "next/server";

import { deleteSession } from "@/lib/auth/session";

const SESSION_COOKIE_NAME = "kanban_session";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  const token = cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  if (token) {
    await deleteSession(token);
  }

  const response = NextResponse.json({
    message: "Logout successful",
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
