"use server";

import { revalidatePath } from "next/cache";
import { prisma, getPhotoBytes, audit, validateFace, getCachedDirectory } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { deviceClientById, describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

export type ReviewState = { error?: string; ok?: string };

export interface PersonHit {
  userID: string;
  name: string;
  hasFace: boolean;
}

/** Search existing people on the door (from the cache) to update their photo. */
export async function searchExistingPeople(query: string): Promise<PersonHit[]> {
  await requireUser();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const device = await prisma.device.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!device) return [];
  const { rows } = await getCachedDirectory(device.id);
  return rows
    .filter((r) => r.name.toLowerCase().includes(q) || r.userID.includes(q))
    .slice(0, 8)
    .map((r) => ({ userID: r.userID, name: r.name, hasFace: r.hasFace }));
}

/** Use a review photo to REPLACE an existing person's face on the door. */
export async function updatePersonPhoto(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());
  const submissionId = String(formData.get("submissionId") ?? "");
  const userID = String(formData.get("userID") ?? "").trim();
  if (!userID) return { error: t.common.error };

  const submission = await prisma.photoSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) return { error: t.common.error };

  let face;
  try {
    face = await validateFace(await getPhotoBytes(submission.imagePath));
  } catch {
    return { error: t.common.error };
  }
  if (!face.ok || !face.image) return { error: face.reason ?? t.common.error };

  try {
    const client = await deviceClientById();
    await client.replaceFaceWeb(userID, face.image);
  } catch (e) {
    return { error: describeDeviceError(e, "update photo") };
  }

  await prisma.photoSubmission.update({
    where: { id: submissionId },
    data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
  });
  await audit({
    actorId: user.id,
    action: "face.replace",
    targetType: "DeviceUser",
    targetId: userID,
    meta: { fromSubmission: submissionId },
  });
  revalidatePath("/review");
  return { ok: userID };
}

const PENDING = ["RECEIVED", "NEEDS_MATCH", "MATCHED"] as const;

/** Approve a submission as a specific roster student → promote to Enrollee. */
export async function approveSubmission(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const submissionId = String(formData.get("submissionId") ?? "");
  const studentId = String(formData.get("studentId") ?? "").trim();

  const submission = await prisma.photoSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!submission || !PENDING.includes(submission.status as (typeof PENDING)[number])) {
    return { error: t.common.error };
  }

  const roster = await prisma.rosterEntry.findUnique({ where: { studentId } });
  if (!roster) return { error: t.review.rosterMissing };

  let bytes: Uint8Array;
  try {
    bytes = await getPhotoBytes(submission.imagePath);
  } catch {
    return { error: t.common.error };
  }

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName: roster.fullName,
      studentId: roster.studentId,
      shiur: roster.shiur,
      phone: roster.phone,
      source: "EMAIL",
      image: bytes,
      actorId: user.id,
      rosterEntryId: roster.id,
    });

    await prisma.photoSubmission.update({
      where: { id: submissionId },
      data: {
        status: "APPROVED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        rosterEntryId: roster.id,
      },
    });
    await audit({
      actorId: user.id,
      action: "submission.approve",
      targetType: "PhotoSubmission",
      targetId: submissionId,
      meta: { studentId, akuvoxUserId: enrollee.akuvoxUserId },
    });
    revalidatePath("/review");
    if (!pushed) return { error: deviceError ?? t.common.error };
    return {
      ok: fmt(t.review.approvedMsg, {
        name: enrollee.displayName,
        userId: enrollee.akuvoxUserId,
      }),
    };
  } catch (e) {
    if (e instanceof EnrollError) return { error: e.message };
    console.error("approve failed", e);
    return { error: t.common.error };
  }
}

/** Enroll directly with a typed name (no roster needed) — for denied scans and
 *  emailed photos with no roster match. */
export async function enrollByName(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const submissionId = String(formData.get("submissionId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const groupName = String(formData.get("groupName") ?? "").trim() || null;
  const pin = String(formData.get("pin") ?? "").trim() || null;
  if (!displayName) return { error: t.review.needName };

  const submission = await prisma.photoSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!submission || !PENDING.includes(submission.status as (typeof PENDING)[number])) {
    return { error: t.common.error };
  }

  let bytes: Uint8Array;
  try {
    bytes = await getPhotoBytes(submission.imagePath);
  } catch {
    return { error: t.common.error };
  }

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName,
      groupName,
      pin,
      source: "MANUAL",
      image: bytes,
      actorId: user.id,
    });
    await prisma.photoSubmission.update({
      where: { id: submissionId },
      data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
    });
    await audit({
      actorId: user.id,
      action: "submission.approve",
      targetType: "PhotoSubmission",
      targetId: submissionId,
      meta: { displayName, akuvoxUserId: enrollee.akuvoxUserId, byName: true },
    });
    revalidatePath("/review");
    if (!pushed) return { error: deviceError ?? t.common.error };
    return {
      ok: fmt(t.review.approvedMsg, {
        name: enrollee.displayName,
        userId: enrollee.akuvoxUserId,
      }),
    };
  } catch (e) {
    if (e instanceof EnrollError) return { error: e.message };
    console.error("enrollByName failed", e);
    return { error: t.common.error };
  }
}

export async function rejectSubmission(formData: FormData) {
  const user = await requireUser();
  const submissionId = String(formData.get("submissionId") ?? "");
  await prisma.photoSubmission.update({
    where: { id: submissionId },
    data: {
      status: "REJECTED",
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });
  await audit({
    actorId: user.id,
    action: "submission.reject",
    targetType: "PhotoSubmission",
    targetId: submissionId,
  });
  revalidatePath("/review");
}

/** Reject several submissions at once (bulk clear from the Review Queue). */
export async function rejectManySubmissions(ids: string[]): Promise<number> {
  const user = await requireUser();
  const clean = ids.map((s) => String(s)).filter(Boolean);
  if (clean.length === 0) return 0;
  const res = await prisma.photoSubmission.updateMany({
    where: { id: { in: clean }, status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] } },
    data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date() },
  });
  await audit({
    actorId: user.id,
    action: "submission.reject",
    targetType: "PhotoSubmission",
    targetId: "bulk",
    meta: { count: res.count },
  });
  revalidatePath("/review");
  return res.count;
}
