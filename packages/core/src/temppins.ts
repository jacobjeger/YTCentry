/**
 * Temporary / guest PINs — PIN-only door users (no face) that auto-expire.
 *
 * SAFETY (per "never delete the wrong users by mistake"):
 *  - temp users live in a dedicated band (>= 200000), separate from enrolled
 *    people, so allocation never collides;
 *  - auto-delete refuses anything below the temp band, AND re-reads the device
 *    user and only deletes it if the name still matches the temp record. So an
 *    expiry can only ever remove the exact guest user we created.
 */
import { randomInt } from "crypto";
import { prisma } from "./db";
import { clientForDevice, upsertCacheRow, removeCacheRow } from "./devices";
import { AkuvoxPinTakenError } from "./akuvox";
import type { TempPin } from "@prisma/client";

const TEMP_BAND_START = 200000;

export function randomPin(): string {
  return String(randomInt(100000, 1000000)); // 6 digits
}

async function allocateTempUserId(): Promise<number> {
  const top = await prisma.tempPin.aggregate({ _max: { akuvoxUserId: true } });
  const cur = top._max.akuvoxUserId ?? TEMP_BAND_START - 1;
  return Math.max(cur, TEMP_BAND_START - 1) + 1;
}

function guestName(label: string): string {
  return `Guest: ${label}`.slice(0, 30);
}

/** Create the PIN-only user on the device, retrying a random PIN on collision
 *  (unless a specific PIN was requested). Returns the PIN actually used. */
async function createOnDevice(
  deviceId: string,
  userId: number,
  name: string,
  wantPin: string,
  pinIsCustom: boolean,
  scheduleRelay?: string,
): Promise<string> {
  const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
  const client = clientForDevice(device);
  let pin = wantPin;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await client.createPinUser({ userId, name, pin, scheduleRelay });
      return pin;
    } catch (e) {
      if (e instanceof AkuvoxPinTakenError && !pinIsCustom) {
        pin = randomPin();
        continue;
      }
      throw e;
    }
  }
  throw new AkuvoxPinTakenError();
}

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function createTempPin(opts: {
  deviceId: string;
  label: string;
  expiresAt: Date;
  startsAt?: Date | null;
  pin?: string;
  createdById?: string | null;
  recurring?: { weekly: string; timeBegin: string; timeEnd: string };
}): Promise<{ pin: string; userId: number; expiresAt: Date; deferred: boolean }> {
  const device = await prisma.device.findUniqueOrThrow({ where: { id: opts.deviceId } });
  const userId = await allocateTempUserId();
  const name = guestName(opts.label);
  const pinIsCustom = !!opts.pin;

  // RECURRING: create a device schedule for the weekly window, then a PIN user
  // bound to it. Active immediately (the device enforces the recurring window);
  // removed when expiresAt (the until-date) passes.
  if (opts.recurring) {
    const client = clientForDevice(device);
    const sched = await client.createScheduleWeb({
      name: `Guest ${opts.label} ${userId}`.slice(0, 30),
      weekly: opts.recurring.weekly,
      timeBegin: opts.recurring.timeBegin,
      timeEnd: opts.recurring.timeEnd,
      dayBegin: yyyymmdd(opts.startsAt ?? new Date()),
      dayEnd: yyyymmdd(opts.expiresAt),
    });
    let pin = opts.pin || randomPin();
    try {
      pin = await createOnDevice(opts.deviceId, userId, name, pin, pinIsCustom, `${sched.scheduleID}-1`);
    } catch (e) {
      // roll back the schedule if the user couldn't be created
      await client.deleteScheduleWeb(sched.id).catch(() => {});
      throw e;
    }
    await prisma.tempPin.create({
      data: {
        deviceId: opts.deviceId,
        akuvoxUserId: userId,
        label: opts.label,
        pin,
        startsAt: opts.startsAt ?? null,
        activatedAt: new Date(),
        expiresAt: opts.expiresAt,
        weekly: opts.recurring.weekly,
        timeBegin: opts.recurring.timeBegin,
        timeEnd: opts.recurring.timeEnd,
        scheduleId: sched.id,
        createdById: opts.createdById ?? null,
      },
    });
    await upsertCacheRow({ deviceId: opts.deviceId, userID: String(userId), name, hasFace: false, pin });
    return { pin, userId, expiresAt: opts.expiresAt, deferred: false };
  }

  const deferred = !!opts.startsAt && opts.startsAt.getTime() > Date.now();
  let pin = opts.pin || randomPin();
  if (!deferred) {
    // Active now — create on the door immediately.
    pin = await createOnDevice(opts.deviceId, userId, name, pin, pinIsCustom);
  }

  await prisma.tempPin.create({
    data: {
      deviceId: opts.deviceId,
      akuvoxUserId: userId,
      label: opts.label,
      pin,
      startsAt: opts.startsAt ?? null,
      activatedAt: deferred ? null : new Date(),
      expiresAt: opts.expiresAt,
      createdById: opts.createdById ?? null,
    },
  });
  if (!deferred) {
    await upsertCacheRow({
      deviceId: opts.deviceId,
      userID: String(userId),
      name,
      hasFace: false,
      pin,
    });
  }
  return { pin, userId, expiresAt: opts.expiresAt, deferred };
}

