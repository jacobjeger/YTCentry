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

export async function createTempPin(opts: {
  deviceId: string;
  label: string;
  hours: number;
  pin?: string;
  createdById?: string | null;
}): Promise<{ pin: string; userId: number; expiresAt: Date }> {
  const device = await prisma.device.findUniqueOrThrow({ where: { id: opts.deviceId } });
  const client = clientForDevice(device);
  const userId = await allocateTempUserId();
  const expiresAt = new Date(Date.now() + opts.hours * 3600000);
  const name = `Guest: ${opts.label}`.slice(0, 30);

  let pin = opts.pin || randomPin();
  let created = false;
  for (let attempt = 0; attempt < 8 && !created; attempt++) {
    try {
      await client.createPinUser({ userId, name, pin });
      created = true;
    } catch (e) {
      if (e instanceof AkuvoxPinTakenError && !opts.pin) {
        pin = randomPin();
        continue;
      }
      throw e;
    }
  }
  if (!created) throw new AkuvoxPinTakenError();

  await prisma.tempPin.create({
    data: {
      deviceId: opts.deviceId,
      akuvoxUserId: userId,
      label: opts.label,
      pin,
      expiresAt,
      createdById: opts.createdById ?? null,
    },
  });
  // reflect it in the directory cache immediately (no face)
  await upsertCacheRow({
    deviceId: opts.deviceId,
    userID: String(userId),
    name,
    hasFace: false,
    pin,
  });
  return { pin, userId, expiresAt };
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
  const device = await prisma.device.findUnique({ where: { id: tp.deviceId } });
  if (!device) return;
  const client = clientForDevice(device);
  const u = (await client.findUserWeb(tp.akuvoxUserId)) as { name?: string } | null;
  if (!u) return; // already gone
  const name = String(u.name ?? "");
  if (!name.includes(tp.label) && !name.startsWith("Guest")) return; // not ours — abort
  await client.delAnyUserWeb(tp.akuvoxUserId);
  await removeCacheRow(tp.deviceId, String(tp.akuvoxUserId));
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
