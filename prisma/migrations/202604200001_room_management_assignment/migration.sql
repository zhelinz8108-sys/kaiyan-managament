CREATE TABLE "RoomManagementAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "managementStatus" TEXT NOT NULL,
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "acquireMode" TEXT,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoomManagementAssignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RoomManagementAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RoomManagementAssignment_propertyId_managementStatus_idx"
ON "RoomManagementAssignment"("propertyId", "managementStatus");

CREATE INDEX "RoomManagementAssignment_roomId_effectiveFrom_idx"
ON "RoomManagementAssignment"("roomId", "effectiveFrom");
