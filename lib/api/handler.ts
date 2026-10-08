import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { AppError, InternalError, UnauthorizedError } from "@/lib/api/errors";

type RouteHandler<TContext = unknown> = (
  request: Request,
  context: TContext,
) => Promise<Response> | Response;

function errorResponse(error: AppError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    },
    { status: error.status },
  );
}

export function apiHandler<TContext = unknown>(
  fn: RouteHandler<TContext>,
): RouteHandler<TContext> {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error);
      }

      if (error instanceof ZodError) {
        return errorResponse(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Invalid request data.",
            error.flatten().fieldErrors,
          ),
        );
      }

      console.error(error);
      return errorResponse(new InternalError());
    }
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user;
}
