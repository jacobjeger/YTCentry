"use server";

import { revalidatePath } from "next/cache";
import { prisma, getPhotoBytes, audit } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

export type ReviewState = { error?: string; ok?: string };

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
  const studentId = String(formData.get("studentId") ?? "").trim() || null;
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
      studentId,
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
