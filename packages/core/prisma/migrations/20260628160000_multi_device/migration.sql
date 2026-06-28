

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "webUser" TEXT NOT NULL DEFAULT 'admin',
    "webPasswordEnc" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowEmail" BOOLEAN NOT NULL DEFAULT false,
    "pollSnapshots" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrolleeDevice" (
    "id" TEXT NOT NULL,
    "enrolleeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "EnrolleeStatus" NOT NULL DEFAULT 'PENDING_PUSH',
    "lastError" TEXT,
    "pushedAt" TIMESTAMP(3),

    CONSTRAINT "EnrolleeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_key_key" ON "Device"("key");

-- CreateIndex
CREATE INDEX "EnrolleeDevice_deviceId_idx" ON "EnrolleeDevice"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrolleeDevice_enrolleeId_deviceId_key" ON "EnrolleeDevice"("enrolleeId", "deviceId");

-- AddForeignKey
ALTER TABLE "EnrolleeDevice" ADD CONSTRAINT "EnrolleeDevice_enrolleeId_fkey" FOREIGN KEY ("enrolleeId") REFERENCES "Enrollee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrolleeDevice" ADD CONSTRAINT "EnrolleeDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

