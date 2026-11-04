"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  validateFace,
  putPhoto,
  ID_BAND_START,
  getCachedDirectory,
  getCachedGroups,
  getCachedPerson,
  syncDeviceDirectory,
  upsertCacheRow,
  removeCacheRow,
  getPhotoBytes,
  clientForDevice,
} from "@ytc/core";
import { audit } from "@/lib/audit";
import {
  authorize,
  authorizeAny,
  can,
  allowedDoorIds,
  canUseDoor,
  filterDoors,
  firstAllowedDoorId,
  requireDoors,
  enrolleeDoorIds,
  logDenied,
  type Access,
} from "@/lib/access";
import { photoKey } from "@/lib/enroll";
import { deviceClientById, describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export interface DoorOption {
  id: string;
  name: string;
  /** A "default" door: pre-ticked when enrolling. Restricted doors are not. */
  allowEmail: boolean;
}

/** The doors to show in the Directory's door selector. */
export async function listDoors(): Promise<DoorOption[]> {
  // Shared by the Directory, Review Queue and Roster screens.
  const a = await authorizeAny(["view", "review", "roster"], "directory.listDoors");
  if (!a) return [];
  const devices = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, allowEmail: true },
  });
  return filterDoors(a, devices);
}

export type DirState = { error?: string; ok?: string };

export interface DirRow {
  /** Device ids this person is enrolled on (managed people only). */
  onDoors: string[];
  userID: string;
  name: string;
  hasFaceOnDevice: boolean;
  managed: boolean; // this system added/owns it
  legacy: boolean; // pre-existing (UserID < band)
  enrolleeId?: string;
  status?: string; // our Enrollee status when managed
  studentId?: string | null;
  shiur?: string | null;
  pin?: string | null;
  group?: string | null;
  /** Enrolled here but not on the door yet — waiting for it to come back. */
  pending?: boolean;
  /** Why the last push didn't land (only set when pending). */
  lastError?: string | null;
}

/**
 * The door to act on: the one asked for (if it is in the caller's door scope),
 * else the first active door they may use. "denied" when the named door is out
 * of scope — logged, and never silently swapped for another door.
 */
async function resolveDeviceId(
  a: Access,
  deviceId: string | undefined,
  what: string,
): Promise<string | null | "denied"> {
  if (deviceId) {
    if (await canUseDoor(a, deviceId)) return deviceId;
    await logDenied(a, what, { scope: "doors", deviceId });
    return "denied";
  }
  return firstAllowedDoorId(a);
}

/** Read the door directory from the local CACHE (instant). Falls back to a live
 *  sync the first time a door has no cache yet. */
