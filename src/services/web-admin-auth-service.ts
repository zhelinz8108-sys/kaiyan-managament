import crypto from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "../lib/db.js";
import { WebAdminAuthConfig, hasBootstrapCredential } from "../lib/web-auth.js";

const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export type WebAdminAuthUser = {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
};

type UpsertWebAdminUserInput = {
  username: string;
  password: string;
  displayName?: string;
  isActive?: boolean;
};

type CreateWebAdminLoginSessionInput = {
  username: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  config: WebAdminAuthConfig;
};

export async function ensureBootstrapWebAdminUser(config: WebAdminAuthConfig) {
  if (!hasBootstrapCredential(config)) {
    return null;
  }

  const username = config.bootstrapUsername.trim().toLowerCase();
  const existing = await prisma.webAdminUser.findUnique({
    where: { username },
  });

  if (existing) {
    if (existing.displayName !== config.bootstrapDisplayName || !existing.isActive) {
      return prisma.webAdminUser.update({
        where: { id: existing.id },
        data: {
          displayName: config.bootstrapDisplayName,
          isActive: true,
        },
      });
    }

    return existing;
  }

  return upsertWebAdminUser({
    username,
    password: config.bootstrapPassword,
    displayName: config.bootstrapDisplayName,
    isActive: true,
  });
}

export async function countActiveWebAdminUsers() {
  return prisma.webAdminUser.count({
    where: { isActive: true },
  });
}

export async function upsertWebAdminUser(input: UpsertWebAdminUserInput) {
  const username = input.username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 10);
  const existing = await prisma.webAdminUser.findUnique({
    where: { username },
  });

  if (existing) {
    return prisma.webAdminUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        displayName: input.displayName?.trim() || existing.displayName,
        isActive: input.isActive ?? true,
      },
    });
  }

  return prisma.webAdminUser.create({
    data: {
      username,
      passwordHash,
      displayName: input.displayName?.trim() || username,
      isActive: input.isActive ?? true,
    },
  });
}

export async function createWebAdminLoginSession(input: CreateWebAdminLoginSessionInput) {
  const username = input.username.trim().toLowerCase();
  const user = await prisma.webAdminUser.findUnique({
    where: { username },
  });

  if (!user || !user.isActive) {
    return null;
  }

  const passwordMatched = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatched) {
    return null;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + input.config.sessionMaxAgeSeconds * 1000);

  const session = await prisma.webAdminSession.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      lastSeenAt: new Date(),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  await prisma.webAdminUser.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  return {
    token,
    expiresAt,
    user: {
      sessionId: session.id,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
    } satisfies WebAdminAuthUser,
  };
}

export async function resolveWebAdminSession(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const session = await prisma.webAdminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (!session.user.isActive || session.expiresAt.getTime() <= Date.now()) {
    await prisma.webAdminSession.deleteMany({
      where: { id: session.id },
    });
    return null;
  }

  const lastSeenAt = session.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeenAt > SESSION_TOUCH_INTERVAL_MS) {
    await prisma.webAdminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
  } satisfies WebAdminAuthUser;
}

export async function invalidateWebAdminSession(token: string | null | undefined) {
  if (!token) {
    return;
  }

  await prisma.webAdminSession.deleteMany({
    where: {
      tokenHash: hashSessionToken(token),
    },
  });
}

export async function listWebAdminUsers() {
  const rows = await prisma.webAdminUser.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
