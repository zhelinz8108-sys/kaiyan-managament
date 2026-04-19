import { InventoryLockStatus, OccupancyStatus, Prisma, SourceSystem } from "@prisma/client";

import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { ensureValidRange } from "../lib/time.js";

type LockInput = {
  requestId: string;
  idempotencyKey: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
  expiresAt: Date;
  reason: string;
  sourceSystem: SourceSystem;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

const ACTIVE_OCCUPANCY_FILTER: Prisma.OccupancyLedgerWhereInput = {
  status: OccupancyStatus.ACTIVE,
};

function overlapFilter(startAt: Date, endAt: Date) {
  return {
    startAt: { lt: endAt },
    endAt: { gt: startAt },
  };
}

export async function releaseExpiredLocks(tx: DbClient = prisma) {
  await tx.inventoryLock.updateMany({
    where: {
      status: InventoryLockStatus.LOCKED,
      expiresAt: { lte: new Date() },
    },
    data: {
      status: InventoryLockStatus.EXPIRED,
    },
  });
}

export async function assertRoomAvailable(roomId: string, startAt: Date, endAt: Date) {
  ensureValidRange(startAt, endAt);
  await releaseExpiredLocks();

  const [activeLocks, activeOccupancies] = await Promise.all([
    prisma.inventoryLock.findFirst({
      where: {
        roomId,
        status: InventoryLockStatus.LOCKED,
        expiresAt: { gt: new Date() },
        ...overlapFilter(startAt, endAt),
      },
    }),
    prisma.occupancyLedger.findFirst({
      where: {
        roomId,
        ...ACTIVE_OCCUPANCY_FILTER,
        ...overlapFilter(startAt, endAt),
      },
    }),
  ]);

  if (activeLocks) {
    throw new ApiError(409, "ROOM_CONFLICT", "Room has an active inventory lock", {
      lockId: activeLocks.id,
    });
  }

  if (activeOccupancies) {
    throw new ApiError(409, "ROOM_CONFLICT", "Room already has an active occupancy", {
      occupancyId: activeOccupancies.id,
      occupancySource: activeOccupancies.source,
      sourceId: activeOccupancies.sourceId,
    });
  }
}

export async function createInventoryLock(input: LockInput) {
  const existing = await prisma.inventoryLock.findUnique({
    where: {
      sourceSystem_idempotencyKey: {
        sourceSystem: input.sourceSystem,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  if (existing) {
    return existing;
  }

  ensureValidRange(input.startAt, input.endAt);

  if (input.expiresAt <= new Date()) {
    throw new ApiError(400, "LOCK_EXPIRED", "Lock expiration must be in the future");
  }

  await assertRoomAvailable(input.roomId, input.startAt, input.endAt);

  return prisma.inventoryLock.create({
    data: {
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      sourceSystem: input.sourceSystem,
      roomId: input.roomId,
      startAt: input.startAt,
      endAt: input.endAt,
      expiresAt: input.expiresAt,
      reason: input.reason,
      status: InventoryLockStatus.LOCKED,
    },
  });
}

export async function releaseOccupancyByBooking(
  bookingId: string,
  checkoutAt: Date,
  tx: DbClient = prisma,
) {
  return tx.occupancyLedger.updateMany({
    where: {
      source: "BOOKING",
      sourceId: bookingId,
      status: OccupancyStatus.ACTIVE,
    },
    data: {
      status: OccupancyStatus.RELEASED,
      endAt: checkoutAt,
    },
  });
}