export async function loadFullDirectory(deviceId?: string): Promise<{
  rows?: DirRow[];
  total?: number;
  /** how many of `rows` are enrolled-but-not-on-the-door */
  waiting?: number;
  syncedAt?: string | null;
  error?: string;
}> {
  const a = await authorize("view", "directory.load");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  // PINs are door codes: only people who may change access see them.
  const showPins = can(a, "edit_access");
  try {
    const id = await resolveDeviceId(a, deviceId, "directory.load");
    if (id === "denied") return { error: t.common.noPermission };
    if (!id) return { error: t.directory.noDoor };

    let cached = await getCachedDirectory(id);
    if (cached.rows.length === 0) {
      // first load for this door — populate the cache live, then read it
      const device = await prisma.device.findUnique({ where: { id } });
      if (device) await syncDeviceDirectory(device);
      cached = await getCachedDirectory(id);
    }

    const enrollees = await prisma.enrollee.findMany({
      include: { devices: { select: { deviceId: true } } },
    });
    const byId = new Map(enrollees.map((e) => [String(e.akuvoxUserId), e]));
    const rows: DirRow[] = cached.rows
      .map((u) => {
        const e = byId.get(u.userID);
        return {
          onDoors: e?.devices.map((d) => d.deviceId) ?? [],
          userID: u.userID,
          name: u.name,
          hasFaceOnDevice: u.hasFace,
          managed: !!e,
          legacy: Number(u.userID) < ID_BAND_START,
          enrolleeId: e?.id,
          status: e?.status,
          studentId: e?.studentId ?? null,
          shiur: e?.shiur ?? null,
          pin: showPins ? u.pin : null,
          group: u.group,
        };
      })
      .sort((a, b) => Number(a.userID) - Number(b.userID));

    // People we enrolled who never reached the door have no cache row, so the
    // merge above drops them entirely — they were invisible here even though
    // their photo is saved and the pusher is retrying them. Surface them at the
    // top, flagged, so staff can see who is still waiting and view the photo.
    const onDoor = new Set(cached.rows.map((u) => u.userID));
    const allowed = await allowedDoorIds(a);
    const waiting: DirRow[] = enrollees
      .filter(
        (e) =>
          e.status !== "REMOVED" &&
          e.status !== "PUSHED" &&
          !onDoor.has(String(e.akuvoxUserId)) &&
          // door-scoped staff only see people headed for one of their doors
          (allowed === null ||
            e.devices.length === 0 ||
            e.devices.some((d) => allowed.has(d.deviceId))),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((e) => ({
        onDoors: e.devices.map((d) => d.deviceId),
        userID: String(e.akuvoxUserId),
        name: e.displayName,
        hasFaceOnDevice: false,
        managed: true,
        legacy: false,
        enrolleeId: e.id,
        status: e.status,
        studentId: e.studentId ?? null,
        shiur: e.shiur ?? null,
        pin: showPins ? (e.pin ?? null) : null,
        group: e.groupName ?? null,
        pending: true,
        lastError: e.lastError,
      }));

    const all = [...waiting, ...rows];
    return {
      rows: all,
      total: all.length,
      waiting: waiting.length,
      syncedAt: cached.syncedAt?.toISOString() ?? null,
    };
  } catch (e) {
    return { error: describeDeviceError(e, "directory load") };
  }
}

/** Force a fresh pull from the door into the cache (the Refresh button). */
export async function refreshDirectory(deviceId?: string): Promise<{ error?: string }> {
  const a = await authorize("view", "directory.refresh");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  try {
    const id = await resolveDeviceId(a, deviceId, "directory.refresh");
    if (id === "denied") return { error: t.common.noPermission };
    if (!id) return { error: t.directory.noDoorShort };
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
  const a = await authorize("edit_access", "directory.getPersonDetail");
  const t = getDictionary(await getLocale());
  if (!a) return { name: "", pin: "", group: "", groups: [], error: t.common.noPermission };
  const id = await resolveDeviceId(a, deviceId, "directory.getPersonDetail");
  if (id === "denied") return { name: "", pin: "", group: "", groups: [], error: t.common.noPermission };
  if (!id) return { name: "", pin: "", group: "", groups: [], error: t.directory.noDoorShort };
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
  const a = await authorize("edit_access", "directory.savePersonEdit");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  const user = a.user;
  const userID = String(formData.get("userID") ?? "").trim();
  const did = await resolveDeviceId(
    a,
    String(formData.get("deviceId") ?? "") || undefined,
    "directory.savePersonEdit",
  );
  if (did === "denied") return { error: t.common.noPermission };
  if (!did) return { error: t.directory.noDoorShort };
  const deviceId = did;
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const group = String(formData.get("group") ?? "").trim();
  if (!userID) return { error: t.directory.missingUser };

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
  {
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
    meta: { pinSet: !!pin, group, deviceId, ...(name ? { name } : {}) },
  });
  revalidatePath("/directory");
  return { ok: "saved" };
}

/** Update ANY person's photo directly from the Directory (managed or legacy). */
export async function updatePhotoOnDoor(
  _prev: DirState,
  formData: FormData,
): Promise<DirState> {
  const a = await authorize("enroll", "directory.updatePhotoOnDoor");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  const user = a.user;
  const userID = String(formData.get("userID") ?? "").trim();
  const did = await resolveDeviceId(
    a,
    String(formData.get("deviceId") ?? "") || undefined,
    "directory.updatePhotoOnDoor",
  );
  if (did === "denied") return { error: t.common.noPermission };
  if (!did) return { error: t.directory.noDoorShort };
  const deviceId = did;
  const file = formData.get("photo");
  if (!userID || !(file instanceof File) || file.size === 0) return { error: t.common.error };

  const face = await validateFace(new Uint8Array(await file.arrayBuffer()));
  if (!face.ok || !face.image) return { error: face.reason ?? t.common.error };

  try {
    const client = await deviceClientById(deviceId);
    await client.replaceFaceWeb(userID, face.image);
  } catch (e) {
    return { error: describeDeviceError(e, "update photo") };
  }

  // For people we manage, also keep our stored photo + record in sync.
  const n = Number(userID);
  if (n >= ID_BAND_START) {
    const e = await prisma.enrollee.findFirst({ where: { akuvoxUserId: n } });
    if (e) {
      const path = photoKey(e.displayName, e.akuvoxUserId);
      await putPhoto(path, face.image, "image/jpeg");
      await prisma.enrollee.update({
        where: { id: e.id },
        data: { photoPath: path, status: "PUSHED", lastError: null },
      });
    }
  }
  await prisma.deviceUserCache.updateMany({
    where: { deviceId: did, userID },
    data: { hasFace: true },
  });
  await audit({
    actorId: user.id,
    action: "face.replace",
    targetType: "DeviceUser",
    targetId: userID,
    meta: { deviceId },
  });
  revalidatePath("/directory");
  return { ok: "ok" };
}

/** Delete ANY user from the door (admin device management; confirmed in the UI). */
export async function deleteFromDoor(formData: FormData) {
  const a = await authorize("remove", "directory.deleteFromDoor");
  if (!a) return;
  const user = a.user;
  const userID = String(formData.get("userID") ?? "").trim();
  if (!userID) return;
  const did = await resolveDeviceId(
    a,
    String(formData.get("deviceId") ?? "") || undefined,
    "directory.deleteFromDoor",
  );
  if (!did || did === "denied") return;
  const client = await deviceClientById(did);
  await client.delAnyUserWeb(userID);

  // Drop it from the cache at once so the directory updates immediately.
  await removeCacheRow(did, userID);

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
    meta: { legacy: n < ID_BAND_START, deviceId: did },
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
  const a = await authorize("enroll", "directory.repushEnrollee");
  if (!a) return;
  const user = a.user;
  const e = await loadManaged(String(formData.get("id")));
  if (!e) return;
  if (!(await requireDoors(a, await enrolleeDoorIds(e.id), "directory.repushEnrollee"))) return;
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
/**
 * Remove someone who never reached the door.
 *
 * deleteFromDoor can't do this: it calls the device first, so with the door
 * offline (exactly when these rows exist) it throws before the local cleanup
 * and the person stays listed forever. There is nothing on the door to delete
 * here, so this is purely local.
 *
 * The per-door rows must go too, or the pusher's retry loop happily pushes
 * someone we just removed the moment the door returns.
 */
export async function removeWaitingEnrollee(formData: FormData) {
  const a = await authorize("remove", "directory.removeWaitingEnrollee");
  if (!a) return;
  const user = a.user;
  const id = String(formData.get("enrolleeId") ?? "").trim();
  if (!id) return;
  const e = await prisma.enrollee.findUnique({ where: { id } });
  if (!e) return;
  if (!(await requireDoors(a, await enrolleeDoorIds(id), "directory.removeWaitingEnrollee"))) return;

  await prisma.$transaction(async (tx) => {
    await tx.enrolleeDevice.deleteMany({ where: { enrolleeId: id } });
    await tx.pushJob.deleteMany({ where: { enrolleeId: id } });
    // Free the roster entry so the person can be added again.
    await tx.rosterEntry.updateMany({
      where: { enrolleeId: id },
      data: { enrolleeId: null, status: "AWAITING_PHOTO" },
    });
    await tx.enrollee.update({
      where: { id },
      data: { status: "REMOVED", lastError: null },
    });
  });

  await audit({
    actorId: user.id,
    action: "enrollee.remove",
    targetType: "Enrollee",
    targetId: id,
    meta: { akuvoxUserId: e.akuvoxUserId, name: e.displayName, neverPushed: true },
  });
  revalidatePath("/directory");
}

export async function removeEnrollee(formData: FormData) {
  const a = await authorize("remove", "directory.removeEnrollee");
  if (!a) return;
  const user = a.user;
  const e = await loadManaged(String(formData.get("id")));
  if (!e) return;
  if (!(await requireDoors(a, await enrolleeDoorIds(e.id), "directory.removeEnrollee"))) return;
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
    meta: { akuvoxUserId: e.akuvoxUserId, name: e.displayName },
  });
  revalidatePath("/directory");
}

