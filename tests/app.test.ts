import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDbPath = path.join(process.cwd(), "prisma", "test.db");

describe("hotel apartment api", () => {
  let createApp: typeof import("../src/app.js").createApp;
  let prisma: typeof import("../src/lib/db.js").prisma;
  let testData: { propertyId: string; roomId: string; guestId: string };

  beforeAll(async () => {
    process.env.DATABASE_URL = "file:./test.db";
    process.env.NODE_ENV = "test";

    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath);
    }

    execSync("npm run db:reset", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "file:./test.db",
      },
    });

    ({ createApp } = await import("../src/app.js"));
    ({ prisma } = await import("../src/lib/db.js"));
  });

  beforeEach(async () => {
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
        name: "测试项目",
        city: "上海",
        timezone: "Asia/Shanghai",
        currency: "CNY",
      },
    });

    const room = await prisma.room.create({
      data: {
        propertyId: property.id,
        roomNo: "1201",
        roomType: "大床房",
        areaSqm: 68.5,
        roomStatus: "VACANT_CLEAN",
        sellableStatus: "SELLABLE",
      },
    });

    const guest = await prisma.guest.create({
      data: {
        name: "测试住客",
        phone: "13900000000",
      },
    });

    await prisma.operator.create({
      data: {
        propertyId: property.id,
        username: "frontdesk",
        passwordHash: await bcrypt.hash("frontdesk123", 10),
        displayName: "测试前台",
        role: "FRONTDESK",
      },
    });

    testData = {
      propertyId: property.id,
      roomId: room.id,
      guestId: guest.id,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a booking and blocks an overlapping booking", async () => {
    const app = await createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      payload: {
        request_id: "req-1",
        idempotency_key: "booking-key-1",
        source_system: "IOS_FRONTDESK_APP",
        property_id: testData.propertyId,
        room_id: testData.roomId,
        guest_id: testData.guestId,
        checkin_at: "2026-04-20T14:00:00.000Z",
        checkout_at: "2026-04-21T12:00:00.000Z",
        total_amount: 50000,
      },
    });

    expect(createResponse.statusCode).toBe(200);

    const conflictResponse = await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      payload: {
        request_id: "req-2",
        idempotency_key: "booking-key-2",
        source_system: "IOS_FRONTDESK_APP",
        property_id: testData.propertyId,
        room_id: testData.roomId,
        guest_id: testData.guestId,
        checkin_at: "2026-04-20T16:00:00.000Z",
        checkout_at: "2026-04-22T12:00:00.000Z",
        total_amount: 70000,
      },
    });

    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json().code).toBe("ROOM_CONFLICT");
    await app.close();
  });

  it("returns booking changes from frontdesk sync", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/bookings",
      payload: {
        request_id: "req-sync-1",
        idempotency_key: "booking-sync-1",
        source_system: "IOS_FRONTDESK_APP",
        property_id: testData.propertyId,
        room_id: testData.roomId,
        guest_id: testData.guestId,
        checkin_at: "2026-04-20T14:00:00.000Z",
        checkout_at: "2026-04-21T12:00:00.000Z",
        total_amount: 50000,
      },
    });

    const syncResponse = await app.inject({
      method: "GET",
      url: `/api/v1/frontdesk/sync?property_id=${testData.propertyId}&cursor=1970-01-01T00:00:00.000Z`,
    });

    expect(syncResponse.statusCode).toBe(200);
    const payload = syncResponse.json();
    expect(payload.data.changes.bookings.length).toBe(1);
    expect(payload.data.changes.rooms.length).toBe(1);
    await app.close();
  });

  it("returns room economics with per-room profit calculation", async () => {
    const app = await createApp();

    await prisma.roomCostProfile.create({
      data: {
        roomId: testData.roomId,
        monthlyRentCost: 20000,
        monthlyCleaningCost: 2000,
        monthlyMaintenanceCost: 1000,
        monthlyUtilityCost: 1500,
        monthlyOtherCost: 500,
      },
    });

    await prisma.roomRevenueEntry.create({
      data: {
        roomId: testData.roomId,
        operatingMode: "LONG_STAY",
        periodYear: 2026,
        periodMonth: 4,
        periodStart: new Date("2026-04-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-30T23:59:59.000Z"),
        recognizedRevenue: 60000,
        occupiedNights: 30,
        orderCount: 1,
      },
    });

    const economicsResponse = await app.inject({
      method: "GET",
      url: `/api/v1/asset/room-economics?property_id=${testData.propertyId}&year=2026&month=4`,
    });

    expect(economicsResponse.statusCode).toBe(200);
    const payload = economicsResponse.json();
    expect(payload.data.summary.totalRevenue).toBe(60000);
    expect(payload.data.summary.totalFixedCost).toBe(25000);
    expect(payload.data.summary.grossProfit).toBe(35000);
    expect(payload.data.rooms[0].profitability.status).toBe("PROFIT");
    expect(payload.data.rooms[0].areaSqm).toBe(68.5);
    expect(payload.data.rooms[0].floor).toBe("12");
    await app.close();
  });

  it("handles economics aggregation for 200 rooms", async () => {
    const app = await createApp();

    const roomRows = Array.from({ length: 200 }, (_, index) => ({
      propertyId: testData.propertyId,
      roomNo: `T${String(index + 1).padStart(3, "0")}`,
      roomType: index % 2 === 0 ? "大床房" : "双床房",
      areaSqm: 60 + index * 0.5,
      roomStatus: "VACANT_CLEAN" as const,
      sellableStatus: "SELLABLE" as const,
      operationState: "IN_SERVICE",
    }));

    await prisma.room.delete({
      where: { id: testData.roomId },
    });

    await prisma.room.createMany({
      data: roomRows,
    });

    const rooms = await prisma.room.findMany({
      where: { propertyId: testData.propertyId },
      orderBy: { roomNo: "asc" },
    });

    await prisma.roomCostProfile.createMany({
      data: rooms.map((room, index) => ({
        roomId: room.id,
        monthlyRentCost: 20000 + (index % 5) * 1000,
        monthlyCleaningCost: 1800,
        monthlyMaintenanceCost: 1200,
        monthlyUtilityCost: 1600,
        monthlyOtherCost: 500,
      })),
    });

    await prisma.roomRevenueEntry.createMany({
      data: rooms.map((room, index) => ({
        roomId: room.id,
        operatingMode: index % 3 === 0 ? "LONG_STAY" : index % 2 === 0 ? "SHORT_STAY" : "DAILY",
        periodYear: 2026,
        periodMonth: 4,
        periodStart: new Date("2026-04-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-30T23:59:59.000Z"),
        recognizedRevenue: 26000 + index * 180,
        occupiedNights: index % 3 === 0 ? 30 : 18,
        orderCount: index % 3 === 0 ? 1 : 6,
      })),
    });

    const economicsResponse = await app.inject({
      method: "GET",
      url: `/api/v1/asset/room-economics?property_id=${testData.propertyId}&year=2026&month=4`,
    });

    expect(economicsResponse.statusCode).toBe(200);
    const payload = economicsResponse.json();
    expect(payload.data.rooms).toHaveLength(200);
    expect(payload.data.summary.profitableRooms + payload.data.summary.lossRooms).toBe(200);
    expect(payload.data.summary.totalRevenue).toBeGreaterThan(0);
    await app.close();
  });
});
