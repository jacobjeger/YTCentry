/**
 * Store-and-forward retry for enrollments whose push failed because the door
 * was unreachable.
 *
 * enrollPerson already SAVES the Enrollee (photo in object storage, status
 * PUSH_FAILED) when the synchronous push aborts — so nothing is ever lost during
 * a door/tunnel outage. This re-pushes those the moment the door is back.
 *
 * Only TRANSIENT (door-unreachable) failures are retried. A "couldn't read a
 * face" failure won't fix itself on retry — it needs a new photo — so those are
 * left for manual handling in the Directory.
 */
import { prisma } from "./db";
import { getPhotoBytes } from "./storage";
import { clientForDevice, upsertCacheRow } from "./devices";

const UNREACHABLE =
  /abort|timed out|timeout|fetch failed|ECONN|ENOTFOUND|network|socket|not responding|reset/i;

/** True when a push error was a transient door-unreachable failure (retryable). */
export function isUnreachableError(msg: string | null | undefined): boolean {
  return !!msg && UNREACHABLE.test(msg);
}

export async function retryFailedEnrollPushes(
  limit = 25,
): Promise<{ pushed: number; remaining: number }> {
  const rows = await prisma.enrolleeDevice.findMany({
    where: { status: "PUSH_FAILED" },
    include: { enrollee: true, device: true },
    take: limit,
  });
  // Only retry transient outages; skip rows with no photo or a non-transient error.
  const retryable = rows.filter(
    (r) => r.enrollee?.photoPath && (!r.lastError || isUnreachableError(r.lastError)),
  );

  let pushed = 0;
  for (const r of retryable) {
    const e = r.enrollee;
    let image: Uint8Array;
    try {
      image = await getPhotoBytes(e.photoPath!);
    } catch {
      continue; // photo missing — can't retry
    }
    try {
      await clientForDevice(r.device).pushUserWeb({
        userId: e.akuvoxUserId,
        name: e.displayName,
        image,
        scheduleRelay: e.scheduleRelay,
        group: e.groupName ?? undefined,
        pin: e.pin ?? undefined,
      });
      await prisma.enrolleeDevice.update({
        where: { id: r.id },
        data: { status: "PUSHED", pushedAt: new Date(), lastError: null },
      });
      await upsertCacheRow({
        deviceId: r.deviceId,
        userID: String(e.akuvoxUserId),
        name: e.displayName,
        hasFace: true,
        pin: e.pin ?? null,
        group: e.groupName ?? null,
      });
      // Recompute the enrollee's aggregate status across its doors.
      const stillFailed = await prisma.enrolleeDevice.count({
        where: { enrolleeId: e.id, status: "PUSH_FAILED" },
      });
      await prisma.enrollee.update({
        where: { id: e.id },
        data: {
          status: stillFailed === 0 ? "PUSHED" : "PUSH_FAILED",
          pushedAt: new Date(),
          faceUrl: "set",
          lastError: stillFailed === 0 ? null : e.lastError,
        },
      });
      pushed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.enrolleeDevice.update({
        where: { id: r.id },
        data: { lastError: msg },
      });
      // Door still unreachable — stop this cycle instead of hanging on every row.
      if (isUnreachableError(msg)) break;
    }
  }

  const remaining = await prisma.enrolleeDevice.count({
    where: { status: "PUSH_FAILED" },
  });
  return { pushed, remaining };
}
