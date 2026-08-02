/**
 * Live door reachability, for the dashboard's door-status panel.
 *
 * The probe is a /web login: it proves the Cloudflare tunnel is up, the E16C
 * answered, AND the stored web password still works — which is exactly the set
 * of things a face push needs. A cheaper TCP/HTTP poke would call a door
 * "online" while pushes were failing on bad credentials.
 *
 * This is deliberately NOT persisted. "Currently connected" is a live question,
 * and a stored flag is only ever as fresh as the last writer. Callers should
 * probe on demand with a short timeout.
 */
import { prisma } from "./db";
import { clientForDevice } from "./devices";
import { isUnreachableError } from "./retry";
import type { Device } from "@prisma/client";

/**
 * - `online`   the door answered and accepted our login
 * - `offline`  transport failure — tunnel or device is down. Pushes will queue
 *              and drain on their own, so this needs no human action.
 * - `problem`  the door (or our config) said no: bad password, IP allowlist,
 *              missing secret. Waiting will NOT fix these — they need a human.
 */
export type DoorState = "online" | "offline" | "problem";

export interface DoorHealth {
  id: string;
  key: string;
  name: string;
  state: DoorState;
  /** null when online; otherwise why the probe failed */
  error: string | null;
  /** how long the probe took, ms */
  ms: number;
  /** enrollments queued for this door, waiting for it to come back */
  waiting: number;
}

/** Local misconfiguration — never a door outage, so never "offline". */
const CONFIG_ERROR = /must be set|not configured|decrypt/i;

/** Probe one door. Never throws. */
export async function checkDoor(
  d: Device,
  timeoutMs = 6000,
): Promise<Pick<DoorHealth, "state" | "error" | "ms">> {
  const started = Date.now();
  try {
    await clientForDevice(d, timeoutMs).webLogin();
    return { state: "online", error: null, ms: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Only a transport-level failure is a genuine outage. A rejected login or a
    // missing secret is a "problem" — it will still be broken in an hour, and
    // the store-and-forward retry can't clear it.
    const state: DoorState =
      !CONFIG_ERROR.test(msg) && isUnreachableError(msg) ? "offline" : "problem";
    return { state, error: msg, ms: Date.now() - started };
  }
}

/**
 * Probe every active door in parallel and attach the number of enrollments
 * waiting on each. Never throws — a door that can't be reached comes back with
 * state "offline" rather than failing the whole panel.
 */
export async function getDoorHealth(timeoutMs = 6000): Promise<DoorHealth[]> {
  const devices = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return Promise.all(
    devices.map(async (d) => {
      const [probe, waiting] = await Promise.all([
        checkDoor(d, timeoutMs),
        prisma.enrolleeDevice.count({ where: { deviceId: d.id, status: "PUSH_FAILED" } }),
      ]);
      return { id: d.id, key: d.key, name: d.name, waiting, ...probe };
    }),
  );
}

/**
 * Enrollments saved but not yet on any door. Counts the per-door backlog plus
 * "orphans" — people with a photo and no per-door row at all, which happens if
 * they were added before any door existed. Both are picked up by the pusher's
 * retry loop; this is what the dashboard promises will land automatically.
 */
export async function countWaitingToSync(): Promise<number> {
  const [perDoor, orphans] = await Promise.all([
    prisma.enrolleeDevice.count({ where: { status: "PUSH_FAILED" } }),
    prisma.enrollee.count({
      where: {
        status: { in: ["PUSH_FAILED", "PENDING_PUSH"] },
        photoPath: { not: null },
        devices: { none: {} },
      },
    }),
  ]);
  return perDoor + orphans;
}
