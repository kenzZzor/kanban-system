import { NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { apiHandler } from "@/lib/api/handler";
import { UnauthorizedError, ValidationError } from "@/lib/api/errors";
import { prisma } from "@/lib/db";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const POST = apiHandler(async (request: Request) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const { email, password } = loginSchema.parse(body);

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Invalid email or password.");
  }

  const isValidPassword = await verifyPassword(
    password,
    user.passwordHash,
  );

  if (!isValidPassword) {
    throw new UnauthorizedError("Invalid email or password.");
  }

  const { token } = await createSession(user.id);

  const response = NextResponse.json({
    message: "Login successful",
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
});
