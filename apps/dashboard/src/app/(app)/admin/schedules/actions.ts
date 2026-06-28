"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  audit,
  getCachedSchedules,
  refreshDeviceSchedules,
  clientForDevice,
} from "@ytc/core";
import { requireAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { describeDeviceError } from "@/lib/device";

export interface ScheduleRow {
  id: number; // internal id (for delete)
  scheduleID: number; // assignment id
  name: string;
}

async function firstDevice() {
  return prisma.device.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function listSchedulesUI(): Promise<ScheduleRow[]> {
  await requireAdmin();
  const d = await firstDevice();
  if (!d) return [];
  let cached = await getCachedSchedules(d.id);
  if (cached.length === 0) {
    // first open before a sync — populate once from the door
    try {
      cached = await refreshDeviceSchedules(d);
    } catch {
      /* device unreachable — return the (empty) cache */
    }
  }
  return cached;
}

export type SchedState = { error?: string; ok?: string };

const PROTECTED = new Set([1001, 1002]); // Always / Never — never delete

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export async function createScheduleAction(_prev: SchedState, formData: FormData): Promise<SchedState> {
  const user = await requireAdmin();
  const t = getDictionary(await getLocale());
  const name = String(formData.get("name") ?? "").trim();
  const weekly = formData.getAll("days").map(String).sort().join("");
  const timeFrom = String(formData.get("timeFrom") ?? "").trim();
  const timeTo = String(formData.get("timeTo") ?? "").trim();
  const untilRaw = String(formData.get("until") ?? "").trim();
  if (!name) return { error: t.schedules.needName };
  if (!weekly) return { error: t.schedules.needDays };
  if (!/^\d{2}:\d{2}$/.test(timeFrom) || !/^\d{2}:\d{2}$/.test(timeTo)) {
    return { error: t.schedules.needTime };
  }

  const device = await firstDevice();
  if (!device) return { error: t.schedules.noDoor };
  try {
    await clientForDevice(device).createScheduleWeb({
      name,
      weekly,
      timeBegin: timeFrom,
      timeEnd: timeTo,
      dayBegin: yyyymmdd(new Date()),
      dayEnd: untilRaw ? yyyymmdd(new Date(`${untilRaw}T00:00`)) : "20991231",
    });
    await refreshDeviceSchedules(device);
  } catch (e) {
    return { error: describeDeviceError(e, "create schedule") };
  }
  await audit({ actorId: user.id, action: "schedule.create", targetType: "Schedule", targetId: name });
  revalidatePath("/admin/schedules");
  return { ok: name };
}

export async function deleteScheduleAction(formData: FormData) {
  const user = await requireAdmin();
  const id = Number(formData.get("id"));
  const scheduleID = Number(formData.get("scheduleID"));
  if (!id || PROTECTED.has(scheduleID)) return;
  const device = await firstDevice();
  if (!device) return;
  await clientForDevice(device).deleteScheduleWeb(id);
  await refreshDeviceSchedules(device);
  await audit({ actorId: user.id, action: "schedule.delete", targetType: "Schedule", targetId: String(scheduleID) });
  revalidatePath("/admin/schedules");
}
