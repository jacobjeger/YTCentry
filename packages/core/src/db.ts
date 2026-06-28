/**
 * Shared PrismaClient singleton.
 *
 * Next.js dev hot-reloads modules, which would otherwise open a new pool on
 * every reload and exhaust Postgres connections. We stash the client on
 * globalThis so a single instance is reused across reloads. The agent and the
 * ingest worker are long-lived single processes, so the guard is harmless there.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { Prisma } from "@prisma/client";
export type {
  StaffUser,
  Enrollee,
  RosterEntry,
  PhotoSubmission,
  PushJob,
  AuditLog,
  Role,
  EnrolleeSource,
  EnrolleeStatus,
  SubmissionStatus,
  PushAction,
  PushStatus,
} from "@prisma/client";
