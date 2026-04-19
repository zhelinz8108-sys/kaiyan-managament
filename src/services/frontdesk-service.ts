import { BookingStatus, RoomStatus, SourceSystem } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { assertPresent } from "../lib/http.js";
import { parseBusinessDate } from "../lib/time.js";

export async function createAppSession(params: {
  username: string;
  passwordOrTicket: string;
  deviceId: string;
  propertyId: string;
}) {
  const operator = assertPresent(
    await prisma.operator.findUnique({
      where: { username: params.username },
      include: { property: true },
    }),
    "Operator not found",
  );

  if (operator.propertyId !== params.propertyId) {
    throw new ApiError(403, "PERMISSION_DENIED", "Operator is not assigned to this property");
  }

  const passwordMatch = await bcrypt.compare(params.passwordOrTicket, operator.passwordHash);
  if (!passwordMatch) {
    throw new ApiError(401, "PERMISSION_DENIED", "Invalid username or password");
  }

  const session = await prisma.appSession.create({
    data: {
      operatorId: operator.id,
      deviceId: params.deviceId,
      sourceSystem: SourceSystem.IOS_FRONTDESK_APP,
      accessToken: nanoid(32),
      refreshToken: nanoid(40),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    operatorProfile: {
      operatorId: operator.id,
      displayName: operator.displayName,
      role: operator.role,
      propertyId: operator.propertyId,
      propertyName: operator.property.name,
    },
    shiftContext: {
      propertyId: operator.propertyId,
      openedAt: session.createdAt,
    },
  };
}

export async function registerDevice(params: {
  deviceId: string;
  propertyId: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  pushToken?: string;
}) {
  return prisma.deviceRegistration.upsert({
    where: { deviceId: params.deviceId },
    update: {
      propertyId: params.propertyId,
      deviceModel: params.deviceModel,
      osVersion: params.osVersion,
      appVersion: params.appVersion,
      pushToken: params.pushToken,
      sourceSystem: SourceSystem.IOS_FRONTDESK_APP,
    },
    create: {
      deviceId: params.deviceId,
      propertyId: params.propertyId,
      deviceModel: params.deviceModel,
      osVersion: params.osVersion,
      appVersion: params.appVersion,
      pushToken: params.pushToken,
      sourceSystem: SourceSystem.IOS_FRONTDESK_APP,
    },
  });
}

export async function getDashboard(propertyId: string, bizDate: string) {
  const { start, end } = parseBusinessDate(bizDate);

  const [arrivalsCount, departuresCount, inHouseCount, dirtyRoomCount, alerts] = await Promise.all([
    prisma.booking.count({
      where: {
        propertyId,
        checkinAt: { gte: start, lte: end },
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      },
    }),
    prisma.booking.count({
      where: {
        propertyId,
        checkoutAt: { gte: start, lte: end },
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      },
    }),
    prisma.booking.count({
      where: {
        propertyId,
        status: BookingStatus.CHECKED_IN,
      },
    }),
    prisma.room.count({
      where: {
        propertyId,
        roomStatus: { in: [RoomStatus.VACANT_DIRTY, RoomStatus.MAINTENANCE, RoomStatus.OUT_OF_SERVICE] },
      },
    }),
    prisma.roomStatusEvent.findMany({
      where: {
        room: { propertyId },
      },
      orderBy: { occurredAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    arrivalsCount,
    departuresCount,
    inHouseCount,
    dirtyRoomCount,
    alerts: alerts.map((event) => ({
      roomId: event.roomId,
      triggerType: event.triggerType,
      at: event.occurredAt,
    })),
  };
}

export async function getArrivals(propertyId: string, bizDate: string) {
  const { start, end } = parseBusinessDate(bizDate);

  return prisma.booking.findMany({
    where: {
      propertyId,
      checkinAt: { gte: start, lte: end },
    },
    include: {
      guest: true,
      room: true,
    },
    orderBy: { checkinAt: "asc" },
  });
}

export async function getDepartures(propertyId: string, bizDate: string) {
  const { start, end } = parseBusinessDate(bizDate);

  return prisma.booking.findMany({
    where: {
      propertyId,
      checkoutAt: { gte: start, lte: end },
    },
    include: {
      guest: true,
      room: true,
    },
    orderBy: { checkoutAt: "asc" },
  });
}

export async function getRoomBoard(propertyId: string, updatedSince?: string) {
  return prisma.room.findMany({
    where: {
      propertyId,
      ...(updatedSince ? { updatedAt: { gt: new Date(updatedSince) } } : {}),
    },
    orderBy: { roomNo: "asc" },
  });
}

export async function getSync(propertyId: string, cursor?: string, entityTypes?: string[]) {
  const cursorTime = cursor ? new Date(cursor) : new Date(0);
  const includeRooms = !entityTypes || entityTypes.includes("rooms");
  const includeBookings = !entityTypes || entityTypes.includes("bookings");
  const includeCheckins = !entityTypes || entityTypes.includes("checkins");

  const [rooms, bookings, checkins] = await Promise.all([
    includeRooms
      ? prisma.room.findMany({
          where: { propertyId, updatedAt: { gt: cursorTime } },
          orderBy: { updatedAt: "asc" },
        })
      : Promise.resolve([]),
    includeBookings
      ? prisma.booking.findMany({
          where: { propertyId, updatedAt: { gt: cursorTime } },
          include: { guest: true, room: true },
          orderBy: { updatedAt: "asc" },
        })
      : Promise.resolve([]),
    includeCheckins
      ? prisma.checkInRecord.findMany({
          where: { booking: { propertyId }, updatedAt: { gt: cursorTime } },
          orderBy: { updatedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const latestUpdate = [
    cursorTime,
    ...rooms.map((item) => item.updatedAt),
    ...bookings.map((item) => item.updatedAt),
    ...checkins.map((item) => item.updatedAt),
  ]
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1) ?? new Date();

  return {
    changes: {
      rooms,
      bookings,
      checkins,
    },
    tombstones: [],
    nextCursor: latestUpdate.toISOString(),
    serverTime: new Date().toISOString(),
  };
}

export async function getFrontdeskBootstrap() {
  const property = await prisma.property.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!property) {
    throw new ApiError(404, "NOT_FOUND", "No property is available");
  }

  const sampleOperator = await prisma.operator.findFirst({
    where: { propertyId: property.id },
    orderBy: { createdAt: "asc" },
  });

  const sampleBooking = await prisma.booking.findFirst({
    where: { propertyId: property.id },
    orderBy: { createdAt: "asc" },
  });

  return {
    property: {
      id: property.id,
      name: property.name,
      city: property.city,
      timezone: property.timezone,
      currency: property.currency,
    },
    sampleOperator: sampleOperator
      ? {
          username: sampleOperator.username,
          displayName: sampleOperator.displayName,
        }
      : null,
    sampleBookingId: sampleBooking?.id ?? null,
    today: new Date().toISOString().slice(0, 10),
  };
}
