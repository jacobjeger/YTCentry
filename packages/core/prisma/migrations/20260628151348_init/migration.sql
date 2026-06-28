-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "EnrolleeSource" AS ENUM ('EMAIL', 'MANUAL', 'ROSTER');

-- CreateEnum
CREATE TYPE "EnrolleeStatus" AS ENUM ('DRAFT', 'PENDING_PUSH', 'PUSHED', 'PUSH_FAILED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('RECEIVED', 'NEEDS_MATCH', 'MATCHED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PushAction" AS ENUM ('ADD', 'UPDATE_FACE', 'DELETE');

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('QUEUED', 'CLAIMED', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollee" (
    "id" TEXT NOT NULL,
    "akuvoxUserId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "studentId" TEXT,
    "shiur" TEXT,
    "phone" TEXT,
    "source" "EnrolleeSource" NOT NULL,
    "photoPath" TEXT,
    "faceUrl" TEXT,
    "scheduleRelay" TEXT NOT NULL DEFAULT '1001-1',
    "status" "EnrolleeStatus" NOT NULL DEFAULT 'DRAFT',
    "lastError" TEXT,
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Enrollee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shiur" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_PHOTO',
    "enrolleeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoSubmission" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subjectRaw" TEXT,
    "parsedName" TEXT,
    "imagePath" TEXT NOT NULL,
    "faceValid" BOOLEAN,
    "faceNote" TEXT,
    "matchCandidates" JSONB NOT NULL DEFAULT '[]',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rosterEntryId" TEXT,

    CONSTRAINT "PhotoSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushJob" (
    "id" TEXT NOT NULL,
    "enrolleeId" TEXT NOT NULL,
    "action" "PushAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PushStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollee_akuvoxUserId_key" ON "Enrollee"("akuvoxUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollee_studentId_key" ON "Enrollee"("studentId");

-- CreateIndex
CREATE INDEX "Enrollee_status_idx" ON "Enrollee"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_studentId_key" ON "RosterEntry"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_enrolleeId_key" ON "RosterEntry"("enrolleeId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoSubmission_gmailMessageId_key" ON "PhotoSubmission"("gmailMessageId");

-- CreateIndex
CREATE INDEX "PhotoSubmission_status_idx" ON "PhotoSubmission"("status");

-- CreateIndex
CREATE INDEX "PushJob_status_idx" ON "PushJob"("status");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Enrollee" ADD CONSTRAINT "Enrollee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_enrolleeId_fkey" FOREIGN KEY ("enrolleeId") REFERENCES "Enrollee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoSubmission" ADD CONSTRAINT "PhotoSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoSubmission" ADD CONSTRAINT "PhotoSubmission_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "RosterEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushJob" ADD CONSTRAINT "PushJob_enrolleeId_fkey" FOREIGN KEY ("enrolleeId") REFERENCES "Enrollee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
