"use server";

import { prisma, isUnreachableError } from "@ytc/core";
import { authorize, requireDoors } from "@/lib/access";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export type AddFaceState = {
  error?: string;
  ok?: { name: string };
  /** Saved but the door was offline — the worker will push it automatically. */
  queued?: { name: string };
};

/** The front door: by its key, else the everyday ("receives emailed photos") door. */
async function frontDoorId(): Promise<string | null> {
  const doors = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, allowEmail: true },
  });
  const byKey = doors.find((d) => ["front", "front-door", "main-entrance"].includes(d.key));
  return (byKey ?? doors.find((d) => d.allowEmail) ?? null)?.id ?? null;
}

/** Add a face: Add Person with only a name and a photo, always onto the front door. */
export async function addFaceAction(_prev: AddFaceState, formData: FormData): Promise<AddFaceState> {
  const a = await authorize("enroll", "addFace.add");
  const t = getDictionary(await getLocale());
  if (!a) return { error: t.common.noPermission };

  const displayName = String(formData.get("displayName") ?? "").trim().replace(/\s+/g, " ");
  if (!displayName) return { error: t.enroll.nameRequired };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: t.enroll.noFace };
  if (file.size > 15 * 1024 * 1024) return { error: t.enroll.tooLarge };

  const door = await frontDoorId();
  if (!door) return { error: t.addFace.noFrontDoor };
  if (!(await requireDoors(a, [door], "addFace.add"))) return { error: t.common.noPermission };

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName,
      groupName: null,
      pin: null,
      source: "MANUAL",
      image: new Uint8Array(await file.arrayBuffer()),
      actorId: a.user.id,
      deviceIds: [door],
    });
    if (!pushed) {
      // Door offline: saved, and the worker sends it once the door is back.
      if (isUnreachableError(deviceError)) return { queued: { name: enrollee.displayName } };
      return { error: describeDeviceError(deviceError, "enroll") };
    }
    return { ok: { name: enrollee.displayName } };
  } catch (e) {
    if (e instanceof EnrollError) return { error: e.message };
    console.error("add face failed", e);
    return { error: t.common.error };
  }
}