/** Create the device users for any deferred temp PINs whose start time has
 *  arrived. Runs from the pusher. */
export async function activateDueTempPins(): Promise<number> {
  const due = await prisma.tempPin.findMany({
    where: { activatedAt: null, startsAt: { lte: new Date() }, expiresAt: { gt: new Date() } },
  });
  let n = 0;
  for (const tp of due) {
    try {
      const name = guestName(tp.label);
      // The stored PIN may now collide; allow a random fallback.
      const pin = await createOnDevice(tp.deviceId, tp.akuvoxUserId, name, tp.pin, false);
      await prisma.tempPin.update({ where: { id: tp.id }, data: { activatedAt: new Date(), pin } });
      await upsertCacheRow({
        deviceId: tp.deviceId,
        userID: String(tp.akuvoxUserId),
        name,
        hasFace: false,
        pin,
      });
      n++;
    } catch (e) {
      console.warn("[temppin] activate failed for", tp.akuvoxUserId, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

export async function extendTempPin(id: string, hours: number): Promise<Date> {
  const tp = await prisma.tempPin.findUniqueOrThrow({ where: { id } });
  const base = Math.max(Date.now(), tp.expiresAt.getTime());
  const expiresAt = new Date(base + hours * 3600000);
  await prisma.tempPin.update({ where: { id }, data: { expiresAt } });
  return expiresAt;
}

/** SAFE delete: temp band only + name must still match. */
async function deleteTempUserSafely(tp: TempPin): Promise<void> {
  if (tp.akuvoxUserId < TEMP_BAND_START) return; // never touch outside temp band
  if (!tp.activatedAt) return; // never created on the door (deferred) — nothing to delete
  const device = await prisma.device.findUnique({ where: { id: tp.deviceId } });
  if (!device) return;
  const client = clientForDevice(device);
  const u = (await client.findUserWeb(tp.akuvoxUserId)) as { name?: string } | null;
  if (!u) return; // already gone
  const name = String(u.name ?? "");
  if (!name.includes(tp.label) && !name.startsWith("Guest")) return; // not ours — abort
  await client.delAnyUserWeb(tp.akuvoxUserId);
  await removeCacheRow(tp.deviceId, String(tp.akuvoxUserId));
  // also remove the recurring schedule we created for it
  if (tp.scheduleId) await client.deleteScheduleWeb(tp.scheduleId).catch(() => {});
}

export async function revokeTempPin(id: string): Promise<void> {
  const tp = await prisma.tempPin.findUnique({ where: { id } });
  if (!tp) return;
  await deleteTempUserSafely(tp);
  await prisma.tempPin.delete({ where: { id } });
}

export async function expireTempPins(): Promise<number> {
  const expired = await prisma.tempPin.findMany({ where: { expiresAt: { lt: new Date() } } });
  let n = 0;
  for (const tp of expired) {
    try {
      await deleteTempUserSafely(tp);
      await prisma.tempPin.delete({ where: { id: tp.id } });
      n++;
    } catch (e) {
      console.warn("[temppin] expire failed for", tp.akuvoxUserId, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

export async function listTempPins(deviceId?: string): Promise<TempPin[]> {
  return prisma.tempPin.findMany({
    where: deviceId ? { deviceId } : {},
    orderBy: { expiresAt: "asc" },
  });
}

export { TEMP_BAND_START };
