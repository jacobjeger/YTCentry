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
  type EnrolleeSource,
  type Enrollee,
} from "@ytc/core";
import { deviceClient } from "./device";

export class EnrollError extends Error {}

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
  source: EnrolleeSource;
  image: Uint8Array;
  actorId?: string | null;
  /** link back to the roster/submission rows when promoting from email */
  rosterEntryId?: string | null;
}

export interface EnrollResult {
  enrollee: Enrollee;
  pushed: boolean;
  /** the real device error when pushed === false */
  deviceError?: string;
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

  return pushToDoor(enrollee, face.image, input.actorId);
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

/** Push to the door synchronously and verify the face landed. */
async function pushToDoor(
  enrollee: Enrollee,
  imageBytes: Uint8Array,
  actorId?: string | null,
): Promise<EnrollResult> {
  try {
    const client = deviceClient();
    await client.pushUserWeb({
      userId: enrollee.akuvoxUserId,
      name: enrollee.displayName,
      image: imageBytes,
      scheduleRelay: enrollee.scheduleRelay,
    });
    const updated = await prisma.enrollee.update({
      where: { id: enrollee.id },
      data: { status: "PUSHED", pushedAt: new Date(), faceUrl: "set", lastError: null },
    });
    await audit({
      actorId,
      action: "face.push",
      targetType: "Enrollee",
      targetId: enrollee.id,
      meta: { akuvoxUserId: enrollee.akuvoxUserId },
    });
    return { enrollee: updated, pushed: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Push to the door failed.";
    const updated = await prisma.enrollee.update({
      where: { id: enrollee.id },
      data: { status: "PUSH_FAILED", lastError: msg },
    });
    return { enrollee: updated, pushed: false, deviceError: msg };
  }
}
