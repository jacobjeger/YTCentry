/**
 * Enrollment core — shared by manual Add Person and the Review Queue approvals.
 *
 *   validateFace(image) -> allocateUserId() -> create Enrollee
 *     -> push to the door SYNCHRONOUSLY (dashboard reaches it through the public
 *        tunnel) and VERIFY the face attached -> set real PUSHED/PUSH_FAILED.
 *
 * Synchronous push means the caller learns the true result — we never report
 * success unless the door actually accepted the face (faceID > 0).
 */
import "server-only";
import {
  prisma,
  Prisma,
  validateFace,
  putPhoto,
  allocateUserId,
  audit,
  ID_BAND_START,
  getActiveDevices,
  clientForDevice,
  type EnrolleeSource,
  type Enrollee,
  type Device,
} from "@ytc/core";

export class EnrollError extends Error {}

export interface DoorResult {
  deviceId: string;
  name: string;
  ok: boolean;
  error?: string;
}

/** Object key from a person's name: "Moshe Goldberg" → enrollees/Moshe_Goldberg-100001.jpg */
export function photoKey(displayName: string, userId: number): string {
  const slug =
    displayName
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "_") // letters/numbers kept, others → _
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "person";
  return `enrollees/${slug}-${userId}.jpg`;
}

export interface EnrollInput {
  displayName: string;
  studentId?: string | null;
  shiur?: string | null;
  phone?: string | null;
  groupName?: string | null;
  pin?: string | null;
  source: EnrolleeSource;
  image: Uint8Array;
  actorId?: string | null;
  /** link back to the roster/submission rows when promoting from email */
  rosterEntryId?: string | null;
  /** which doors to enroll on; defaults to all active doors */
  deviceIds?: string[];
}

export interface EnrollResult {
  enrollee: Enrollee;
  pushed: boolean; // every selected door succeeded
  /** the real device error when pushed === false (joined across doors) */
  deviceError?: string;
  perDoor: DoorResult[];
}

/**
 * Normalize the photo, allocate a band-safe UserID, create the Enrollee, then
 * push to the door and verify. Retries the ID allocation on a unique-constraint
 * race. Throws EnrollError only for things that block creation (unreadable
 * image); a failed *push* returns pushed:false + the reason (the Enrollee still
 * exists as PUSH_FAILED and can be retried from the Directory).
 */
export async function enrollPerson(input: EnrollInput): Promise<EnrollResult> {
  // Normalize only — the door is the real judge of face quality (verified after
  // push). We don't reject dark/small photos here.
  const face = await validateFace(input.image);
  if (!face.ok || !face.image) {
    throw new EnrollError(face.reason ?? "Couldn't read that image — try another.");
  }

  let enrollee: Enrollee | null = null;
  for (let attempt = 0; attempt < 5 && !enrollee; attempt++) {
    try {
      enrollee = await createEnrollee(input, face.image);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        (e.meta?.target as string[] | undefined)?.includes("akuvoxUserId")
      ) {
        continue; // someone grabbed the same id — retry
      }
      throw e;
    }
  }
  if (!enrollee) throw new EnrollError("Could not allocate a free UserID — retry.");

  return pushToDoors(enrollee, face.image, input.deviceIds, input.actorId);
}

