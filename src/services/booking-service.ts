import {
  BookingStatus,
  FolioStatus,
  PaymentMethod,
  PaymentStatus,
  RoomStatus,
  SecurityCheckStatus,
  SourceSystem,
} from "@prisma/client";

import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { assertPresent } from "../lib/http.js";
import { ensureValidRange } from "../lib/time.js";
import { assertRoomAvailable, releaseOccupancyByBooking } from "./inventory-service.js";

type CreateBookingInput = {
  requestId: string;
  idempotencyKey: string;
  sourceSystem: SourceSystem;
  propertyId: string;
  roomId: string;
  guestId: string;
  checkinAt: Date;
  checkoutAt: Date;
  totalAmount: number;
  externalRef?: string;
  lockId?: string;
};

type CheckInInput = {
  bookingId: string;
  requestId: string;
  idempotencyKey: string;
  operator: string;
  actualCheckinAt: Date;
  verificationResult: "PASSED" | "FAILED";
};

type CheckoutInput = {
  refType: "BOOKING";
  refId: string;
  requestId: string;
  idempotencyKey: string;
  operator: string;
  actualCheckoutAt: Date;
  settlementOption?: "BLOCK_IF_UNPAID" | "ALLOW_PENDING";
};

type PaymentInput = {
  folioId: string;
  requestId: string;
  idempotencyKey: string;
  amount: number;
  paymentMethod: PaymentMethod;
  provider: string;
  channelTxnNo: string;
  paidAt: Date;
};

export async function createBooking(input: CreateBookingInput) {
  const existing = await prisma.booking.findUnique({
    where: {
      sourceSystem_idempotencyKey: {
        sourceSystem: input.sourceSystem,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: {
      room: true,
      guest: true,
      folios: true,
    },
  });

  if (existing) {
    return existing;
  }

  ensureValidRange(input.checkinAt, input.checkoutAt);

  const [rawProperty, rawRoom, rawGuest] = await Promise.all([
    prisma.property.findUnique({ where: { id: input.propertyId } }),
    prisma.room.findUnique({ where: { id: input.roomId } }),
    prisma.guest.findUnique({ where: { id: input.guestId } }),
  ]);

  const property = assertPresent(rawProperty, "Property not found");
  const room = assertPresent(rawRoom, "Room not found");
  assertPresent(rawGuest, "Guest not found");

  if (room.propertyId !== property.id) {
    throw new ApiError(400, "VALIDATION_ERROR", "Room does not belong to the property");
  }

  if (room.sellableStatus !== "SELLABLE") {
    throw new ApiError(409, "ROOM_CONFLICT", "Room is not sellable");
  }

  await assertRoomAvailable(input.roomId, input.checkinAt, input.checkoutAt);

  return prisma.$transaction(async (tx) => {
    if (input.lockId) {
      const lock = await tx.inventoryLock.findUnique({ where: { id: input.lockId } });
      if (!lock) {
        throw new ApiError(404, "NOT_FOUND", "Inventory lock not found");
      }
    }

    const booking = await tx.booking.create({
      data: {
        propertyId: input.propertyId,
        roomId: input.roomId,
        guestId: input.guestId,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        sourceSystem: input.sourceSystem,
        externalRef: input.externalRef,
        checkinAt: input.checkinAt,
        checkoutAt: input.checkoutAt,
        totalAmount: input.totalAmount,
        status: BookingStatus.CONFIRMED,
      },
    });

    await tx.occupancyLedger.create({
      data: {
        roomId: input.roomId,
        sourceType: "BOOKING",
        sourceId: booking.id,
        source: "BOOKING",
        status: "ACTIVE",
        priority: 40,
        startAt: input.checkinAt,
        endAt: input.checkoutAt,
      },
    });

    await tx.folio.create({
      data: {
        bookingId: booking.id,
        roomId: input.roomId,
        status: FolioStatus.ISSUED,
        amountDue: input.totalAmount,
        amountPaid: 0,
        currency: property.currency,
        dueDate: input.checkinAt,
      },
    });

    if (input.lockId) {
      await tx.inventoryLock.update({
        where: { id: input.lockId },
        data: { status: "CONSUMED" },
      });
    }

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: {
        room: true,
        guest: true,
        folios: true,
      },
    });
  });
}

export async function getBookingDetail(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: true,
      room: true,
      checkIns: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      folios: {
        include: {
          payments: true,
        },
      },
    },
  });
}

