/**
 * Door (Device) registry helpers. A door's web password is stored encrypted;
 * clientForDevice() decrypts it and builds an AkuvoxClient pointed at that door.
 */
import { prisma } from "./db";
import { AkuvoxClient } from "./akuvox";
import { decryptSecret } from "./crypto";
import type { Device } from "@prisma/client";

export async function getActiveDevices(): Promise<Device[]> {
  return prisma.device.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

export async function getAllDevices(): Promise<Device[]> {
  return prisma.device.findMany({ orderBy: { sortOrder: "asc" } });
}

/** Build an AkuvoxClient for one door. CF Access headers come from env (the
 *  tunnels share the same Access setup, if any). */
export function clientForDevice(d: Device): AkuvoxClient {
  return new AkuvoxClient({
    baseUrl: d.baseUrl,
    apiUser: "admin",
    apiPassword: "",
    webUser: d.webUser,
    webPassword: decryptSecret(d.webPasswordEnc),
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID || undefined,
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || undefined,
    timeoutMs: 20000,
  });
}

/** Pull a door's full directory and replace its cache (fast: 2 queries). */
export async function syncDeviceDirectory(device: Device): Promise<number> {
  const users = await clientForDevice(device).getAllUsersViaWeb();
  await prisma.$transaction([
    prisma.deviceUserCache.deleteMany({ where: { deviceId: device.id } }),
    prisma.deviceUserCache.createMany({
      data: users.map((u) => ({
        deviceId: device.id,
        userID: u.userID,
        name: u.name,
        hasFace: Number(u.faceID ?? 0) > 0,
      })),
    }),
  ]);
  return users.length;
}

export interface CachedDirectory {
  rows: { userID: string; name: string; hasFace: boolean }[];
  syncedAt: Date | null;
}

/** Read a door's cached directory (instant). */
export async function getCachedDirectory(deviceId: string): Promise<CachedDirectory> {
  const rows = await prisma.deviceUserCache.findMany({
    where: { deviceId },
    select: { userID: true, name: true, hasFace: true, syncedAt: true },
  });
  const syncedAt = rows.reduce<Date | null>(
    (m, r) => (!m || r.syncedAt > m ? r.syncedAt : m),
    null,
  );
  return { rows: rows.map(({ userID, name, hasFace }) => ({ userID, name, hasFace })), syncedAt };
}

export type { Device };
