"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  audit,
  createTempPin,
  extendTempPin,
  revokeTempPin,
  listTempPins,
} from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { describeDeviceError } from "@/lib/device";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export interface TempPinRow {
  id: string;
  label: string;
  pin: string;
  deviceName: string;
  startsAt: string | null;
  expiresAt: string;
  active: boolean; // already created on the door (vs scheduled to start later)
  userId: number;
  weekly: string | null; // recurring weekdays (Sun=0..Sat=6) or null
  timeBegin: string | null;
  timeEnd: string | null;
}

export async function listTempPinsUI(): Promise<TempPinRow[]> {
  await requireUser();
  const [pins, devices] = await Promise.all([
    listTempPins(),
    prisma.device.findMany({ select: { id: true, name: true } }),
  ]);
  const dn = new Map(devices.map((d) => [d.id, d.name]));
  return pins.map((p) => ({
    id: p.id,
    label: p.label,
    pin: p.pin,
    deviceName: dn.get(p.deviceId) ?? "",
    startsAt: p.startsAt?.toISOString() ?? null,
    expiresAt: p.expiresAt.toISOString(),
    active: p.activatedAt != null,
    userId: p.akuvoxUserId,
    weekly: p.weekly,
    timeBegin: p.timeBegin,
    timeEnd: p.timeEnd,
  }));
}

export async function listTempDoors(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  return prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

export type TempState = { error?: string; ok?: { pin: string; label: string } };

export async function createTempPinAction(
  _prev: TempState,
  formData: FormData,
): Promise<TempState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());
  const label = String(formData.get("label") ?? "").trim();
  const deviceId = String(formData.get("deviceId") ?? "");
  const customPin = String(formData.get("pin") ?? "").trim();
  const startsRaw = String(formData.get("startsAt") ?? "").trim();
  const endsRaw = String(formData.get("endsAt") ?? "").trim();
  if (!label) return { error: t.temp.needLabel };
  if (!deviceId) return { error: t.temp.needDoor };
  if (customPin && !/^\d{4,6}$/.test(customPin)) {
    return { error: t.temp.badPin };
  }

  const mode = String(formData.get("mode") ?? "once");

  let startsAt: Date | null = null;
  let expiresAt: Date;
  let recurring: { weekly: string; timeBegin: string; timeEnd: string } | undefined;

  if (mode === "repeat") {
    // Recurring weekly: chosen days + daily time window + until-date.
    const weekly = formData.getAll("days").map(String).sort().join("");
    const timeBegin = String(formData.get("timeFrom") ?? "").trim();
    const timeEnd = String(formData.get("timeTo") ?? "").trim();
    const untilRaw = String(formData.get("until") ?? "").trim();
    if (!weekly) return { error: t.temp.needDays };
    if (!/^\d{2}:\d{2}$/.test(timeBegin) || !/^\d{2}:\d{2}$/.test(timeEnd)) {
      return { error: t.temp.endInPast };
    }
    // until defaults to one year out if blank
    expiresAt = untilRaw ? new Date(`${untilRaw}T23:59`) : new Date(Date.now() + 365 * 24 * 3600000);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return { error: t.temp.endInPast };
    }
    recurring = { weekly, timeBegin, timeEnd };
  } else {
    // One-time: datetime-local strings parse as LOCAL time.
    startsAt = startsRaw ? new Date(startsRaw) : null;
    expiresAt = endsRaw ? new Date(endsRaw) : new Date(Date.now() + 12 * 3600000);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return { error: t.temp.endInPast };
    }
    if (startsAt && (isNaN(startsAt.getTime()) || startsAt.getTime() >= expiresAt.getTime())) {
      return { error: t.temp.badStart };
    }
  }

  try {
    const { pin, userId } = await createTempPin({
      deviceId,
      label,
      startsAt,
      expiresAt,
      recurring,
      pin: customPin || undefined,
      createdById: user.id,
    });
    await audit({
      actorId: user.id,
      action: "enrollee.create",
      targetType: "TempPin",
      targetId: String(userId),
      meta: { label, startsAt, expiresAt },
    });
    revalidatePath("/temp-pins");
    return { ok: { pin, label } };
  } catch (e) {
    return { error: describeDeviceError(e, "temp PIN create") };
  }
}

export async function extendTempPinAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const hours = Math.max(1, Math.min(720, Number(formData.get("hours") ?? 1)));
  if (id) await extendTempPin(id, hours);
  revalidatePath("/temp-pins");
}

export async function revokeTempPinAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await revokeTempPin(id);
    await audit({
      actorId: user.id,
      action: "enrollee.remove",
      targetType: "TempPin",
      targetId: id,
    });
  }
  revalidatePath("/temp-pins");
}
