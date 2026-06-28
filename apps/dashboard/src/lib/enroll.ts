/**
 * Enrollment core — shared by the two entry points (manual Add Person and the
 * emailed-photo Review Queue approval). See CLAUDE.md "Enrollment core".
 *
 *   validateFace(image) -> allocateUserId() -> create/Update Enrollee
 *     -> enqueue PushJob(ADD) -> enqueue PushJob(UPDATE_FACE)
 *
 * Nothing here talks to the door — it only writes rows. The on-site agent
 * (Task #6) drains the PushJob queue against the E16C over the LAN.
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

export class EnrollError extends Error {}

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
}

/**
 * Validate the face, store the normalized photo, allocate a band-safe UserID,
 * create the Enrollee, and queue the two push jobs. Retries the ID allocation on
 * a unique-constraint race.
 */
export async function enrollPerson(input: EnrollInput): Promise<EnrollResult> {
  // 1. Server-side face gate (normalizes + re-encodes <=2MB).
  const face = await validateFace(input.image);
  if (!face.ok || !face.image) {
    throw new EnrollError(face.reason ?? "Face did not pass validation.");
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await createWithAllocatedId(input, face.image);
    } catch (e) {
      // P2002 on akuvoxUserId means two enrollments grabbed the same id — retry.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        (e.meta?.target as string[] | undefined)?.includes("akuvoxUserId")
      ) {
        continue;
      }
      throw e;
    }
  }
  throw new EnrollError("Could not allocate a free UserID — please retry.");
}

async function createWithAllocatedId(
  input: EnrollInput,
  imageBytes: Uint8Array,
): Promise<EnrollResult> {
  const userId = await allocateUserId();
  if (userId < ID_BAND_START) {
    throw new EnrollError("Allocated UserID fell outside the automation band.");
  }

  // Store the normalized photo under a stable, collision-free key.
  const photoPath = `enrollees/${userId}-${Date.now()}.jpg`;
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

    const snapshot = {
      akuvoxUserId: created.akuvoxUserId,
      name: created.displayName,
      scheduleRelay: created.scheduleRelay,
      photoPath,
    };
    // ADD creates the bare user record; UPDATE_FACE attaches the face. The agent
    // runs them in order (a fresh UserID + face is the device's confirmed flow).
    await tx.pushJob.createMany({
      data: [
        { enrolleeId: created.id, action: "ADD", payload: snapshot },
        { enrolleeId: created.id, action: "UPDATE_FACE", payload: snapshot },
      ],
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

  return { enrollee };
}
