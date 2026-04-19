import { prisma } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { assertPresent } from "../lib/http.js";

type UpsertRoomCostProfileInput = {
  roomId: string;
  monthlyRentCost: number;
  monthlyPropertyFeeCost: number;
  monthlyCleaningCost: number;
  monthlyMaintenanceCost: number;
  monthlyUtilityCost: number;
  monthlyOtherCost: number;
  notes?: string | null;
};

function assertNonNegativeCost(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(400, "VALIDATION_ERROR", `${name} must be a non-negative integer`);
  }
}

export async function upsertRoomCostProfile(input: UpsertRoomCostProfileInput) {
  assertPresent(await prisma.room.findUnique({ where: { id: input.roomId } }), "Room not found");

  assertNonNegativeCost("monthly_rent_cost", input.monthlyRentCost);
  assertNonNegativeCost("monthly_property_fee_cost", input.monthlyPropertyFeeCost);
  assertNonNegativeCost("monthly_cleaning_cost", input.monthlyCleaningCost);
  assertNonNegativeCost("monthly_maintenance_cost", input.monthlyMaintenanceCost);
  assertNonNegativeCost("monthly_utility_cost", input.monthlyUtilityCost);
  assertNonNegativeCost("monthly_other_cost", input.monthlyOtherCost);

  return prisma.roomCostProfile.upsert({
    where: { roomId: input.roomId },
    update: {
      monthlyRentCost: input.monthlyRentCost,
      monthlyPropertyFeeCost: input.monthlyPropertyFeeCost,
      monthlyCleaningCost: input.monthlyCleaningCost,
      monthlyMaintenanceCost: input.monthlyMaintenanceCost,
      monthlyUtilityCost: input.monthlyUtilityCost,
      monthlyOtherCost: input.monthlyOtherCost,
      notes: input.notes ?? null,
    },
    create: {
      roomId: input.roomId,
      monthlyRentCost: input.monthlyRentCost,
      monthlyPropertyFeeCost: input.monthlyPropertyFeeCost,
      monthlyCleaningCost: input.monthlyCleaningCost,
      monthlyMaintenanceCost: input.monthlyMaintenanceCost,
      monthlyUtilityCost: input.monthlyUtilityCost,
      monthlyOtherCost: input.monthlyOtherCost,
      notes: input.notes ?? null,
    },
  });
}
