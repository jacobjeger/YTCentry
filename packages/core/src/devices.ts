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

/**
 * Pull a door's full directory + groups and replace its cache. This is the ONLY
 * routine that fans out across the device — everything else reads the cache, so
 * the small E16C isn't overloaded by normal use.
 */
export async function syncDeviceDirectory(device: Device): Promise<number> {
  const client = clientForDevice(device);
  const users = await client.getAllUsersViaWeb();
  let groups: string[] = [];
  try {
    groups = await client.getGroupsViaWeb();
  } catch {
    /* keep prior cached groups on a transient failure */
  }
  let schedules: { id: number; scheduleID: number; name: string }[] = [];
  try {
    schedules = await client.getSchedulesViaWeb();
  } catch {
    /* keep prior cached schedules on a transient failure */
  }
  await prisma.$transaction([
    prisma.deviceUserCache.deleteMany({ where: { deviceId: device.id } }),
    prisma.deviceUserCache.createMany({
      data: users.map((u) => ({
        deviceId: device.id,
        userID: u.userID,
        name: u.name,
        hasFace: Number(u.faceID ?? 0) > 0,
        pin: (u as Record<string, unknown>).privatePIN
          ? String((u as Record<string, unknown>).privatePIN)
          : null,
        groupName: u.Group ? String(u.Group).trim() : null,
      })),
    }),
    ...(groups.length
      ? [prisma.device.update({ where: { id: device.id }, data: { groupsJson: groups } })]
      : []),
    ...(schedules.length
      ? [prisma.device.update({ where: { id: device.id }, data: { schedulesJson: schedules } })]
      : []),
  ]);
  return users.length;
}

export interface CachedSchedule {
  id: number;
  scheduleID: number;
  name: string;
}

/** Cached schedules for a door (no device hit). */
export async function getCachedSchedules(deviceId: string): Promise<CachedSchedule[]> {
  const d = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { schedulesJson: true },
  });
  return Array.isArray(d?.schedulesJson) ? (d!.schedulesJson as unknown as CachedSchedule[]) : [];
}

/** Refresh only the cached schedules for a door (used after create/delete). */
export async function refreshDeviceSchedules(device: Device): Promise<CachedSchedule[]> {
  const schedules = await clientForDevice(device).getSchedulesViaWeb();
  await prisma.device.update({ where: { id: device.id }, data: { schedulesJson: schedules } });
  return schedules;
}

/** Cached group names for a door (no device hit). */
export async function getCachedGroups(deviceId: string): Promise<string[]> {
  const d = await prisma.device.findUnique({ where: { id: deviceId }, select: { groupsJson: true } });
  return Array.isArray(d?.groupsJson) ? (d!.groupsJson as string[]) : [];
}

/** Cached name/PIN/group for one person (no device hit). */
export async function getCachedPerson(
  deviceId: string,
  userID: string,
): Promise<{ name: string; pin: string; group: string } | null> {
  const r = await prisma.deviceUserCache.findUnique({
    where: { deviceId_userID: { deviceId, userID } },
    select: { name: true, pin: true, groupName: true },
  });
  if (!r) return null;
  return { name: r.name, pin: r.pin ?? "", group: r.groupName ?? "" };
}

/** Immediately reflect a write in the cache (so the directory updates instantly,
 *  not after the next periodic sync). */
export async function upsertCacheRow(opts: {
  deviceId: string;
  userID: string;
  name: string;
  hasFace: boolean;
  pin?: string | null;
  group?: string | null;
}): Promise<void> {
  await prisma.deviceUserCache.upsert({
    where: { deviceId_userID: { deviceId: opts.deviceId, userID: opts.userID } },
    create: {
      deviceId: opts.deviceId, userID: opts.userID, name: opts.name,
      hasFace: opts.hasFace, pin: opts.pin ?? null, groupName: opts.group ?? null,
    },
    update: {
      name: opts.name, hasFace: opts.hasFace,
      pin: opts.pin ?? null, groupName: opts.group ?? null,
    },
  });
}

export async function removeCacheRow(deviceId: string, userID: string): Promise<void> {
  await prisma.deviceUserCache.deleteMany({ where: { deviceId, userID } });
}

export interface CachedDirectory {
  rows: { userID: string; name: string; hasFace: boolean; pin: string | null; group: string | null }[];
  syncedAt: Date | null;
}

/** Read a door's cached directory (instant). */
export async function getCachedDirectory(deviceId: string): Promise<CachedDirectory> {
  const rows = await prisma.deviceUserCache.findMany({
    where: { deviceId },
    select: { userID: true, name: true, hasFace: true, pin: true, groupName: true, syncedAt: true },
  });
  const syncedAt = rows.reduce<Date | null>(
    (m, r) => (!m || r.syncedAt > m ? r.syncedAt : m),
    null,
  );
  return {
    rows: rows.map(({ userID, name, hasFace, pin, groupName }) => ({
      userID, name, hasFace, pin, group: groupName,
    })),
    syncedAt,
  };
}

export type { Device };