async function createEnrollee(
  input: EnrollInput,
  imageBytes: Uint8Array,
): Promise<Enrollee> {
  const userId = await allocateUserId();
  if (userId < ID_BAND_START) {
    throw new EnrollError("Allocated UserID fell outside the automation band.");
  }
  const photoPath = photoKey(input.displayName, userId);
  await putPhoto(photoPath, imageBytes, "image/jpeg");

  const enrollee = await prisma.$transaction(async (tx) => {
    const created = await tx.enrollee.create({
      data: {
        akuvoxUserId: userId,
        displayName: input.displayName.trim(),
        studentId: input.studentId?.trim() || null,
        shiur: input.shiur?.trim() || null,
        phone: input.phone?.trim() || null,
        source: input.source,
        groupName: input.groupName?.trim() || null,
        pin: input.pin?.trim() || null,
        photoPath,
        status: "PENDING_PUSH",
        createdById: input.actorId ?? null,
      },
    });
    if (input.rosterEntryId) {
      await tx.rosterEntry.update({
        where: { id: input.rosterEntryId },
        data: { enrolleeId: created.id, status: "ENROLLED" },
      });
    }
    return created;
  });

  await audit({
    actorId: input.actorId,
    action: "enrollee.create",
    targetType: "Enrollee",
    targetId: enrollee.id,
    meta: { akuvoxUserId: enrollee.akuvoxUserId, source: input.source },
  });
  return enrollee;
}

/** Push synchronously to each selected door, verify the face landed on each,
 *  and record per-door status. Enrollee.status aggregates the doors. */
async function pushToDoors(
  enrollee: Enrollee,
  imageBytes: Uint8Array,
  deviceIds: string[] | undefined,
  actorId?: string | null,
): Promise<EnrollResult> {
  let devices: Device[];
  if (deviceIds && deviceIds.length) {
    devices = await prisma.device.findMany({
      where: { id: { in: deviceIds }, active: true },
      orderBy: { sortOrder: "asc" },
    });
  } else {
    devices = await getActiveDevices();
  }

  if (devices.length === 0) {
    const msg = "No doors are configured. Add a door in Settings first.";
    const updated = await prisma.enrollee.update({
      where: { id: enrollee.id },
      data: { status: "PUSH_FAILED", lastError: msg },
    });
    return { enrollee: updated, pushed: false, deviceError: msg, perDoor: [] };
  }

  const perDoor: DoorResult[] = [];
  for (const d of devices) {
    try {
      await clientForDevice(d).pushUserWeb({
        userId: enrollee.akuvoxUserId,
        name: enrollee.displayName,
        image: imageBytes,
        scheduleRelay: enrollee.scheduleRelay,
        group: enrollee.groupName ?? undefined,
        pin: enrollee.pin ?? undefined,
      });
      await prisma.enrolleeDevice.upsert({
        where: { enrolleeId_deviceId: { enrolleeId: enrollee.id, deviceId: d.id } },
        create: { enrolleeId: enrollee.id, deviceId: d.id, status: "PUSHED", pushedAt: new Date() },
        update: { status: "PUSHED", pushedAt: new Date(), lastError: null },
      });
      perDoor.push({ deviceId: d.id, name: d.name, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Push failed.";
      await prisma.enrolleeDevice.upsert({
        where: { enrolleeId_deviceId: { enrolleeId: enrollee.id, deviceId: d.id } },
        create: { enrolleeId: enrollee.id, deviceId: d.id, status: "PUSH_FAILED", lastError: msg },
        update: { status: "PUSH_FAILED", lastError: msg },
      });
      perDoor.push({ deviceId: d.id, name: d.name, ok: false, error: msg });
    }
  }

  const allOk = perDoor.every((p) => p.ok);
  const anyOk = perDoor.some((p) => p.ok);
  const failMsg = perDoor.filter((p) => !p.ok).map((p) => `${p.name}: ${p.error}`).join("; ");
  const updated = await prisma.enrollee.update({
    where: { id: enrollee.id },
    data: {
      status: allOk ? "PUSHED" : "PUSH_FAILED",
      pushedAt: anyOk ? new Date() : null,
      faceUrl: anyOk ? "set" : null,
      lastError: allOk ? null : failMsg,
    },
  });
  await audit({
    actorId,
    action: "face.push",
    targetType: "Enrollee",
    targetId: enrollee.id,
    meta: { akuvoxUserId: enrollee.akuvoxUserId, doors: perDoor.map((p) => ({ name: p.name, ok: p.ok })) },
  });
  return {
    enrollee: updated,
    pushed: allOk,
    deviceError: allOk ? undefined : failMsg,
    perDoor,
  };
}
