import "dotenv/config";

import bcrypt from "bcryptjs";
import {
  BookingStatus,
  RoomStatus,
  SellableStatus,
  SourceSystem,
} from "@prisma/client";

import { prisma } from "../src/lib/db.js";
import { KAIYAN_OWNER_ROOM_LIST } from "./kaiyan-owner-room-list.js";

const DEFAULT_ROOM_COUNT = KAIYAN_OWNER_ROOM_LIST.length;

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
  costProfile: {
    monthlyRentCost: number;
    monthlyPropertyFeeCost: number;
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

function roomStatusFor(index: number) {
  if (index % 37 === 0) {
    return {
      roomStatus: RoomStatus.OUT_OF_SERVICE,
      sellableStatus: SellableStatus.UNSELLABLE,
      operationState: "OUT_OF_SERVICE",
    };
  }

  if (index % 23 === 0) {
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

function emptyCostProfile() {
  return {
    monthlyRentCost: 0,
    monthlyPropertyFeeCost: 0,
    monthlyCleaningCost: 0,
    monthlyMaintenanceCost: 0,
    monthlyUtilityCost: 0,
    monthlyOtherCost: 0,
    notes: "",
  };
}

function createRoomPlans(roomCount: number): RoomPlan[] {
  return KAIYAN_OWNER_ROOM_LIST.slice(0, roomCount).map((room, index) => {
    const status = roomStatusFor(index);

    return {
      roomNo: room.roomNo,
      roomType: roomTypeForRoomNo(room.roomNo),
      areaSqm: room.areaSqm,
      ...status,
      costProfile: emptyCostProfile(),
    };
  });
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

async function seedRealtimeOperations(propertyId: string, roomCount: number) {
  const sellableRooms = await prisma.room.findMany({
    where: {
      propertyId,
      sellableStatus: SellableStatus.SELLABLE,
    },
    orderBy: { roomNo: "asc" },
  });

  const guestCount = Math.max(60, Math.ceil(roomCount * 0.35));
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
  const inHouseRooms = sellableRooms.slice(
    arrivalRooms.length + departureRooms.length,
    arrivalRooms.length + departureRooms.length + 36,
  );

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
      totalAmount: 0,
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
      totalAmount: 0,
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
      totalAmount: 0,
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
        amountDue: 0,
        amountPaid: 0,
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
          amount: 0,
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

  const operations = await seedRealtimeOperations(property.id, roomPlans.length);

  console.log("Seed completed");
  console.log({
    propertyId: property.id,
    operator: {
      username: operator.username,
      password,
    },
    roomCount: roomPlans.length,
    economicsYear: options.year,
    revenueEntryCount: 0,
    sampleGuestId: operations.guestSampleId,
    sampleBookingId: operations.sampleBookingId,
    arrivals: operations.arrivalsCount,
    departures: operations.departuresCount,
    inHouse: operations.inHouseCount,
    economicsMode: "ZERO_BASELINE",
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