/** Replace a person's photo and re-push the face. */
export async function replacePhoto(
  _prev: DirState,
  formData: FormData,
): Promise<DirState> {
  const a = await authorize("enroll", "directory.replacePhoto");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  const user = a.user;
  const e = await loadManaged(String(formData.get("id")));
  if (!e) return { error: t.common.error };
  if (!(await requireDoors(a, await enrolleeDoorIds(e.id), "directory.replacePhoto"))) {
    return { error: t.common.noPermission };
  }

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

/**
 * Grant or revoke one person's access to ONE door.
 *
 * Granting re-pushes their stored photo to that reader; revoking deletes the
 * device user there and forgets the row. Both act on the named door directly
 * rather than going through a PushJob, because the pusher executes those
 * against the single door in its own env vars — a kitchen revoke queued that
 * way would delete the person from the FRONT door instead.
 */
export async function setDoorAccess(
  enrolleeId: string,
  deviceId: string,
  on: boolean,
): Promise<DirState> {
  // Granting a door is an access change; taking one away is a removal.
  const a = await authorize(on ? "edit_access" : "remove", "directory.setDoorAccess");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  const user = a.user;
  if (!(await requireDoors(a, [deviceId], "directory.setDoorAccess"))) {
    return { error: t.common.noPermission };
  }

  const enrollee = await prisma.enrollee.findUnique({ where: { id: enrolleeId } });
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!enrollee || !device) return { error: t.common.error };

  try {
    if (on) {
      if (!enrollee.photoPath) return { error: t.common.error };
      const image = await getPhotoBytes(enrollee.photoPath);
      await clientForDevice(device).pushUserWeb({
        userId: enrollee.akuvoxUserId,
        name: enrollee.displayName,
        image,
        scheduleRelay: enrollee.scheduleRelay,
        group: enrollee.groupName ?? undefined,
        pin: enrollee.pin ?? undefined,
      });
      await prisma.enrolleeDevice.upsert({
        where: { enrolleeId_deviceId: { enrolleeId, deviceId } },
        create: { enrolleeId, deviceId, status: "PUSHED", pushedAt: new Date() },
        update: { status: "PUSHED", pushedAt: new Date(), lastError: null },
      });
      await upsertCacheRow({
        deviceId,
        userID: String(enrollee.akuvoxUserId),
        name: enrollee.displayName,
        hasFace: true,
        pin: enrollee.pin ?? null,
        group: enrollee.groupName ?? null,
      });
    } else {
      // Delete on the device FIRST. The reverse order would show the person as
      // revoked while the reader still lets them in.
      await clientForDevice(device).delUserWeb(enrollee.akuvoxUserId);
      await prisma.enrolleeDevice.deleteMany({ where: { enrolleeId, deviceId } });
      await removeCacheRow(deviceId, String(enrollee.akuvoxUserId));
    }
  } catch (e) {
    return { error: describeDeviceError(e, on ? "grant door access" : "revoke door access") };
  }

  await audit({
    actorId: user.id,
    action: on ? "face.push" : "enrollee.remove",
    targetType: "Enrollee",
    targetId: enrolleeId,
    meta: {
      door: device.name,
      granted: on,
      akuvoxUserId: enrollee.akuvoxUserId,
      name: enrollee.displayName,
    },
  });
  revalidatePath("/directory");
  return { ok: device.name };
}
