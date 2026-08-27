/**
 * Review Queue operations, shared by the web server actions and the mobile API.
 *
 * These live here rather than in the route/action files because approving a
 * photo is more than "create an enrollee": it captures the sender's address for
 * the confirmation email, links the roster entry, and writes the audit row. A
 * second implementation for the phone would drift from the first — miss
 * `notifyEmail` and confirmations silently stop for anything approved from the
 * app — so both callers go through exactly this code.
 *
 * Deliberately free of locale and cookies: results come back as codes, and each
 * caller renders them its own way (the web from its dictionary, the app from
 * its string resources).
 */
import { prisma, getPhotoBytes, audit, normalizeName } from "@ytc/core";
import { enrollPerson, EnrollError } from "@/lib/enroll";

/** Statuses a submission can still be acted on from. */
export const PENDING_STATUSES = ["RECEIVED", "NEEDS_MATCH", "MATCHED"] as const;

export type ReviewErrorCode =
  | "not_found" // no such submission, or already reviewed by someone else
  | "name_required"
  | "roster_missing"
  | "photo_unreadable"
  | "rejected_by_device" // the door refused the face (too dark, no face found…)
  | "failed";

export type ReviewResult =
  | {
      ok: true;
      name: string;
      userId: number;
      /** The door was unreachable: saved and queued, NOT a failure. */
      queued: boolean;
      deviceError?: string | null;
    }
  | { ok: false; code: ReviewErrorCode; message?: string };

/**
 * Find the roster entry a typed name unambiguously refers to.
 *
 * Compares sorted name tokens, so "Josefovic Dovi" matches "Dovi Josefovic" —
 * emailed subjects routinely put the surname first. Only returns a match when
 * exactly ONE roster entry fits: two talmidim with the same name must stay a
 * human decision rather than a coin toss.
 */
export async function rosterEntryForName(displayName: string) {
  const key = (s: string) => normalizeName(s).split(" ").filter(Boolean).sort().join(" ");
  const want = key(displayName);
  if (!want) return null;

  const rows = await prisma.rosterEntry.findMany({
    where: { enrolleeId: null, status: { not: "ENROLLED" } },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      normalizedName: true,
      shiur: true,
      phone: true,
    },
  });
  const hits = rows.filter((r) => key(r.normalizedName) === want);
  return hits.length === 1 ? hits[0]! : null;
}


/**
 * Doors an emailed photo should land on.
 *
 * Honours the per-door "Receives emailed photos" flag, which existed in
 * Settings from the start but was read nowhere — so approvals fell through to
 * EVERY active door. That was harmless with one door and becomes an access
 * leak the moment a restricted door is added: approving a photo would hand
 * that person the kitchen too.
 *
 * Returns undefined when no door opts in, which keeps the old "all active
 * doors" behaviour rather than silently enrolling nobody anywhere.
 */
async function emailDoorIds(): Promise<string[] | undefined> {
  const doors = await prisma.device.findMany({
    where: { active: true, allowEmail: true },
    select: { id: true },
  });
  return doors.length ? doors.map((d) => d.id) : undefined;
}

async function loadPending(submissionId: string) {
  const submission = await prisma.photoSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) return null;
  if (!PENDING_STATUSES.includes(submission.status as (typeof PENDING_STATUSES)[number])) {
    return null;
  }
  return submission;
}

/** Approve a submission as a specific roster student → promote to Enrollee. */
export async function approveAsRoster(input: {
  submissionId: string;
  studentId: string;
  actorId: string;
  /** Explicit door choice from the reviewer; defaults to the everyday doors. */
  deviceIds?: string[];
}): Promise<ReviewResult> {
  const submission = await loadPending(input.submissionId);
  if (!submission) return { ok: false, code: "not_found" };

  const roster = await prisma.rosterEntry.findUnique({
    where: { studentId: input.studentId },
  });
  if (!roster) return { ok: false, code: "roster_missing" };

  let bytes: Uint8Array;
  try {
    bytes = await getPhotoBytes(submission.imagePath);
  } catch {
    return { ok: false, code: "photo_unreadable" };
  }

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName: roster.fullName,
      studentId: roster.studentId,
      shiur: roster.shiur,
      phone: roster.phone,
      source: "EMAIL",
      image: bytes,
      actorId: input.actorId,
      rosterEntryId: roster.id,
      deviceIds: input.deviceIds?.length ? input.deviceIds : await emailDoorIds(),
      // Confirm back to whoever emailed the photo once the door has them.
      notifyEmail: submission.fromAddress,
      notifyMessageId: submission.gmailMessageId,
    });

    await prisma.photoSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: "APPROVED",
        reviewedById: input.actorId,
        reviewedAt: new Date(),
        rosterEntryId: roster.id,
      },
    });
    await audit({
      actorId: input.actorId,
      action: "submission.approve",
      targetType: "PhotoSubmission",
      targetId: input.submissionId,
      meta: { studentId: input.studentId, akuvoxUserId: enrollee.akuvoxUserId },
    });

    return {
      ok: true,
      name: enrollee.displayName,
      userId: enrollee.akuvoxUserId,
      queued: !pushed,
      deviceError,
    };
  } catch (e) {
    if (e instanceof EnrollError) {
      return { ok: false, code: "rejected_by_device", message: e.message };
    }
    console.error("approveAsRoster failed", e);
    return { ok: false, code: "failed" };
  }
}

