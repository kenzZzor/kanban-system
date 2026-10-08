import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return {
    token,
    session,
  };
}

export async function getSession(token: string) {
  const tokenHash = hashToken(token);

  const session = await prisma.session.findUnique({
    where: {
      tokenHash,
    },
    select: {
      id: true,
      tokenHash: true,
      userId: true,
      expiresAt: true,
      createdAt: true,
      lastUsedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
          isActive: true,
          systemRoleId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({
      where: {
        id: session.id,
      },
    });

    return null;
  }

  await prisma.session.update({
    where: {
      id: session.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return session;
}

export async function deleteSession(token: string) {
  const tokenHash = hashToken(token);

  await prisma.session.deleteMany({
    where: {
      tokenHash,
    },
  });
}
