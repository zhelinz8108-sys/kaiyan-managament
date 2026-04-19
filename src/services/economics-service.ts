import { OperatingMode } from "@prisma/client";

import { prisma } from "../lib/db.js";
import { assertPresent } from "../lib/http.js";

type MonthMixItem = {
  month: number;
  mode: OperatingMode | "IDLE";
  revenue: number;
  occupiedNights: number;
};

function monthlyCostTotal(costProfile: {
  monthlyRentCost: number;
  monthlyPropertyFeeCost: number;
  monthlyCleaningCost: number;
  monthlyMaintenanceCost: number;
  monthlyUtilityCost: number;
  monthlyOtherCost: number;
} | null) {
  if (!costProfile) {
    return 0;
  }

  return (
    costProfile.monthlyRentCost +
    costProfile.monthlyPropertyFeeCost +
    costProfile.monthlyCleaningCost +
    costProfile.monthlyMaintenanceCost +
    costProfile.monthlyUtilityCost +
    costProfile.monthlyOtherCost
  );
}

function emptyModeRevenue() {
  return {
    DAILY: 0,
    SHORT_STAY: 0,
    LONG_STAY: 0,
  };
}

function deriveFloor(roomNo: string) {
  return roomNo.length > 2 ? roomNo.slice(0, -2) : roomNo;
}

function buildMonthMix(entries: Array<{
  periodMonth: number;
  operatingMode: OperatingMode;
  recognizedRevenue: number;
  occupiedNights: number;
}>) {
  const monthMap = new Map<number, typeof entries>();

  for (const entry of entries) {
    const list = monthMap.get(entry.periodMonth) ?? [];
    list.push(entry);
    monthMap.set(entry.periodMonth, list);
  }

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const items = monthMap.get(month) ?? [];

    if (items.length === 0) {
      return {
        month,
        mode: "IDLE",
        revenue: 0,
        occupiedNights: 0,
      } satisfies MonthMixItem;
    }

    const dominant = [...items].sort((left, right) => {
      if (right.occupiedNights !== left.occupiedNights) {
        return right.occupiedNights - left.occupiedNights;
      }

      return right.recognizedRevenue - left.recognizedRevenue;
    })[0];

    return {
      month,
      mode: dominant.operatingMode,
      revenue: items.reduce((sum, item) => sum + item.recognizedRevenue, 0),
      occupiedNights: items.reduce((sum, item) => sum + item.occupiedNights, 0),
    } satisfies MonthMixItem;
  });
}

export async function getRoomEconomicsOverview(propertyId: string, year: number, month?: number) {
  const property = assertPresent(
    await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        rooms: {
          include: {
            costProfile: true,
            revenueEntries: {
              where: {
                periodYear: year,
                ...(month ? { periodMonth: month } : {}),
              },
              orderBy: [{ periodMonth: "asc" }, { operatingMode: "asc" }],
            },
          },
          orderBy: { roomNo: "asc" },
        },
      },
    }),
    "Property not found",
  );

  const periods = month ? 1 : 12;

  const rooms = property.rooms.map((room) => {
    const monthlyCost = monthlyCostTotal(room.costProfile);
    const fixedCost = monthlyCost * periods;
    const revenueByMode = emptyModeRevenue();

    for (const entry of room.revenueEntries) {
      revenueByMode[entry.operatingMode] += entry.recognizedRevenue;
    }

    const totalRevenue = room.revenueEntries.reduce((sum, entry) => sum + entry.recognizedRevenue, 0);
    const totalOccupiedNights = room.revenueEntries.reduce((sum, entry) => sum + entry.occupiedNights, 0);
    const grossProfit = totalRevenue - fixedCost;
    const margin = totalRevenue > 0 ? grossProfit / totalRevenue : null;
    const monthMix = buildMonthMix(room.revenueEntries);

    const mixSummary = {
      dailyMonths: monthMix.filter((item) => item.mode === "DAILY").length,
      shortStayMonths: monthMix.filter((item) => item.mode === "SHORT_STAY").length,
      longStayMonths: monthMix.filter((item) => item.mode === "LONG_STAY").length,
      idleMonths: monthMix.filter((item) => item.mode === "IDLE").length,
    };

    return {
      roomId: room.id,
      roomNo: room.roomNo,
      floor: deriveFloor(room.roomNo),
      roomType: room.roomType,
      areaSqm: room.areaSqm,
      roomStatus: room.roomStatus,
      sellableStatus: room.sellableStatus,
      monthlyCost: {
        rent: room.costProfile?.monthlyRentCost ?? 0,
        propertyFee: room.costProfile?.monthlyPropertyFeeCost ?? 0,
        cleaning: room.costProfile?.monthlyCleaningCost ?? 0,
        maintenance: room.costProfile?.monthlyMaintenanceCost ?? 0,
        utility: room.costProfile?.monthlyUtilityCost ?? 0,
        other: room.costProfile?.monthlyOtherCost ?? 0,
        total: monthlyCost,
      },
      fixedCost,
      revenue: {
        total: totalRevenue,
        byMode: revenueByMode,
        occupiedNights: totalOccupiedNights,
        averagePerMonth: periods > 0 ? Math.round(totalRevenue / periods) : 0,
      },
      profitability: {
        grossProfit,
        margin,
        status: grossProfit > 0 ? "PROFIT" : grossProfit < 0 ? "LOSS" : "BREAKEVEN",
      },
      mixSummary,
      monthMix,
      notes: room.costProfile?.notes ?? null,
    };
  });

  const totalRevenue = rooms.reduce((sum, room) => sum + room.revenue.total, 0);
  const totalFixedCost = rooms.reduce((sum, room) => sum + room.fixedCost, 0);
  const grossProfit = totalRevenue - totalFixedCost;
  const profitableRooms = rooms.filter((room) => room.profitability.grossProfit > 0).length;
  const lossRooms = rooms.filter((room) => room.profitability.grossProfit < 0).length;
  const hasEconomicsData = rooms.some((room) => room.revenue.total !== 0 || room.fixedCost !== 0);
  const bestRoom = hasEconomicsData
    ? [...rooms].sort((left, right) => right.profitability.grossProfit - left.profitability.grossProfit)[0] ?? null
    : null;
  const worstRoom = hasEconomicsData
    ? [...rooms].sort((left, right) => left.profitability.grossProfit - right.profitability.grossProfit)[0] ?? null
    : null;

  const modeTotals = rooms.reduce(
    (accumulator, room) => {
      accumulator.DAILY += room.revenue.byMode.DAILY;
      accumulator.SHORT_STAY += room.revenue.byMode.SHORT_STAY;
      accumulator.LONG_STAY += room.revenue.byMode.LONG_STAY;
      return accumulator;
    },
    emptyModeRevenue(),
  );

  return {
    property: {
      id: property.id,
      name: property.name,
      city: property.city,
      timezone: property.timezone,
      currency: property.currency,
    },
    period: {
      year,
      month: month ?? null,
      periods,
      label: month ? `${year}-${String(month).padStart(2, "0")}` : `${year} 全年`,
    },
    summary: {
      totalRevenue,
      totalFixedCost,
      grossProfit,
      profitableRooms,
      lossRooms,
      revenueByMode: modeTotals,
      bestRoom: bestRoom
        ? {
            roomNo: bestRoom.roomNo,
            grossProfit: bestRoom.profitability.grossProfit,
          }
        : null,
      worstRoom: worstRoom
        ? {
            roomNo: worstRoom.roomNo,
            grossProfit: worstRoom.profitability.grossProfit,
          }
        : null,
    },
    rooms,
  };
}
