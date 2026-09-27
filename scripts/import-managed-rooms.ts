import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const rowSchema = z.object({
  roomNo: z.string().regex(/^\d{4}$/),
  rentYuan: z.number().int().nonnegative(),
  propertyFeeYuan: z.number().int().nonnegative(),
  ownerRentYuan: z.number().int().nonnegative(),
  sourceStatus: z.string(),
  remark: z.string(),
  tenantRentYuan: z.number().int().nonnegative().nullable(),
});

const importSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(rowSchema).nonempty(),
});

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function sourceNotes(row: z.infer<typeof rowSchema>, marker: string) {
  return [
    marker,
    row.sourceStatus && `原表状态：${row.sourceStatus}`,
    row.remark && `原表备注：${row.remark}`,
    row.tenantRentYuan !== null && `原表租客租金：${row.tenantRentYuan}元（周期未注明，未计入经营收入）`,
  ].filter(Boolean).join("；");
}

async function main() {
  const file = argument("--file");
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Usage: npm run db:import-managed -- --file <private-json> [--apply] [--expected-active <count>]");

  const input = importSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const roomNos = new Set(input.rows.map((row) => row.roomNo));
  if (roomNos.size !== input.rows.length) throw new Error("Duplicate room numbers in import");
  for (const row of input.rows) {
    if (row.rentYuan + row.propertyFeeYuan !== row.ownerRentYuan) {
      throw new Error(`Owner rent does not match rent plus property fee for room ${row.roomNo}`);
    }
  }

  const prisma = new PrismaClient();
  try {
    const properties = await prisma.property.findMany({ select: { id: true } });
    if (properties.length !== 1) throw new Error(`Expected exactly one property, found ${properties.length}`);
    const propertyId = properties[0]!.id;
    const rooms = await prisma.room.findMany({
      where: { propertyId },
      include: { managementAssignments: true, costProfile: true },
    });
    const existingByNo = new Map(rooms.map((room) => [room.roomNo, room]));
    let now = new Date();
    const currentAssignment = (room: (typeof rooms)[number]) => room.managementAssignments
      .filter((item) => item.effectiveFrom <= now && (!item.effectiveTo || item.effectiveTo >= now))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    const activeRooms = rooms.filter((room) => currentAssignment(room)?.managementStatus === "ACTIVE");
    const marker = `[在管清单:${input.snapshotDate}]`;
    const alreadyImported = input.rows.filter((row) => {
      const room = existingByNo.get(row.roomNo);
      return room && currentAssignment(room)?.notes?.startsWith(marker);
    });
    if (alreadyImported.length > 0) {
      if (alreadyImported.length !== input.rows.length) throw new Error("Partial prior import detected; manual review required");
      for (const row of input.rows) {
        const room = existingByNo.get(row.roomNo)!;
        if (currentAssignment(room)?.managementStatus !== "ACTIVE" ||
            room.costProfile?.monthlyRentCost !== row.rentYuan * 100 ||
            room.costProfile?.monthlyPropertyFeeCost !== row.propertyFeeYuan * 100) {
          throw new Error("Prior import has since changed; manual review required");
        }
      }
      console.log(`Already imported ${input.rows.length} managed rooms for ${input.snapshotDate}; no changes made`);
      return;
    }
    const expectedActive = argument("--expected-active");
    if (expectedActive !== null && activeRooms.length !== Number(expectedActive)) {
      throw new Error(`Expected ${expectedActive} current active rooms, found ${activeRooms.length}; import cancelled`);
    }

    const removed = activeRooms.filter((room) => !roomNos.has(room.roomNo));
    const added = input.rows.filter((row) => {
      const room = existingByNo.get(row.roomNo);
      return !room || currentAssignment(room)?.managementStatus !== "ACTIVE";
    });
    const newRooms = input.rows.filter((row) => !existingByNo.has(row.roomNo));
    const totalOwnerRentYuan = input.rows.reduce((sum, row) => sum + row.ownerRentYuan, 0);
    console.log(JSON.stringify({
      snapshotDate: input.snapshotDate,
      activeBefore: activeRooms.length,
      activeAfter: input.rows.length,
      noLongerManaged: removed.length,
      newlyManaged: added.length,
      roomsToCreate: newRooms.map((row) => row.roomNo),
      monthlyOwnerRentYuan: totalOwnerRentYuan,
      mode: apply ? "apply" : "dry-run",
    }));
    if (!apply) return;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl?.startsWith("file:")) throw new Error("A SQLite DATABASE_URL is required");
    const backupDir = path.resolve("prisma/backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `dev-managed-import-${Date.now()}.db`);
    await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    console.log(`Pre-import SQLite backup: ${backupPath}`);

    await prisma.$transaction(async (tx) => {
      const effectiveFrom = new Date();
      const effectiveTo = new Date(effectiveFrom.getTime() - 1);

      for (const room of removed) {
        const previous = currentAssignment(room)!;
        await tx.roomManagementAssignment.updateMany({
          where: { roomId: room.id, effectiveFrom: { lt: effectiveFrom }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }] },
          data: { effectiveTo },
        });
        await tx.roomManagementAssignment.create({
          data: {
            propertyId, roomId: room.id, managementStatus: "POTENTIAL", effectiveFrom,
            ownerName: previous.ownerName, ownerPhone: previous.ownerPhone,
            acquireMode: previous.acquireMode,
            notes: `${marker}；未列于本次在管清单，退回底表（非退场认定）`,
          },
        });
      }

      for (const row of input.rows) {
        let room = existingByNo.get(row.roomNo);
        if (!room) {
          room = await tx.room.create({
            data: {
              propertyId, roomNo: row.roomNo, roomType: "待核实", areaSqm: 0,
              roomStatus: "VACANT_DIRTY", sellableStatus: "HIDDEN", operationState: "UNKNOWN",
            },
            include: { managementAssignments: true, costProfile: true },
          });
        }
        const previous = currentAssignment(room);
        await tx.roomManagementAssignment.updateMany({
          where: { roomId: room.id, effectiveFrom: { lt: effectiveFrom }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }] },
          data: { effectiveTo },
        });
        await tx.roomManagementAssignment.create({
          data: {
            propertyId, roomId: room.id, managementStatus: "ACTIVE", effectiveFrom,
            ownerName: previous?.ownerName ?? null, ownerPhone: previous?.ownerPhone ?? null,
            acquireMode: previous?.acquireMode ?? null,
            notes: sourceNotes(row, marker),
          },
        });
        await tx.roomCostProfile.upsert({
          where: { roomId: room.id },
          update: { monthlyRentCost: row.rentYuan * 100, monthlyPropertyFeeCost: row.propertyFeeYuan * 100 },
          create: {
            roomId: room.id, monthlyRentCost: row.rentYuan * 100,
            monthlyPropertyFeeCost: row.propertyFeeYuan * 100,
            monthlyCleaningCost: 0, monthlyMaintenanceCost: 0, monthlyUtilityCost: 0,
          },
        });
      }
    }, { timeout: 120_000 });
    now = new Date();
    const verified = await prisma.room.findMany({
      where: { propertyId },
      include: { managementAssignments: true, costProfile: true },
    });
    const active = verified.filter((room) => currentAssignment(room)?.managementStatus === "ACTIVE");
    const actualNos = new Set(active.map((room) => room.roomNo));
    const actualOwnerRentCents = active.reduce((sum, room) => sum +
      (room.costProfile?.monthlyRentCost ?? 0) + (room.costProfile?.monthlyPropertyFeeCost ?? 0), 0);
    if (active.length !== input.rows.length ||
        [...roomNos].some((roomNo) => !actualNos.has(roomNo)) ||
        actualOwnerRentCents !== totalOwnerRentYuan * 100) {
      throw new Error("Post-import verification failed; restore from the printed backup after investigation");
    }
    console.log(`Verified ${active.length} current managed rooms and ${actualOwnerRentCents} cents monthly owner rent`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
