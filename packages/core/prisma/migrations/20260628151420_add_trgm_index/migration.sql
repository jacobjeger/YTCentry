-- pg_trgm powers fuzzy roster matching for emailed-photo names (see match.ts).
-- The column is "normalizedName" (Prisma camelCase, no @map) — keep this in sync
-- with normalizeName() on every write.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS roster_normalized_name_trgm
  ON "RosterEntry" USING gin ("normalizedName" gin_trgm_ops);
