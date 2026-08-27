"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  getPhotoBytes,
  audit,
  validateFace,
  getCachedDirectory,
  normalizeName,
} from "@ytc/core";
import { requireUser } from "@/lib/auth";
import {
  approveAsRoster,
  approveByName,
  choosePhoto,
  rejectOne,
  type ReviewResult,
} from "@/lib/review";
import { deviceClientById, describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

export type ReviewState = { error?: string; ok?: string };

/** Render a shared review failure in the staff member's language. */
function reviewErrorText(
  res: Extract<ReviewResult, { ok: false }>,
  t: ReturnType<typeof getDictionary>,
): string {
  switch (res.code) {
    case "roster_missing":
      return t.review.rosterMissing;
    case "name_required":
      return t.review.needName;
    // The device's own words ("no face found", "too dark") are more use than a
    // generic failure, so they pass straight through.
    case "rejected_by_device":
      return res.message ?? t.common.error;
    default:
      return t.common.error;
  }
}

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

export interface RosterHit {
  studentId: string;
  name: string;
  shiur: string | null;
}

/**
 * Search the roster to attach a photo by hand.
 *
 * The card only offers roster buttons for candidates the matcher proposed, and
 * it proposes none when there's nothing to match on — an email with no subject
 * line gives no name, so a perfectly good photo had no way to reach the roster
 * entry it belongs to. This lets staff pick the person themselves.
 */
export async function searchRoster(query: string): Promise<RosterHit[]> {
  await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.rosterEntry.findMany({
    where: {
      status: { not: "ENROLLED" }, // already has a face on file
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { normalizedName: { contains: normalizeName(q) } },
        { studentId: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: 8,
    select: { studentId: true, fullName: true, shiur: true },
  });
  return rows.map((r) => ({ studentId: r.studentId, name: r.fullName, shiur: r.shiur }));
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

/** Approve a submission as a specific roster student → promote to Enrollee. */
export async function approveSubmission(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const res = await approveAsRoster({
    submissionId: String(formData.get("submissionId") ?? ""),
    studentId: String(formData.get("studentId") ?? "").trim(),
    actorId: user.id,
    deviceIds: formData.getAll("deviceIds").map(String).filter(Boolean),
  });
  revalidatePath("/review");
  if (!res.ok) return { error: reviewErrorText(res, t) };
  if (res.queued) return { error: res.deviceError ?? t.common.error };
  return { ok: fmt(t.review.approvedMsg, { name: res.name, userId: res.userId }) };
}

/** Enroll directly with a typed name (no roster needed) — for denied scans and
 *  emailed photos with no roster match. */
export async function enrollByName(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const res = await approveByName({
    submissionId: String(formData.get("submissionId") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    groupName: String(formData.get("groupName") ?? "").trim() || null,
    pin: String(formData.get("pin") ?? "").trim() || null,
    actorId: user.id,
    deviceIds: formData.getAll("deviceIds").map(String).filter(Boolean),
  });
  revalidatePath("/review");
  if (!res.ok) return { error: reviewErrorText(res, t) };
  if (res.queued) return { error: res.deviceError ?? t.common.error };
  return { ok: fmt(t.review.approvedMsg, { name: res.name, userId: res.userId }) };
}

/**
 * Choose which of the email's images is this person's photo.
 *
 * Emails carry more than one image — a signature logo alongside the real
 * picture — and picking the wrong one used to enroll a company wordmark. The
 * chosen key is swapped into `imagePath` and the previous one moves into the
 * alternates, so approving, enrolling by name, and updating an existing
 * person's photo all keep reading a single field and need no special case.
 */
export async function chooseSubmissionPhoto(
  submissionId: string,
  path: string,
): Promise<ReviewState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());
  const res = await choosePhoto({ submissionId, path, actorId: user.id });
  if (!res.ok) return { error: t.common.error };
  revalidatePath("/review");
  return { ok: path };
}

export async function rejectSubmission(formData: FormData) {
  const user = await requireUser();
  await rejectOne({
    submissionId: String(formData.get("submissionId") ?? ""),
    actorId: user.id,
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
