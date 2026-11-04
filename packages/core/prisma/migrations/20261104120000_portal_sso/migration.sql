-- YTC central portal SSO: portal-managed fields on StaffUser + one-time token ledger.
ALTER TABLE "StaffUser" ADD COLUMN "portalManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StaffUser" ADD COLUMN "portalSub" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "portalName" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "portalIsAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StaffUser" ADD COLUMN "portalPerms" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "StaffUser" ADD COLUMN "portalScope" JSONB;
ALTER TABLE "StaffUser" ADD COLUMN "portalSyncedAt" TIMESTAMP(3);

CREATE TABLE "PortalJti" (
    "jti" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalJti_pkey" PRIMARY KEY ("jti")
);
CREATE INDEX "PortalJti_usedAt_idx" ON "PortalJti"("usedAt");
