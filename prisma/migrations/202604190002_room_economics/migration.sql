-- CreateTable
CREATE TABLE "RoomCostProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "monthlyRentCost" INTEGER NOT NULL,
    "monthlyCleaningCost" INTEGER NOT NULL,
    "monthlyMaintenanceCost" INTEGER NOT NULL,
    "monthlyUtilityCost" INTEGER NOT NULL,
    "monthlyOtherCost" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoomCostProfile_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomRevenueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "operatingMode" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "recognizedRevenue" INTEGER NOT NULL,
    "occupiedNights" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoomRevenueEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomCostProfile_roomId_key" ON "RoomCostProfile"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomRevenueEntry_roomId_periodYear_periodMonth_operatingMode_key"
ON "RoomRevenueEntry"("roomId", "periodYear", "periodMonth", "operatingMode");
