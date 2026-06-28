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
import { deviceClient } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

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
export async function loadFullDirectory(): Promise<{
  rows?: DirRow[];
  total?: number;
  error?: string;
}> {
  await requireUser();
  try {
    const client = deviceClient();
    const [users, enrollees] = await Promise.all([
      client.getAllUsersViaWeb(),
      prisma.enrollee.findMany(),
    ]);
    const byId = new Map(enrollees.map((e) => [String(e.akuvoxUserId), e]));
    const rows: DirRow[] = users
      .map((u) => {
        const e = byId.get(String(u.userID));
        return {
          userID: u.userID,
          name: u.name,
          hasFaceOnDevice: Number(u.faceID ?? 0) > 0,
          managed: !!e,
          legacy: Number(u.userID) < ID_BAND_START,
          enrolleeId: e?.id,
          status: e?.status,
          studentId: e?.studentId ?? null,
          shiur: e?.shiur ?? null,
        };
      })
      .sort((a, b) => Number(a.userID) - Number(b.userID));
    return { rows, total: rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load the door directory." };
  }
}

/** Delete ANY user from the door (admin device management; confirmed in the UI). */
export async function deleteFromDoor(formData: FormData) {
  const user = await requireUser();
  const userID = String(formData.get("userID") ?? "").trim();
  if (!userID) return;
  const client = deviceClient();
  await client.delAnyUserWeb(userID);

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
