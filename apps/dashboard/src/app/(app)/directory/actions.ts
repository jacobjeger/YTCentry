"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  validateFace,
  putPhoto,
  audit,
  ID_BAND_START,
  getCachedDirectory,
  getCachedGroups,
  getCachedPerson,
  syncDeviceDirectory,
  upsertCacheRow,
  removeCacheRow,
} from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { photoKey } from "@/lib/enroll";
import { deviceClientById, describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export interface DoorOption { id: string; name: string }

/** The doors to show in the Directory's door selector. */
export async function listDoors(): Promise<DoorOption[]> {
  await requireUser();
  const devices = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return devices;
}

export type DirState = { error?: string; ok?: string };

export interface DirRow {
  userID: string;
  name: string;
  hasFaceOnDevice: boolean;
  managed: boolean; // this system added/owns it
  legacy: boolean; // pre-existing (UserID < band)
  enrolleeId?: string;
  status?: string; // our Enrollee status when managed
  studentId?: string | null;
  shiur?: string | null;
}

/** One unified view: EVERYONE on the door (live), merged with our records. */
async function resolveDeviceId(deviceId?: string): Promise<string | null> {
  if (deviceId) return deviceId;
  const first = await prisma.device.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

/** Read the door directory from the local CACHE (instant). Falls back to a live
 *  sync the first time a door has no cache yet. */
export async function loadFullDirectory(deviceId?: string): Promise<{
  rows?: DirRow[];
  total?: number;
  syncedAt?: string | null;
  error?: string;
}> {
  await requireUser();
  try {
    const id = await resolveDeviceId(deviceId);
    if (!id) return { error: "No door configured. Add one in Settings." };

    let cached = await getCachedDirectory(id);
    if (cached.rows.length === 0) {
      // first load for this door — populate the cache live, then read it
      const device = await prisma.device.findUnique({ where: { id } });
      if (device) await syncDeviceDirectory(device);
      cached = await getCachedDirectory(id);
    }

    const enrollees = await prisma.enrollee.findMany();
    const byId = new Map(enrollees.map((e) => [String(e.akuvoxUserId), e]));
    const rows: DirRow[] = cached.rows
      .map((u) => {
        const e = byId.get(u.userID);
        return {
          userID: u.userID,
          name: u.name,
          hasFaceOnDevice: u.hasFace,
          managed: !!e,
          legacy: Number(u.userID) < ID_BAND_START,
          enrolleeId: e?.id,
          status: e?.status,
          studentId: e?.studentId ?? null,
          shiur: e?.shiur ?? null,
        };
      })
      .sort((a, b) => Number(a.userID) - Number(b.userID));
    return { rows, total: rows.length, syncedAt: cached.syncedAt?.toISOString() ?? null };
  } catch (e) {
    return { error: describeDeviceError(e, "directory load") };
  }
}

/** Force a fresh pull from the door into the cache (the Refresh button). */
export async function refreshDirectory(deviceId?: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    const id = await resolveDeviceId(deviceId);
    if (!id) return { error: "No door configured." };
    const device = await prisma.device.findUnique({ where: { id } });
    if (device) await syncDeviceDirectory(device);
    return {};
  } catch (e) {
    return { error: describeDeviceError(e, "directory refresh") };
  }
}

export interface PersonDetail {
  name: string;
  pin: string;
  group: string;
  groups: string[];
  error?: string;
}

/** Fetch a person's current name/PIN/group from the door, plus the group list. */
export async function getPersonDetail(
  userID: string,
  deviceId?: string,
): Promise<PersonDetail> {
  await requireUser();
  const id = await resolveDeviceId(deviceId);
  if (!id) return { name: "", pin: "", group: "", groups: [], error: "No door." };
  // Read the CACHE — no device hit when opening the edit modal.
  const [person, groups] = await Promise.all([
    getCachedPerson(id, userID),
    getCachedGroups(id),
  ]);
  return {
    name: person?.name ?? "",
    pin: person?.pin ?? "",
    group: person?.group ?? "",
    groups,
  };
}

/** Save edits (name/PIN/group) to an existing person on the door — face is kept. */
export async function savePersonEdit(
  _prev: DirState,
  formData: FormData,
): Promise<DirState> {
  const user = await requireUser();
  const userID = String(formData.get("userID") ?? "").trim();
  const deviceId = String(formData.get("deviceId") ?? "") || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const group = String(formData.get("group") ?? "").trim();
  if (!userID) return { error: "Missing user." };

  try {
    const client = await deviceClientById(deviceId);
    await client.editUserWeb(userID, {
      name: name || undefined,
      pin, // empty string intentionally clears the PIN
      group: group || undefined,
    });
  } catch (e) {
    return { error: describeDeviceError(e, "edit person") };
  }

  const n = Number(userID);
  if (n >= ID_BAND_START) {
    await prisma.enrollee.updateMany({
      where: { akuvoxUserId: n },
      data: {
        ...(name ? { displayName: name } : {}),
        pin: pin || null,
        groupName: group || null,
      },
    });
  }
  // Update the cache immediately so the directory reflects the edit at once.
  const did = await resolveDeviceId(deviceId);
  if (did) {
    await prisma.deviceUserCache.updateMany({
      where: { deviceId: did, userID },
      data: { ...(name ? { name } : {}), pin: pin || null, groupName: group || null },
    });
  }
  await audit({
    actorId: user.id,
    action: "enrollee.update",
    targetType: "DeviceUser",
    targetId: userID,
    meta: { pinSet: !!pin, group },
  });
  revalidatePath("/directory");
  return { ok: "saved" };
}

/** Delete ANY user from the door (admin device management; confirmed in the UI). */
export async function deleteFromDoor(formData: FormData) {
  const user = await requireUser();
  const userID = String(formData.get("userID") ?? "").trim();
  const deviceId = String(formData.get("deviceId") ?? "") || undefined;
  if (!userID) return;
  const client = await deviceClientById(deviceId);
  await client.delAnyUserWeb(userID);

  // Drop it from the cache at once so the directory updates immediately.
  const did = await resolveDeviceId(deviceId);
  if (did) await removeCacheRow(did, userID);

  const n = Number(userID);
  if (n >= ID_BAND_START) {
    await prisma.enrollee.updateMany({
      where: { akuvoxUserId: n },
      data: { status: "REMOVED" },
    });
  }
  await audit({
    actorId: user.id,
    action: "enrollee.remove",
    targetType: "DeviceUser",
    targetId: userID,
    meta: { legacy: n < ID_BAND_START },
  });
}

/** Guard: this system only ever touches its own automation band (>=100000). */
async function loadManaged(id: string) {
  const e = await prisma.enrollee.findUnique({ where: { id } });
  if (!e || e.akuvoxUserId < ID_BAND_START) return null;
  return e;
}

function snapshot(e: {
  akuvoxUserId: number;
  displayName: string;
  scheduleRelay: string;
  photoPath: string | null;
}) {
  return {
    akuvoxUserId: e.akuvoxUserId,
    name: e.displayName,
    scheduleRelay: e.scheduleRelay,
    photoPath: e.photoPath,
  };
}

/** Re-queue a fresh ADD + UPDATE_FACE, clearing any stale/failed jobs. */
export async function repushEnrollee(formData: FormData) {
  const user = await requireUser();
  const e = await loadManaged(String(formData.get("id")));
  if (!e) return;
  await prisma.$transaction(async (tx) => {
    await tx.pushJob.deleteMany({ where: { enrolleeId: e.id } });
    await tx.pushJob.createMany({
      data: [
        { enrolleeId: e.id, action: "ADD", payload: snapshot(e) },
        { enrolleeId: e.id, action: "UPDATE_FACE", payload: snapshot(e) },
      ],
    });
    await tx.enrollee.update({
      where: { id: e.id },
      data: { status: "PENDING_PUSH", lastError: null },
    });
  });
  await audit({
    actorId: user.id,
    action: "push.requeue",
    targetType: "Enrollee",
    targetId: e.id,
  });
  revalidatePath("/directory");
}

/** Queue a DELETE; completeJob marks the enrollee REMOVED once the door confirms. */
export async function removeEnrollee(formData: FormData) {
  const user = await requireUser();
  const e = await loadManaged(String(formData.get("id")));
  if (!e) return;
  await prisma.$transaction(async (tx) => {
    await tx.pushJob.deleteMany({ where: { enrolleeId: e.id } });
    await tx.pushJob.create({
      data: { enrolleeId: e.id, action: "DELETE", payload: snapshot(e) },
    });
  });
  await audit({
    actorId: user.id,
    action: "enrollee.remove",
    targetType: "Enrollee",
    targetId: e.id,
    meta: { akuvoxUserId: e.akuvoxUserId },
  });
  revalidatePath("/directory");
}

/** Replace a person's photo and re-push the face. */
export async function replacePhoto(
  _prev: DirState,
  formData: FormData,
): Promise<DirState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());
  const e = await loadManaged(String(formData.get("id")));
  if (!e) return { error: t.common.error };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: t.common.error };

  const face = await validateFace(new Uint8Array(await file.arrayBuffer()));
  if (!face.ok || !face.image) return { error: face.reason ?? t.common.error };

  const photoPath = photoKey(e.displayName, e.akuvoxUserId);
  await putPhoto(photoPath, face.image, "image/jpeg");

  await prisma.$transaction(async (tx) => {
    await tx.enrollee.update({
      where: { id: e.id },
      data: { photoPath, status: "PENDING_PUSH", lastError: null },
    });
    await tx.pushJob.deleteMany({ where: { enrolleeId: e.id } });
    await tx.pushJob.create({
      data: {
        enrolleeId: e.id,
        action: "UPDATE_FACE",
        payload: { ...snapshot(e), photoPath },
      },
    });
  });
  await audit({
    actorId: user.id,
    action: "face.replace",
    targetType: "Enrollee",
    targetId: e.id,
  });
  revalidatePath("/directory");
  return { ok: "ok" };
}
