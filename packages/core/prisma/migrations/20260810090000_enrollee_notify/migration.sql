-- Tell the person who emailed a photo in that it reached the door. Driven off
-- Enrollee state rather than the six code paths that set status = 'PUSHED',
-- so a person who lands late via the store-and-forward retry is still told.
ALTER TABLE "Enrollee" ADD COLUMN "notifyEmail" TEXT;
ALTER TABLE "Enrollee" ADD COLUMN "notifyMessageId" TEXT;
ALTER TABLE "Enrollee" ADD COLUMN "notifiedAt" TIMESTAMP(3);
ALTER TABLE "Enrollee" ADD COLUMN "notifyAttempts" INTEGER NOT NULL DEFAULT 0;

-- Everyone already on the door predates this and must never be back-mailed.
UPDATE "Enrollee" SET "notifiedAt" = NOW() WHERE "status" = 'PUSHED';
