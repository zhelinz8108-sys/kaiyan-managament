import "dotenv/config";

import bcrypt from "bcryptjs";
import {
  BookingStatus,
  OperatingMode,
  Prisma,
  RoomStatus,
  SellableStatus,
  SourceSystem,
} from "@prisma/client";

import { prisma } from "../src/lib/db.js";
import { KAIYAN_OWNER_ROOM_LIST } from "./kaiyan-owner-room-list.js";

const ROOM_TYPES = [
  "大床房",
  "套房",
  "两房",
] as const;

const DEFAULT_ROOM_COUNT = KAIYAN_OWNER_ROOM_LIST.length;

type RevenueStrategy = "HYBRID" | "DAILY" | "LONG_STAY" | "SEASONAL" | "LOSS";

type SeedOptions = {
  roomCount: number;
  year: number;
};

type RoomPlan = {
  roomNo: string;
  roomType: string;
  areaSqm: number;
  roomStatus: RoomStatus;
  sellableStatus: SellableStatus;
  operationState: string;
  strategy: RevenueStrategy;
  costProfile: {
    monthlyRentCost: number;
    monthlyCleaningCost: number;
    monthlyMaintenanceCost: number;
    monthlyUtilityCost: number;
    monthlyOtherCost: number;
    notes: string;
  };
};

function parseArg(flag: string) {
  const argv = process.argv.slice(2);
  const index = argv.findIndex((item) => item === flag || item.startsWith(`${flag}=`));

  if (index === -1) {
    return null;
  }

  const current = argv[index];
  if (current.includes("=")) {
    return current.split("=").slice(1).join("=");
  }

  return argv[index + 1] ?? null;
}

