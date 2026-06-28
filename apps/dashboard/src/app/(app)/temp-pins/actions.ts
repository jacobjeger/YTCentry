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

export interface TempPinRow {
  id: string;
  label: string;
  pin: string;
  deviceName: string;
  expiresAt: string;
  userId: number;
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
    expiresAt: p.expiresAt.toISOString(),
    userId: p.akuvoxUserId,
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
  const label = String(formData.get("label") ?? "").trim();
  const hours = Math.max(1, Math.min(720, Number(formData.get("hours") ?? 12)));
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!label) return { error: "Enter a label (who it's for)." };
  if (!deviceId) return { error: "Pick a door." };
  try {
    const { pin, userId, expiresAt } = await createTempPin({
      deviceId,
      label,
      hours,
      createdById: user.id,
    });
    await audit({
      actorId: user.id,
      action: "enrollee.create",
      targetType: "TempPin",
      targetId: String(userId),
      meta: { label, hours, expiresAt },
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