export async function checkInBooking(input: CheckInInput) {
  const booking = assertPresent(
    await prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { room: true },
    }),
    "Booking not found",
  );

  const existing = await prisma.checkInRecord.findUnique({
    where: {
      bookingId_idempotencyKey: {
        bookingId: input.bookingId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  if (existing) {
    return existing;
  }

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.CHECKED_IN) {
    throw new ApiError(409, "BOOKING_STATUS_INVALID", "Booking is not ready for check-in");
  }

  if (input.verificationResult !== "PASSED") {
    throw new ApiError(409, "SECURITY_CHECK_FAILED", "Security verification failed");
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.checkInRecord.create({
      data: {
        bookingId: input.bookingId,
        roomId: booking.roomId,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        actualCheckinAt: input.actualCheckinAt,
        securityCheckStatus: SecurityCheckStatus.PASSED,
        status: "CHECKED_IN",
      },
    });

    if (booking.status !== BookingStatus.CHECKED_IN) {
      await tx.booking.update({
        where: { id: input.bookingId },
        data: { status: BookingStatus.CHECKED_IN },
      });
    }

    if (booking.room.roomStatus !== RoomStatus.OCCUPIED) {
      await tx.room.update({
        where: { id: booking.roomId },
        data: { roomStatus: RoomStatus.OCCUPIED },
      });

      await tx.roomStatusEvent.create({
        data: {
          roomId: booking.roomId,
          beforeStatus: booking.room.roomStatus,
          afterStatus: RoomStatus.OCCUPIED,
          triggerType: "CHECK_IN",
          triggerRefType: "BOOKING",
          triggerRefId: input.bookingId,
          operator: input.operator,
        },
      });
    }

    return record;
  });
}

export async function checkoutBooking(input: CheckoutInput) {
  if (input.refType !== "BOOKING") {
    throw new ApiError(400, "VALIDATION_ERROR", "Only BOOKING checkout is currently supported");
  }

  const booking = assertPresent(
    await prisma.booking.findUnique({
      where: { id: input.refId },
      include: {
        room: true,
        folios: true,
        checkIns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    "Booking not found",
  );

  const latestCheckIn = booking.checkIns[0];
  if (!latestCheckIn) {
    throw new ApiError(409, "REF_STATUS_INVALID", "Booking has not been checked in");
  }

  const pendingAmount = Math.max(
    booking.folios.reduce((sum, folio) => sum + (folio.amountDue - folio.amountPaid), 0),
    0,
  );

  if (pendingAmount > 0 && input.settlementOption !== "ALLOW_PENDING") {
    throw new ApiError(409, "UNSETTLED_FOLIO", "Outstanding folio balance must be settled first", {
      pendingAmount,
    });
  }

  return prisma.$transaction(async (tx) => {
    const updatedRecord = await tx.checkInRecord.update({
      where: { id: latestCheckIn.id },
      data: {
        checkoutRequestId: input.requestId,
        checkoutIdempotencyKey: input.idempotencyKey,
        actualCheckoutAt: input.actualCheckoutAt,
        status: "CHECKED_OUT",
      },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CHECKED_OUT },
    });

    await tx.room.update({
      where: { id: booking.roomId },
      data: { roomStatus: RoomStatus.VACANT_DIRTY },
    });

    await tx.roomStatusEvent.create({
      data: {
        roomId: booking.roomId,
        beforeStatus: booking.room.roomStatus,
        afterStatus: RoomStatus.VACANT_DIRTY,
        triggerType: "CHECK_OUT",
        triggerRefType: "BOOKING",
        triggerRefId: booking.id,
        operator: input.operator,
      },
    });

    await releaseOccupancyByBooking(booking.id, input.actualCheckoutAt, tx);

    return {
      checkinRecordId: updatedRecord.id,
      pendingAmount,
      roomStatus: RoomStatus.VACANT_DIRTY,
    };
  });
}

export async function recordPayment(input: PaymentInput) {
  const folio = assertPresent(
    await prisma.folio.findUnique({
      where: { id: input.folioId },
    }),
    "Folio not found",
  );

  const existing = await prisma.payment.findUnique({
    where: {
      folioId_idempotencyKey: {
        folioId: input.folioId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  if (existing) {
    return existing;
  }

  if (input.amount <= 0) {
    throw new ApiError(400, "AMOUNT_INVALID", "Payment amount must be greater than zero");
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        folioId: input.folioId,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        amount: input.amount,
        method: input.paymentMethod,
        provider: input.provider,
        channelTxnNo: input.channelTxnNo,
        status: PaymentStatus.SUCCEEDED,
        paidAt: input.paidAt,
      },
    });

    const nextPaid = folio.amountPaid + input.amount;
    const nextStatus = nextPaid >= folio.amountDue ? FolioStatus.PAID : FolioStatus.PARTIALLY_PAID;

    await tx.folio.update({
      where: { id: folio.id },
      data: {
        amountPaid: nextPaid,
        status: nextStatus,
      },
    });

    return payment;
  });
}