function parseInteger(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readSeedOptions(): SeedOptions {
  return {
    roomCount: parseInteger(parseArg("--rooms") ?? process.env.SEED_ROOM_COUNT, DEFAULT_ROOM_COUNT),
    year: parseInteger(parseArg("--year") ?? process.env.SEED_YEAR, 2026),
  };
}

function roomFloor(roomNo: string) {
  return Number.parseInt(roomNo.slice(0, -2), 10) || 0;
}

function roomTypeForRoomNo(roomNo: string) {
  const suffix = roomNo.slice(-2);

  if (suffix === "01" || suffix === "32") {
    return "两房";
  }

  if (["10", "11", "22", "23"].includes(suffix)) {
    return "套房";
  }

  return "大床房";
}

function roomAssetLabel(roomNo: string, areaSqm: number) {
  return `${roomFloor(roomNo)}层 · ${areaSqm.toFixed(2)}㎡`;
}

function strategyFor(index: number): RevenueStrategy {
  return ["HYBRID", "DAILY", "LONG_STAY", "SEASONAL", "LOSS"][index % 5] as RevenueStrategy;
}

function roomStatusFor(index: number, strategy: RevenueStrategy) {
  if (index % 37 === 0) {
    return {
      roomStatus: RoomStatus.OUT_OF_SERVICE,
      sellableStatus: SellableStatus.UNSELLABLE,
      operationState: "OUT_OF_SERVICE",
    };
  }

  if (index % 23 === 0 || strategy === "LONG_STAY" && index % 19 === 0) {
    return {
      roomStatus: RoomStatus.MAINTENANCE,
      sellableStatus: SellableStatus.UNSELLABLE,
      operationState: "MAINTENANCE_WINDOW",
    };
  }

  if (index % 11 === 0) {
    return {
      roomStatus: RoomStatus.VACANT_DIRTY,
      sellableStatus: SellableStatus.SELLABLE,
      operationState: "TURNOVER_READY",
    };
  }

  if (index % 17 === 0) {
    return {
      roomStatus: RoomStatus.INSPECTING,
      sellableStatus: SellableStatus.BLOCKED,
      operationState: "QUALITY_CHECK",
    };
  }

  return {
    roomStatus: RoomStatus.VACANT_CLEAN,
    sellableStatus: SellableStatus.SELLABLE,
    operationState: "IN_SERVICE",
  };
}

function buildCostProfile(roomNo: string, areaSqm: number, index: number, strategy: RevenueStrategy) {
  const floorBand = Math.max(roomFloor(roomNo) - 25, 0);
  const typeBand = index % ROOM_TYPES.length;
  const rentBase = Math.round(areaSqm * 4800) + floorBand * 900 + typeBand * 12000;
  const cleaningBase = Math.round(areaSqm * 120);
  const maintenanceBase = Math.round(areaSqm * 180) + 9000 + (index % 7) * 1200;
  const utilityBase = Math.round(areaSqm * 90);
  const assetLabel = roomAssetLabel(roomNo, areaSqm);

  switch (strategy) {
    case "HYBRID":
      return {
        monthlyRentCost: rentBase + 40000,
        monthlyCleaningCost: cleaningBase + 24000 + (index % 4) * 1800,
        monthlyMaintenanceCost: maintenanceBase + 4000,
        monthlyUtilityCost: utilityBase + 18000 + (index % 5) * 2200,
        monthlyOtherCost: 11000 + (index % 3) * 1200,
        notes: `${assetLabel} · 混合经营房，旺季日租，淡季转长租。`,
      };
    case "DAILY":
      return {
        monthlyRentCost: rentBase + 30000,
        monthlyCleaningCost: cleaningBase + 32000 + (index % 4) * 2000,
        monthlyMaintenanceCost: maintenanceBase + 2500,
        monthlyUtilityCost: utilityBase + 20000 + (index % 5) * 2000,
        monthlyOtherCost: 12000 + (index % 4) * 1100,
        notes: `${assetLabel} · 短租 / 日租收益主力房。`,
      };
    case "LONG_STAY":
      return {
        monthlyRentCost: rentBase + 55000,
        monthlyCleaningCost: cleaningBase + 12000 + (index % 3) * 1500,
        monthlyMaintenanceCost: maintenanceBase + 6500,
        monthlyUtilityCost: utilityBase + 19000 + (index % 4) * 2200,
        monthlyOtherCost: 14000 + (index % 3) * 1200,
        notes: `${assetLabel} · 长租为主，偶发空置和翻修窗口。`,
      };
    case "SEASONAL":
      return {
        monthlyRentCost: rentBase + 25000,
        monthlyCleaningCost: cleaningBase + 22000 + (index % 4) * 1800,
        monthlyMaintenanceCost: maintenanceBase + 3500,
        monthlyUtilityCost: utilityBase + 17000 + (index % 5) * 1800,
        monthlyOtherCost: 9000 + (index % 5) * 1000,
        notes: `${assetLabel} · 旺淡季波动明显，收益弹性较大。`,
      };
    case "LOSS":
      return {
        monthlyRentCost: rentBase + 70000,
        monthlyCleaningCost: cleaningBase + 18000 + (index % 4) * 1400,
        monthlyMaintenanceCost: maintenanceBase + 9000,
        monthlyUtilityCost: utilityBase + 18000 + (index % 5) * 1800,
        monthlyOtherCost: 15000 + (index % 3) * 1200,
        notes: `${assetLabel} · 成本偏高，需要重点关注盈亏平衡。`,
      };
  }
}

function createRoomPlans(roomCount: number): RoomPlan[] {
  return KAIYAN_OWNER_ROOM_LIST.slice(0, roomCount).map((room, index) => {
    const strategy = strategyFor(index);
    const status = roomStatusFor(index, strategy);

    return {
      roomNo: room.roomNo,
      roomType: roomTypeForRoomNo(room.roomNo),
      areaSqm: room.areaSqm,
      strategy,
      ...status,
      costProfile: buildCostProfile(room.roomNo, room.areaSqm, index, strategy),
    };
  });
}

function revenueEntry(
  roomId: string,
  year: number,
  month: number,
  operatingMode: OperatingMode,
  recognizedRevenue: number,
  occupiedNights: number,
  orderCount: number,
  notes: string,
): Prisma.RoomRevenueEntryCreateManyInput {
  return {
    roomId,
    operatingMode,
    periodYear: year,
    periodMonth: month,
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 0, 23, 59, 59)),
    recognizedRevenue,
    occupiedNights,
    orderCount,
    notes,
  };
}

