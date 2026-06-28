-- CreateTable
CREATE TABLE "DeviceUserCache" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasFace" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceUserCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceUserCache_deviceId_idx" ON "DeviceUserCache"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUserCache_deviceId_userID_key" ON "DeviceUserCache"("deviceId", "userID");
