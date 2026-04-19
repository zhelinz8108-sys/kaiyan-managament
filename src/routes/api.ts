import { PaymentMethod, SourceSystem } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { buildTraceId } from "../lib/http.js";
import {
  checkInBooking,
  checkoutBooking,
  createBooking,
  getBookingDetail,
  recordPayment,
} from "../services/booking-service.js";
import {
  createAppSession,
  getArrivals,
  getFrontdeskBootstrap,
  getDashboard,
  getDepartures,
  getRoomBoard,
  getSync,
  registerDevice,
} from "../services/frontdesk-service.js";
import { createInventoryLock } from "../services/inventory-service.js";
import { getRoomEconomicsOverview } from "../services/economics-service.js";
import { upsertRoomCostProfile } from "../services/room-cost-service.js";

const sourceSystemEnum = z.nativeEnum(SourceSystem);
const paymentMethodEnum = z.nativeEnum(PaymentMethod);

export async function registerApiRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    code: "OK",
    message: "service healthy",
    trace_id: crypto.randomUUID(),
    data: { uptime: process.uptime() },
  }));

  app.get("/api/v1/rooms/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const room = await prisma.room.findUnique({
      where: { id: params.id },
      include: {
        property: true,
        occupancies: {
          where: { status: "ACTIVE" },
          orderBy: { startAt: "asc" },
        },
      },
    });

    if (!room) {
      throw new ApiError(404, "NOT_FOUND", "Room not found");
    }

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: room,
    };
  });

  app.put("/api/v1/rooms/:id/cost-profile", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        monthly_rent_cost: z.number().int().nonnegative(),
        monthly_property_fee_cost: z.number().int().nonnegative(),
        monthly_cleaning_cost: z.number().int().nonnegative(),
        monthly_maintenance_cost: z.number().int().nonnegative(),
        monthly_utility_cost: z.number().int().nonnegative(),
        monthly_other_cost: z.number().int().nonnegative(),
        notes: z.string().max(500).optional(),
      })
      .parse(request.body);

    const profile = await upsertRoomCostProfile({
      roomId: params.id,
      monthlyRentCost: body.monthly_rent_cost,
      monthlyPropertyFeeCost: body.monthly_property_fee_cost,
      monthlyCleaningCost: body.monthly_cleaning_cost,
      monthlyMaintenanceCost: body.monthly_maintenance_cost,
      monthlyUtilityCost: body.monthly_utility_cost,
      monthlyOtherCost: body.monthly_other_cost,
      notes: body.notes,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: profile,
    };
  });

  app.post("/api/v1/inventory/locks", async (request) => {
    const body = z
      .object({
        request_id: z.string().min(1),
        idempotency_key: z.string().min(1),
        source_system: sourceSystemEnum.default(SourceSystem.IOS_FRONTDESK_APP),
        room_id: z.string().min(1),
        start_at: z.coerce.date(),
        end_at: z.coerce.date(),
        expires_at: z.coerce.date(),
        reason: z.string().min(1),
      })
      .parse(request.body);

    const lock = await createInventoryLock({
      requestId: body.request_id,
      idempotencyKey: body.idempotency_key,
      sourceSystem: body.source_system,
      roomId: body.room_id,
      startAt: body.start_at,
      endAt: body.end_at,
      expiresAt: body.expires_at,
      reason: body.reason,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(body.request_id),
      data: lock,
    };
  });

  app.post("/api/v1/bookings", async (request) => {
    const body = z
      .object({
        request_id: z.string().min(1),
        idempotency_key: z.string().min(1),
        source_system: sourceSystemEnum,
        property_id: z.string().min(1),
        room_id: z.string().min(1),
        guest_id: z.string().min(1),
        checkin_at: z.coerce.date(),
        checkout_at: z.coerce.date(),
        total_amount: z.number().int().nonnegative(),
        external_ref: z.string().optional(),
        lock_id: z.string().optional(),
      })
      .parse(request.body);

    const booking = await createBooking({
      requestId: body.request_id,
      idempotencyKey: body.idempotency_key,
      sourceSystem: body.source_system,
      propertyId: body.property_id,
      roomId: body.room_id,
      guestId: body.guest_id,
      checkinAt: body.checkin_at,
      checkoutAt: body.checkout_at,
      totalAmount: body.total_amount,
      externalRef: body.external_ref,
      lockId: body.lock_id,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(body.request_id),
      data: {
        booking_id: booking.id,
        booking_status: booking.status,
        total_amount: booking.totalAmount,
        occupancy_preview: {
          room_id: booking.roomId,
          start_at: booking.checkinAt,
          end_at: booking.checkoutAt,
        },
        folio_id: booking.folios[0]?.id,
      },
    };
  });

  app.post("/api/v1/bookings/:id/check-in", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        request_id: z.string().min(1),
        idempotency_key: z.string().min(1),
        operator: z.string().min(1),
        actual_checkin_at: z.coerce.date(),
        verification_result: z.enum(["PASSED", "FAILED"]),
      })
      .parse(request.body);

    const record = await checkInBooking({
      bookingId: params.id,
      requestId: body.request_id,
      idempotencyKey: body.idempotency_key,
      operator: body.operator,
      actualCheckinAt: body.actual_checkin_at,
      verificationResult: body.verification_result,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(body.request_id),
      data: {
        checkin_record_id: record.id,
        booking_status: "CHECKED_IN",
        room_status: "OCCUPIED",
      },
    };
  });

  app.post("/api/v1/checkouts", async (request) => {
    const body = z
      .object({
        request_id: z.string().min(1),
        idempotency_key: z.string().min(1),
        operator: z.string().min(1),
        ref_type: z.literal("BOOKING"),
        ref_id: z.string().min(1),
        actual_checkout_at: z.coerce.date(),
        settlement_option: z.enum(["BLOCK_IF_UNPAID", "ALLOW_PENDING"]).default("BLOCK_IF_UNPAID"),
      })
      .parse(request.body);

    const result = await checkoutBooking({
      refType: body.ref_type,
      refId: body.ref_id,
      requestId: body.request_id,
      idempotencyKey: body.idempotency_key,
      operator: body.operator,
      actualCheckoutAt: body.actual_checkout_at,
      settlementOption: body.settlement_option,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(body.request_id),
      data: {
        checkout_result: "CHECKED_OUT",
        pending_amount: result.pendingAmount,
        room_status: result.roomStatus,
      },
    };
  });

  app.post("/api/v1/folios/:id/payments", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        request_id: z.string().min(1),
        idempotency_key: z.string().min(1),
        amount: z.number().int().positive(),
        payment_method: paymentMethodEnum,
        provider: z.string().min(1),
        channel_txn_no: z.string().min(1),
        paid_at: z.coerce.date(),
      })
      .parse(request.body);

    const payment = await recordPayment({
      folioId: params.id,
      requestId: body.request_id,
      idempotencyKey: body.idempotency_key,
      amount: body.amount,
      paymentMethod: body.payment_method,
      provider: body.provider,
      channelTxnNo: body.channel_txn_no,
      paidAt: body.paid_at,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(body.request_id),
      data: {
        payment_id: payment.id,
        payment_status: payment.status,
      },
    };
  });

  app.post("/api/v1/frontdesk/app-sessions", async (request) => {
    const body = z
      .object({
        username: z.string().min(1),
        password_or_ticket: z.string().min(1),
        device_id: z.string().min(1),
        property_id: z.string().min(1),
      })
      .parse(request.body);

    const session = await createAppSession({
      username: body.username,
      passwordOrTicket: body.password_or_ticket,
      deviceId: body.device_id,
      propertyId: body.property_id,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: session,
    };
  });

  app.get("/api/v1/frontdesk/bootstrap", async () => {
    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: await getFrontdeskBootstrap(),
    };
  });

  app.post("/api/v1/frontdesk/devices/register", async (request) => {
    const body = z
      .object({
        device_id: z.string().min(1),
        property_id: z.string().min(1),
        device_model: z.string().min(1),
        os_version: z.string().min(1),
        app_version: z.string().min(1),
        push_token: z.string().optional(),
      })
      .parse(request.body);

    const device = await registerDevice({
      deviceId: body.device_id,
      propertyId: body.property_id,
      deviceModel: body.device_model,
      osVersion: body.os_version,
      appVersion: body.app_version,
      pushToken: body.push_token,
    });

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: {
        device_status: "REGISTERED",
        capabilities: ["dashboard", "arrivals", "departures", "sync"],
        device_id: device.deviceId,
      },
    };
  });

  app.get("/api/v1/frontdesk/dashboard", async (request) => {
    const query = z
      .object({
        property_id: z.string().min(1),
        biz_date: z.string().min(1),
      })
      .parse(request.query);

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: await getDashboard(query.property_id, query.biz_date),
    };
  });

  app.get("/api/v1/frontdesk/arrivals", async (request) => {
    const query = z
      .object({
        property_id: z.string().min(1),
        biz_date: z.string().min(1),
      })
      .parse(request.query);

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: {
        items: await getArrivals(query.property_id, query.biz_date),
        next_cursor: null,
        server_time: new Date().toISOString(),
      },
    };
  });

  app.get("/api/v1/frontdesk/departures", async (request) => {
    const query = z
      .object({
        property_id: z.string().min(1),
        biz_date: z.string().min(1),
      })
      .parse(request.query);

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: {
        items: await getDepartures(query.property_id, query.biz_date),
        next_cursor: null,
        server_time: new Date().toISOString(),
      },
    };
  });

  app.get("/api/v1/frontdesk/room-board", async (request) => {
    const query = z
      .object({
        property_id: z.string().min(1),
        updated_since: z.string().optional(),
      })
      .parse(request.query);

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: {
        rooms: await getRoomBoard(query.property_id, query.updated_since),
        snapshot_version: new Date().toISOString(),
        server_time: new Date().toISOString(),
      },
    };
  });

  app.get("/api/v1/frontdesk/bookings/:id", async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const booking = await getBookingDetail(params.id);

    if (!booking) {
      throw new ApiError(404, "NOT_FOUND", "Booking not found");
    }

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: {
        booking,
        folio_summary: booking.folios.map((folio) => ({
          folio_id: folio.id,
          status: folio.status,
          amount_due: folio.amountDue,
          amount_paid: folio.amountPaid,
        })),
        guests: [booking.guest],
        room_status: booking.room.roomStatus,
      },
    };
  });

  app.get("/api/v1/frontdesk/sync", async (request) => {
    const query = z
      .object({
        property_id: z.string().min(1),
        cursor: z.string().optional(),
        entity_types: z
          .string()
          .optional()
          .transform((value) => (value ? value.split(",").map((item) => item.trim()) : undefined)),
      })
      .parse(request.query);

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: await getSync(query.property_id, query.cursor, query.entity_types),
    };
  });

  app.get("/api/v1/asset/room-economics", async (request) => {
    const query = z
      .object({
        property_id: z.string().min(1),
        year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
        month: z.coerce.number().int().min(1).max(12).optional(),
      })
      .parse(request.query);

    return {
      code: "OK",
      message: "success",
      trace_id: buildTraceId(),
      data: await getRoomEconomicsOverview(query.property_id, query.year, query.month),
    };
  });
}