function buildRevenueEntries(
  roomId: string,
  year: number,
  index: number,
  plan: RoomPlan,
): Prisma.RoomRevenueEntryCreateManyInput[] {
  const entries: Prisma.RoomRevenueEntryCreateManyInput[] = [];
  const sizeFactor = Math.max(0.88, Math.min(plan.areaSqm / 70, 6.5));
  const variance = Math.round((index % 6) * 12000 * Math.min(sizeFactor, 1.8));
  const scaleRevenue = (base: number, bonus = 0) => Math.round(base * sizeFactor + bonus + variance);

  for (let month = 1; month <= 12; month += 1) {
    if (plan.strategy === "HYBRID") {
      if (month <= 2) {
        entries.push(
          revenueEntry(
            roomId,
            year,
            month,
            OperatingMode.DAILY,
            scaleRevenue(860000 - month * 15000),
            20 + (index % 4),
            12 + (index % 3),
            "年初日租旺季",
          ),
        );
        continue;
      }

      if (month === 3) {
        entries.push(
          revenueEntry(
            roomId,
            year,
            month,
            OperatingMode.SHORT_STAY,
            scaleRevenue(940000),
            24,
            8 + (index % 2),
            "过渡短租月",
          ),
        );
        continue;
      }

      entries.push(
        revenueEntry(
          roomId,
          year,
          month,
          OperatingMode.LONG_STAY,
          scaleRevenue(720000, -Math.round(variance / 2)),
          30,
          1,
          "长租签约收入",
        ),
      );
      continue;
    }

    if (plan.strategy === "DAILY") {
      const mode = month % 2 === 0 ? OperatingMode.SHORT_STAY : OperatingMode.DAILY;
      entries.push(
        revenueEntry(
          roomId,
          year,
          month,
          mode,
          scaleRevenue(1080000 + (month % 3) * 25000),
          mode === OperatingMode.DAILY ? 23 : 19,
          mode === OperatingMode.DAILY ? 15 : 9,
          "持续以高频短单为主",
        ),
      );
      continue;
    }

    if (plan.strategy === "LONG_STAY") {
      if ((index % 2 === 0 && (month === 7 || month === 8)) || (index % 9 === 0 && month === 12)) {
        continue;
      }

      entries.push(
        revenueEntry(
          roomId,
          year,
          month,
          OperatingMode.LONG_STAY,
          scaleRevenue(690000 + (month >= 9 ? 30000 : 0), -Math.round(variance / 2)),
          30,
          1,
          month >= 9 ? "续约后租金提升" : "稳定长租",
        ),
      );
      continue;
    }

    if (plan.strategy === "SEASONAL") {
      if ([2, 3, 11].includes(month)) {
        entries.push(
          revenueEntry(
            roomId,
            year,
            month,
            OperatingMode.SHORT_STAY,
            scaleRevenue(880000),
            17 + (index % 3),
            7 + (index % 2),
            "会展季短租高峰",
          ),
        );
        continue;
      }

      if ([6, 7, 8].includes(month)) {
        entries.push(
          revenueEntry(
            roomId,
            year,
            month,
            OperatingMode.DAILY,
            scaleRevenue(980000 + 60000),
            24,
            14,
            "暑期旺季日租",
          ),
        );
        continue;
      }

      if (month === 1 || month === 12) {
        entries.push(
          revenueEntry(
            roomId,
            year,
            month,
            OperatingMode.DAILY,
            scaleRevenue(760000, -Math.round(variance / 2)),
            18,
            10,
            "节假日驱动",
          ),
        );
        continue;
      }

      if (month === 4 || month === 10) {
        continue;
      }

      entries.push(
        revenueEntry(
          roomId,
          year,
          month,
          OperatingMode.SHORT_STAY,
          scaleRevenue(660000, -Math.round(variance / 2)),
          14,
          6,
          "普通淡季收入",
        ),
      );
      continue;
    }

    if ([5, 6, 11].includes(month)) {
      continue;
    }

    const mode = month <= 4 ? OperatingMode.DAILY : OperatingMode.LONG_STAY;
    entries.push(
      revenueEntry(
        roomId,
        year,
        month,
        mode,
        mode === OperatingMode.DAILY
          ? scaleRevenue(520000, -Math.round(variance * 0.66))
          : scaleRevenue(450000, -Math.round(variance * 0.74)),
        mode === OperatingMode.DAILY ? 12 + (index % 3) : 24,
        mode === OperatingMode.DAILY ? 7 : 1,
        "成本压顶的低收益房",
      ),
    );
  }

  return entries;
}

