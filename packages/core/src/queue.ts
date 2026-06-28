/**
 * PushJob queue operations — the cloud↔agent contract.
 *
 * The on-site agent calls claim() to lease QUEUED jobs (oldest first), executes
 * them against the E16C, then calls complete() with the result. Enrollee status
 * is recomputed from its jobs: any FAILED → PUSH_FAILED; all DONE → PUSHED.
 *
 * Used by the dashboard's /api/agent/* route handlers. Kept in core so the
 * types/logic are shared and testable.
 */
import { prisma } from "./db";
import { signedPhotoUrl } from "./storage";

export interface ClaimedJob {
  id: string;
  action: "ADD" | "UPDATE_FACE" | "DELETE";
  enrolleeId: string;
  akuvoxUserId: number;
  name: string;
  scheduleRelay: string;
  attempts: number;
  /** signed URL to fetch the face image (UPDATE_FACE only) */
  photoUrl?: string;
}

/** Lease up to `limit` queued jobs. Marks them CLAIMED with a timestamp. */
export async function claimJobs(limit = 5): Promise<ClaimedJob[]> {
  const jobs = await prisma.$transaction(async (tx) => {
    const queued = await tx.pushJob.findMany({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: { enrollee: true },
    });
    if (queued.length === 0) return [];
    await tx.pushJob.updateMany({
      where: { id: { in: queued.map((j) => j.id) } },
      data: { status: "CLAIMED", claimedAt: new Date(), attempts: { increment: 1 } },
    });
    return queued;
  });

  const out: ClaimedJob[] = [];
  for (const j of jobs) {
    const payload = (j.payload ?? {}) as Record<string, unknown>;
    const photoPath = (payload.photoPath as string | undefined) ?? j.enrollee.photoPath ?? undefined;
    out.push({
      id: j.id,
      action: j.action,
      enrolleeId: j.enrolleeId,
      akuvoxUserId: j.enrollee.akuvoxUserId,
      name: j.enrollee.displayName,
      scheduleRelay: j.enrollee.scheduleRelay,
      attempts: j.attempts + 1,
      photoUrl:
        j.action === "UPDATE_FACE" && photoPath
          ? await signedPhotoUrl(photoPath, 600)
          : undefined,
    });
  }
  return out;
}

export interface CompleteInput {
  jobId: string;
  ok: boolean;
  error?: string | null;
  /** device FaceUrl after a successful UPDATE_FACE */
  faceUrl?: string | null;
}

/** Mark a job DONE/FAILED and recompute the enrollee's status. */
export async function completeJob(input: CompleteInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const job = await tx.pushJob.update({
      where: { id: input.jobId },
      data: {
        status: input.ok ? "DONE" : "FAILED",
        lastError: input.ok ? null : (input.error ?? "unknown error"),
        completedAt: new Date(),
      },
    });

    if (input.faceUrl) {
      await tx.enrollee.update({
        where: { id: job.enrolleeId },
        data: { faceUrl: input.faceUrl },
      });
    }

    // A successful DELETE removes the person from the door.
    if (job.action === "DELETE" && input.ok) {
      await tx.enrollee.update({
        where: { id: job.enrolleeId },
        data: { status: "REMOVED", lastError: null },
      });
      return;
    }

    const jobs = await tx.pushJob.findMany({
      where: { enrolleeId: job.enrolleeId },
    });
    const anyFailed = jobs.some((j) => j.status === "FAILED");
    const allDone = jobs.every((j) => j.status === "DONE");

    if (anyFailed) {
      await tx.enrollee.update({
        where: { id: job.enrolleeId },
        data: {
          status: "PUSH_FAILED",
          lastError: input.error ?? "A push job failed.",
        },
      });
    } else if (allDone) {
      await tx.enrollee.update({
        where: { id: job.enrolleeId },
        data: { status: "PUSHED", pushedAt: new Date(), lastError: null },
      });
    }
  });
}