/** Enroll straight from a typed name — for photos with no roster match. */
export async function approveByName(input: {
  submissionId: string;
  displayName: string;
  groupName?: string | null;
  pin?: string | null;
  actorId: string;
  /** Explicit door choice from the reviewer; defaults to the everyday doors. */
  deviceIds?: string[];
}): Promise<ReviewResult> {
  const displayName = input.displayName.trim();
  if (!displayName) return { ok: false, code: "name_required" };

  const submission = await loadPending(input.submissionId);
  if (!submission) return { ok: false, code: "not_found" };

  let bytes: Uint8Array;
  try {
    bytes = await getPhotoBytes(submission.imagePath);
  } catch {
    return { ok: false, code: "photo_unreadable" };
  }

  // Adding by name used to leave the roster untouched, so the person was on the
  // door while the roster still said "Needs photo" and staff chased them for a
  // picture they'd already sent. Link it when the name clearly matches.
  const roster = await rosterEntryForName(displayName);

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName,
      groupName: input.groupName ?? null,
      pin: input.pin ?? null,
      studentId: roster?.studentId,
      shiur: roster?.shiur ?? undefined,
      phone: roster?.phone ?? undefined,
      source: roster ? "EMAIL" : "MANUAL",
      rosterEntryId: roster?.id,
      image: bytes,
      actorId: input.actorId,
      deviceIds: input.deviceIds?.length ? input.deviceIds : await emailDoorIds(),
      notifyEmail: submission.fromAddress,
      notifyMessageId: submission.gmailMessageId,
    });

    await prisma.photoSubmission.update({
      where: { id: input.submissionId },
      data: {
        status: "APPROVED",
        reviewedById: input.actorId,
        reviewedAt: new Date(),
        rosterEntryId: roster?.id ?? null,
      },
    });
    await audit({
      actorId: input.actorId,
      action: "submission.approve",
      targetType: "PhotoSubmission",
      targetId: input.submissionId,
      meta: { displayName, akuvoxUserId: enrollee.akuvoxUserId, byName: true },
    });

    return {
      ok: true,
      name: enrollee.displayName,
      userId: enrollee.akuvoxUserId,
      queued: !pushed,
      deviceError,
    };
  } catch (e) {
    if (e instanceof EnrollError) {
      return { ok: false, code: "rejected_by_device", message: e.message };
    }
    console.error("approveByName failed", e);
    return { ok: false, code: "failed" };
  }
}

/** Drop a submission from the queue. */
export async function rejectOne(input: {
  submissionId: string;
  actorId: string;
}): Promise<{ ok: boolean }> {
  await prisma.photoSubmission.update({
    where: { id: input.submissionId },
    data: { status: "REJECTED", reviewedById: input.actorId, reviewedAt: new Date() },
  });
  await audit({
    actorId: input.actorId,
    action: "submission.reject",
    targetType: "PhotoSubmission",
    targetId: input.submissionId,
  });
  return { ok: true };
}

/**
 * Choose which of the email's images is this person's photo.
 *
 * The chosen key is swapped into `imagePath` and the previous one moves into
 * the alternates, so every approve path keeps reading a single field.
 */
export async function choosePhoto(input: {
  submissionId: string;
  path: string;
  actorId: string;
}): Promise<{ ok: boolean }> {
  const submission = await prisma.photoSubmission.findUnique({
    where: { id: input.submissionId },
    select: { imagePath: true, altImagePaths: true },
  });
  if (!submission) return { ok: false };
  if (input.path === submission.imagePath) return { ok: true }; // already in use

  // Only ever select an image that arrived with THIS submission — the key comes
  // from a client, so it must never be trusted as a free-form storage path.
  if (!submission.altImagePaths.includes(input.path)) return { ok: false };

  await prisma.photoSubmission.update({
    where: { id: input.submissionId },
    data: {
      imagePath: input.path,
      altImagePaths: [
        submission.imagePath,
        ...submission.altImagePaths.filter((p) => p !== input.path),
      ].filter(Boolean),
    },
  });
  await audit({
    actorId: input.actorId,
    action: "submission.choosePhoto",
    targetType: "PhotoSubmission",
    targetId: input.submissionId,
    meta: { chose: input.path, was: submission.imagePath },
  });
  return { ok: true };
}