function startOfDay(base: Date) {
  const value = new Date(base);
  value.setHours(0, 0, 0, 0);
  return value;
}

function atTime(base: Date, hour: number, minute: number) {
  const value = new Date(base);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function plusDays(base: Date, days: number) {
  const value = new Date(base);
  value.setDate(value.getDate() + days);
  return value;
}

async function seedRealtimeOperations(propertyId: string, roomPlans: RoomPlan[], options: SeedOptions) {
  const sellableRooms = await prisma.room.findMany({
    where: {
      propertyId,
      sellableStatus: SellableStatus.SELLABLE,
    },
    orderBy: { roomNo: "asc" },
  });

  const guestCount = Math.max(60, Math.ceil(options.roomCount * 0.35));
  await prisma.guest.createMany({
    data: Array.from({ length: guestCount }, (_, index) => ({
      name: `住客${String(index + 1).padStart(3, "0")}`,
      phone: `138${String(10000000 + index).slice(-8)}`,
      idType: "ID_CARD",
      idNoMasked: `310***********${String(1200 + index).padStart(4, "0")}`,
    })),
  });

  const guests = await prisma.guest.findMany({
    orderBy: { createdAt: "asc" },
  });

  const today = startOfDay(new Date());
  const arrivalRooms = sellableRooms.slice(0, Math.min(18, sellableRooms.length));
  const departureRooms = sellableRooms.slice(arrivalRooms.length, arrivalRooms.length + 14);
  const inHouseRooms = sellableRooms.slice(arrivalRooms.length + departureRooms.length, arrivalRooms.length + departureRooms.length + 36);

  const bookings: Array<{
    roomId: string;
    guestId: string;
    status: BookingStatus;
    checkinAt: Date;
    checkoutAt: Date;
    totalAmount: number;
    requestId: string;
    idempotencyKey: string;
    externalRef: string;
    shouldCheckIn: boolean;
  }> = [];

  arrivalRooms.forEach((room, index) => {
    bookings.push({
      roomId: room.id,
      guestId: guests[index % guests.length]!.id,
      status: BookingStatus.CONFIRMED,
      checkinAt: atTime(today, 14, (index % 4) * 10),
      checkoutAt: atTime(plusDays(today, 1 + (index % 2)), 12, 0),
      totalAmount: 62000 + (index % 5) * 6800,
      requestId: `seed-arrival-${index + 1}`,
      idempotencyKey: `seed-arrival-key-${index + 1}`,
      externalRef: `ARR-${String(index + 1).padStart(4, "0")}`,
      shouldCheckIn: false,
    });
  });

  departureRooms.forEach((room, index) => {
    bookings.push({
      roomId: room.id,
      guestId: guests[(arrivalRooms.length + index) % guests.length]!.id,
      status: BookingStatus.CHECKED_IN,
      checkinAt: atTime(plusDays(today, -2 - (index % 3)), 15, 0),
      checkoutAt: atTime(today, 12, (index % 3) * 15),
      totalAmount: 98000 + (index % 4) * 7200,
      requestId: `seed-departure-${index + 1}`,
      idempotencyKey: `seed-departure-key-${index + 1}`,
      externalRef: `DEP-${String(index + 1).padStart(4, "0")}`,
      shouldCheckIn: true,
    });
  });

  inHouseRooms.forEach((room, index) => {
    bookings.push({
      roomId: room.id,
      guestId: guests[(arrivalRooms.length + departureRooms.length + index) % guests.length]!.id,
      status: BookingStatus.CHECKED_IN,
      checkinAt: atTime(plusDays(today, -1 - (index % 5)), 16, 0),
      checkoutAt: atTime(plusDays(today, 2 + (index % 4)), 12, 0),
      totalAmount: 158000 + (index % 6) * 9600,
      requestId: `seed-inhouse-${index + 1}`,
      idempotencyKey: `seed-inhouse-key-${index + 1}`,
      externalRef: `INH-${String(index + 1).padStart(4, "0")}`,
      shouldCheckIn: true,
    });
  });

  const createdBookings = [];
  for (const booking of bookings) {
    const created = await prisma.booking.create({
      data: {
        propertyId,
        roomId: booking.roomId,
        guestId: booking.guestId,
        sourceSystem: SourceSystem.WEB_FRONTDESK,
        requestId: booking.requestId,
        idempotencyKey: booking.idempotencyKey,
        externalRef: booking.externalRef,
        status: booking.status,
        checkinAt: booking.checkinAt,
        checkoutAt: booking.checkoutAt,
        totalAmount: booking.totalAmount,
      },
    });

    await prisma.occupancyLedger.create({
      data: {
        roomId: booking.roomId,
        sourceType: "BOOKING",
        sourceId: created.id,
        source: "BOOKING",
        status: "ACTIVE",
        priority: 40,
        startAt: booking.checkinAt,
        endAt: booking.checkoutAt,
      },
    });

    const folio = await prisma.folio.create({
      data: {
        bookingId: created.id,
        roomId: booking.roomId,
        status: booking.status === BookingStatus.CHECKED_IN ? "PARTIALLY_PAID" : "ISSUED",
        amountDue: booking.totalAmount,
        amountPaid: booking.status === BookingStatus.CHECKED_IN ? Math.round(booking.totalAmount * 0.55) : 0,
        currency: "CNY",
        dueDate: booking.checkinAt,
      },
    });

    if (booking.shouldCheckIn) {
      await prisma.checkInRecord.create({
        data: {
          bookingId: created.id,
          roomId: booking.roomId,
          requestId: `${booking.requestId}-checkin`,
          idempotencyKey: `${booking.idempotencyKey}-checkin`,
          actualCheckinAt: booking.checkinAt,
          securityCheckStatus: "PASSED",
          status: "CHECKED_IN",
        },
      });

      await prisma.payment.create({
        data: {
          folioId: folio.id,
          requestId: `${booking.requestId}-payment`,
          idempotencyKey: `${booking.idempotencyKey}-payment`,
          amount: Math.round(booking.totalAmount * 0.55),
          method: "WECHAT",
          provider: "seed_gateway",
          channelTxnNo: `SEEDTXN${created.id.slice(-10)}`,
          status: "SUCCEEDED",
          paidAt: booking.checkinAt,
        },
      });

      await prisma.room.update({
        where: { id: booking.roomId },
        data: {
          roomStatus: RoomStatus.OCCUPIED,
          operationState: "IN_HOUSE",
        },
      });
    }

    createdBookings.push(created);
  }

  const attentionRooms = await prisma.room.findMany({
    where: {
      propertyId,
      roomStatus: {
        in: [RoomStatus.VACANT_DIRTY, RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_SERVICE],
      },
    },
    orderBy: { roomNo: "asc" },
    take: 24,
  });

  await prisma.roomStatusEvent.createMany({
    data: attentionRooms.map((room, index) => ({
      roomId: room.id,
      beforeStatus: RoomStatus.VACANT_CLEAN,
      afterStatus: room.roomStatus,
      triggerType: room.roomStatus === RoomStatus.VACANT_DIRTY ? "HOUSEKEEPING" : "ENGINEERING",
      triggerRefType: "SEED",
      triggerRefId: `status-event-${index + 1}`,
      operator: "seed-script",
      occurredAt: plusDays(today, -1 * (index % 3)),
    })),
  });

  return {
    guestSampleId: guests[0]?.id ?? null,
    sampleBookingId: createdBookings[0]?.id ?? null,
    arrivalsCount: arrivalRooms.length,
    departuresCount: departureRooms.length,
    inHouseCount: inHouseRooms.length,
    roomPlanCount: roomPlans.length,
  };
}

async function main() {
  const options = readSeedOptions();
  const propertyName = process.env.SEED_PROPERTY_NAME ?? "凯燕环球中心";

  await prisma.payment.deleteMany();
  await prisma.folio.deleteMany();
  await prisma.checkInRecord.deleteMany();
  await prisma.roomRevenueEntry.deleteMany();
  await prisma.roomCostProfile.deleteMany();
  await prisma.occupancyLedger.deleteMany();
  await prisma.inventoryLock.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.appSession.deleteMany();
  await prisma.deviceRegistration.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.roomStatusEvent.deleteMany();
  await prisma.room.deleteMany();
  await prisma.property.deleteMany();

  const property = await prisma.property.create({
    data: {
      name: propertyName,
      city: "上海",
      timezone: "Asia/Shanghai",
      currency: "CNY",
    },
  });

  const roomPlans = createRoomPlans(options.roomCount);
  await prisma.room.createMany({
    data: roomPlans.map((room) => ({
      propertyId: property.id,
      roomNo: room.roomNo,
      roomType: room.roomType,
      areaSqm: room.areaSqm,
      roomStatus: room.roomStatus,
      sellableStatus: room.sellableStatus,
      operationState: room.operationState,
    })),
  });

  const rooms = await prisma.room.findMany({
    where: { propertyId: property.id },
    orderBy: { roomNo: "asc" },
  });

  const planByRoomNo = new Map(roomPlans.map((plan) => [plan.roomNo, plan]));

  await prisma.roomCostProfile.createMany({
    data: rooms.map((room) => {
      const plan = planByRoomNo.get(room.roomNo)!;
      return {
        roomId: room.id,
        ...plan.costProfile,
      };
    }),
  });

  const revenueEntries = rooms.flatMap((room, index) => {
    const plan = planByRoomNo.get(room.roomNo)!;
    return buildRevenueEntries(room.id, options.year, index, plan);
  });

  await prisma.roomRevenueEntry.createMany({
    data: revenueEntries,
  });

  const password = process.env.FRONTDESK_DEMO_PASSWORD ?? "frontdesk123";
  const operator = await prisma.operator.create({
    data: {
      propertyId: property.id,
      username: "frontdesk",
      passwordHash: await bcrypt.hash(password, 10),
      displayName: "前台测试账号",
      role: "FRONTDESK",
    },
  });

  const operations = await seedRealtimeOperations(property.id, roomPlans, options);

  console.log("Seed completed");
  console.log({
    propertyId: property.id,
    operator: {
      username: operator.username,
      password,
    },
    roomCount: roomPlans.length,
    economicsYear: options.year,
    revenueEntryCount: revenueEntries.length,
    sampleGuestId: operations.guestSampleId,
    sampleBookingId: operations.sampleBookingId,
    arrivals: operations.arrivalsCount,
    departures: operations.departuresCount,
    inHouse: operations.inHouseCount,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
