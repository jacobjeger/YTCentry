-- CreateTable
CREATE TABLE "TempPin" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "akuvoxUserId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TempPin_expiresAt_idx" ON "TempPin"("expiresAt");

-- CreateIndex
CREATE INDEX "TempPin_deviceId_idx" ON "TempPin"("deviceId");
