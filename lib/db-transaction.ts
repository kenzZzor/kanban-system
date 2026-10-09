import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db";

const MAX_ATTEMPTS = 5;

export function isRetryableTransactionConflict(
  error: unknown,
): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);

    const candidate = current as {
      code?: unknown;
      originalCode?: unknown;
      sqlState?: unknown;
      cause?: unknown;
    };

    const codes = [
      candidate.code,
      candidate.originalCode,
      candidate.sqlState,
    ];

    if (
      codes.some(
        (code) =>
          code === "P2034" ||
          code === "40001" ||
          code === "40P01",
      )
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}

export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (
        !isRetryableTransactionConflict(error) ||
        attempt === MAX_ATTEMPTS
      ) {
        throw error;
      }

      const delayMs =
        25 * 2 ** (attempt - 1) +
        Math.floor(Math.random() * 25);

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw new Error(
    "Serializable transaction retry loop exited unexpectedly.",
  );
}
