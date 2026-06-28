"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  validateFace,
  putPhoto,
  audit,
  ID_BAND_START,
} from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { photoKey } from "@/lib/enroll";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export type DirState = { error?: string; ok?: string };

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
