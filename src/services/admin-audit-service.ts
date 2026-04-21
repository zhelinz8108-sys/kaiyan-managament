import { prisma } from "../lib/db.js";

export type AdminAuditActor = {
  userId?: string | null;
  username?: string | null;
};

export type AdminAuditRequestMeta = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type RecordAdminAuditLogInput = AdminAuditRequestMeta & {
  actor?: AdminAuditActor | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
};

export async function recordAdminAuditLog(input: RecordAdminAuditLogInput) {
  return prisma.adminAuditLog.create({
    data: {
      actorUserId: input.actor?.userId ?? null,
      actorUsername: input.actor?.username ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadataJson: input.metadata == null ? null : JSON.stringify(input.metadata),
    },
  });
}

export async function getRecentAdminAuditLogs(limit: number) {
  const rows = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    actorUsername: row.actorUsername,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata: row.metadataJson ? tryParseJson(row.metadataJson) : null,
    createdAt: row.createdAt,
  }));
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
