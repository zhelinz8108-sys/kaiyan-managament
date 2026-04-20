import { ManagementStatus, Prisma } from "@prisma/client";

import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { assertPresent } from "../lib/http.js";

type UpsertRoomManagementAssignmentInput = {
  roomId: string;
  managementStatus: ManagementStatus;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  acquireMode?: string | null;
  notes?: string | null;
};

export type ManagementSnapshot = {
  status: ManagementStatus | "UNMANAGED";
  label: string;
  isManaged: boolean;
  isCurrent: boolean;
  ownerName: string | null;
  ownerPhone: string | null;
  acquireMode: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  notes: string | null;
};

const statusLabels: Record<ManagementStatus | "UNMANAGED", string> = {
  POTENTIAL: "底表",
  NEGOTIATING: "洽谈中",
  READY: "待上线",
  ACTIVE: "在管",
  PAUSED: "暂停",
  EXITED: "已退场",
  UNMANAGED: "未建档",
};

function overlapsAsOf(
  assignment: {
    effectiveFrom: Date;
    effectiveTo: Date | null;
  },
  asOf: Date,
) {
  return assignment.effectiveFrom <= asOf && (!assignment.effectiveTo || assignment.effectiveTo >= asOf);
}

export function resolveManagementSnapshot(
  assignments: Array<{
    managementStatus: ManagementStatus;
    ownerName: string | null;
    ownerPhone: string | null;
    acquireMode: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    notes: string | null;
  }>,
  asOf: Date,
): ManagementSnapshot {
  if (assignments.length === 0) {
    return {
      status: "UNMANAGED",
      label: statusLabels.UNMANAGED,
      isManaged: false,
      isCurrent: false,
      ownerName: null,
      ownerPhone: null,
      acquireMode: null,
      effectiveFrom: null,
      effectiveTo: null,
      notes: null,
    };
  }

  const ordered = [...assignments].sort(
    (left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime(),
  );
  const current = ordered.find((assignment) => overlapsAsOf(assignment, asOf));
  const chosen = current ?? ordered[0]!;

  return {
    status: chosen.managementStatus,
    label: statusLabels[chosen.managementStatus],
    isManaged: chosen.managementStatus === "ACTIVE",
    isCurrent: Boolean(current),
    ownerName: chosen.ownerName ?? null,
    ownerPhone: chosen.ownerPhone ?? null,
    acquireMode: chosen.acquireMode ?? null,
    effectiveFrom: chosen.effectiveFrom,
    effectiveTo: chosen.effectiveTo ?? null,
    notes: chosen.notes ?? null,
  };
}

export async function upsertRoomManagementAssignment(input: UpsertRoomManagementAssignmentInput) {
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new ApiError(400, "VALIDATION_ERROR", "effective_to must be later than effective_from");
  }

  const room = assertPresent(
    await prisma.room.findUnique({
      where: { id: input.roomId },
    }),
    "Room not found",
  );

  return prisma.$transaction(async (tx) => {
    if (input.managementStatus === "ACTIVE") {
      await tx.roomManagementAssignment.updateMany({
        where: {
          roomId: input.roomId,
          managementStatus: "ACTIVE",
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: input.effectiveFrom } },
          ],
        },
        data: {
          effectiveTo: new Date(input.effectiveFrom.getTime() - 1000),
        },
      });
    }

    return tx.roomManagementAssignment.create({
      data: {
        propertyId: room.propertyId,
        roomId: input.roomId,
        managementStatus: input.managementStatus,
        ownerName: input.ownerName ?? null,
        ownerPhone: input.ownerPhone ?? null,
        acquireMode: input.acquireMode ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        notes: input.notes ?? null,
      },
    });
  });
}

export function managementSummaryFromSnapshots(
  snapshots: ManagementSnapshot[],
) {
  return {
    activeManagedRooms: snapshots.filter((item) => item.status === "ACTIVE").length,
    readyRooms: snapshots.filter((item) => item.status === "READY").length,
    negotiatingRooms: snapshots.filter((item) => item.status === "NEGOTIATING").length,
    pausedRooms: snapshots.filter((item) => item.status === "PAUSED").length,
    exitedRooms: snapshots.filter((item) => item.status === "EXITED").length,
    potentialRooms: snapshots.filter((item) => item.status === "POTENTIAL" || item.status === "UNMANAGED").length,
  };
}

export type RoomWithAssignments = Prisma.RoomGetPayload<{
  include: {
    managementAssignments: true;
  };
}>;
