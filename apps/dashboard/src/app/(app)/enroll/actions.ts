"use server";

import { z } from "zod";
import { prisma, getCachedGroups } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export interface EnrollDoor { id: string; name: string }

/** Active doors to offer in the Add Person door picker. */
export async function listEnrollDoors(): Promise<EnrollDoor[]> {
  await requireUser();
  return prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

/** The device's user groups, for the Add Person group picker. Reads the CACHE
 *  (synced by the worker) so opening Add Person never hits the door. */
export async function listGroups(): Promise<string[]> {
  await requireUser();
  const device = await prisma.device.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  return device ? getCachedGroups(device.id) : [];
}

const schema = z.object({
  displayName: z.string().min(1),
});

export type EnrollState = {
  error?: string;
  ok?: { name: string; userId: number };
};

export async function enrollAction(
  _prev: EnrollState,
  formData: FormData,
): Promise<EnrollState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: t.enroll.nameRequired };
  }
  const groupName = String(formData.get("groupName") ?? "").trim() || null;
  const pin = String(formData.get("pin") ?? "").trim() || null;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t.enroll.noFace };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { error: t.enroll.tooLarge };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const deviceIds = formData.getAll("deviceIds").map(String).filter(Boolean);
  if (deviceIds.length === 0) {
    return { error: t.enroll.pickDoor };
  }

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName: parsed.data.displayName,
      groupName,
      pin,
      source: "MANUAL",
      image: bytes,
      actorId: user.id,
      deviceIds,
    });
    // Only report success if the door actually accepted the face.
    if (!pushed) return { error: deviceError ?? t.common.error };
    return {
      ok: { name: enrollee.displayName, userId: enrollee.akuvoxUserId },
    };
  } catch (e) {
    if (e instanceof EnrollError) return { error: e.message };
    console.error("enroll failed", e);
    return { error: t.common.error };
  }
}
