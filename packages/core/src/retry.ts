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

/**
 * HTTP statuses that mean "the door isn't reachable right now", not "the door
 * said no". The door sits behind a Cloudflare tunnel, so an outage usually
 * surfaces as a gateway status from Cloudflare rather than a socket error:
 * 502/503/504 from the edge, and 520-527/530 when the tunnel itself is down
 * (530 is the Argo "origin unreachable" case). 408 is a request timeout.
 *
 * Deliberately excluded: 401/403 (bad credentials or IP allowlist) and 4xx in
 * general — retrying those forever would never succeed and would mask a real
 * misconfiguration.
 */
function isTransientHttpStatus(code: number): boolean {
  return code === 408 || code === 502 || code === 503 || code === 504 || (code >= 520 && code <= 530);
}

/** True when a push error was a transient door-unreachable failure (retryable). */
export function isUnreachableError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  if (UNREACHABLE.test(msg)) return true;
  // AkuvoxClient reports these as e.g. "HTTP 502 from /web."
  const m = /\bHTTP (\d{3})\b/i.exec(msg);
  return !!m && isTransientHttpStatus(Number(m[1]));
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

  pushed += await adoptOrphanEnrollees();

  const remaining = await prisma.enrolleeDevice.count({
    where: { status: "PUSH_FAILED" },
  });
  return { pushed, remaining };
}

/**
 * Catch enrollments that have NO per-door row at all, which the query above
 * can never see. Two ways to get here: the person was added while no door was
 * configured (pushToDoors bails before creating any EnrolleeDevice), or the
 * process died between creating the Enrollee and pushing. Either way the photo
 * is saved and the person is real — they just need a door row to be retried.
 *
 * Only considers enrollees older than SETTLE_MS so we never race an enrollment
 * that is still mid-push in the dashboard.
 */
const SETTLE_MS = 5 * 60 * 1000;

async function adoptOrphanEnrollees(limit = 25): Promise<number> {
  const devices = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  if (devices.length === 0) return 0; // nothing to push to yet

  const orphans = await prisma.enrollee.findMany({
    where: {
      status: { in: ["PUSH_FAILED", "PENDING_PUSH"] },
      photoPath: { not: null },
      devices: { none: {} },
      createdAt: { lt: new Date(Date.now() - SETTLE_MS) },
    },
    take: limit,
  });

  let pushed = 0;
  for (const e of orphans) {
    let image: Uint8Array;
    try {
      image = await getPhotoBytes(e.photoPath!);
    } catch {
      continue; // photo missing — can't push
    }
    let allOk = true;
    for (const d of devices) {
      try {
        await clientForDevice(d).pushUserWeb({
          userId: e.akuvoxUserId,
          name: e.displayName,
          image,
          scheduleRelay: e.scheduleRelay,
          group: e.groupName ?? undefined,
          pin: e.pin ?? undefined,
        });
        await prisma.enrolleeDevice.create({
          data: { enrolleeId: e.id, deviceId: d.id, status: "PUSHED", pushedAt: new Date() },
        });
        await upsertCacheRow({
          deviceId: d.id,
          userID: String(e.akuvoxUserId),
          name: e.displayName,
          hasFace: true,
          pin: e.pin ?? null,
          group: e.groupName ?? null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allOk = false;
        // Record the row so the normal retry path owns it from here on.
        await prisma.enrolleeDevice.create({
          data: { enrolleeId: e.id, deviceId: d.id, status: "PUSH_FAILED", lastError: msg },
        });
        if (isUnreachableError(msg)) break; // door is down — stop hammering it
      }
    }
    await prisma.enrollee.update({
      where: { id: e.id },
      data: allOk
        ? { status: "PUSHED", pushedAt: new Date(), faceUrl: "set", lastError: null }
        : { status: "PUSH_FAILED" },
    });
    if (allOk) pushed++;
  }
  return pushed;
}
