"use server";

import { z } from "zod";
import { prisma, getCachedGroups } from "@ytc/core";
import { authorize, authorizeAny, filterDoors, requireDoors } from "@/lib/access";
import { isUnreachableError } from "@ytc/core";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export interface EnrollDoor {
  id: string;
  name: string;
  /** Everyday door: pre-ticked. Restricted doors must be chosen. */
  allowEmail: boolean;
}

/** Active doors to offer in the Add Person door picker. */
export async function listEnrollDoors(): Promise<EnrollDoor[]> {
  const a = await authorize("enroll", "enroll.listDoors");
  if (!a) return [];
  const doors = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, allowEmail: true },
  });
  return filterDoors(a, doors);
}

/** The device's user groups, for the Add Person group picker. Reads the CACHE
 *  (synced by the worker) so opening Add Person never hits the door. */
export async function listGroups(): Promise<string[]> {
  const a = await authorizeAny(["enroll", "review"], "enroll.listGroups");
  if (!a) return [];
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
  /** Saved but the door was offline — the worker will push it automatically. */
  queued?: { name: string };
};

export async function enrollAction(
  _prev: EnrollState,
  formData: FormData,
): Promise<EnrollState> {
  const a = await authorize("enroll", "enroll.add");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };
  const user = a.user;

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
  if (!(await requireDoors(a, deviceIds, "enroll.add"))) {
    return { error: t.common.noPermission };
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
    if (!pushed) {
      // Door offline → the enrollee is saved (PUSH_FAILED) and the worker will
      // push it automatically once the door is back. Tell the user it's queued,
      // not failed. A non-transient error (e.g. bad face) is a real error.
      if (isUnreachableError(deviceError)) {
        return { queued: { name: enrollee.displayName } };
      }
      return { error: describeDeviceError(deviceError, "enroll") };
    }
    return {
      ok: { name: enrollee.displayName, userId: enrollee.akuvoxUserId },
    };
  } catch (e) {
    if (e instanceof EnrollError) return { error: e.message };
    console.error("enroll failed", e);
    return { error: t.common.error };
  }
}
