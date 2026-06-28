"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, encryptSecret, clientForDevice } from "@ytc/core";
import { requireAdmin } from "@/lib/auth";

export interface DoorRow {
  id: string;
  key: string;
  name: string;
  baseUrl: string;
  active: boolean;
  allowEmail: boolean;
  pollSnapshots: boolean;
}

export async function listAllDoors(): Promise<DoorRow[]> {
  await requireAdmin();
  return prisma.device.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, key: true, name: true, baseUrl: true,
      active: true, allowEmail: true, pollSnapshots: true,
    },
  });
}

const addSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  webPassword: z.string().min(1),
  webUser: z.string().optional(),
  allowEmail: z.boolean().optional(),
  pollSnapshots: z.boolean().optional(),
});

export type DoorActionState = { error?: string; ok?: string };

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "door";
}

export async function addDoor(
  _prev: DoorActionState,
  formData: FormData,
): Promise<DoorActionState> {
  await requireAdmin();
  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    baseUrl: String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, ""),
    webPassword: formData.get("webPassword"),
    webUser: formData.get("webUser") || undefined,
    allowEmail: formData.get("allowEmail") === "on",
    pollSnapshots: formData.get("pollSnapshots") === "on",
  });
  if (!parsed.success) {
    return { error: "Enter a name, a valid https URL, and the web password." };
  }
  let key = slug(parsed.data.name);
  // ensure unique key
  if (await prisma.device.findUnique({ where: { key } })) key = `${key}-${Date.now() % 10000}`;

  const count = await prisma.device.count();
  const device = await prisma.device.create({
    data: {
      key,
      name: parsed.data.name.trim(),
      baseUrl: parsed.data.baseUrl,
      webUser: parsed.data.webUser?.trim() || "admin",
      webPasswordEnc: encryptSecret(parsed.data.webPassword),
      allowEmail: !!parsed.data.allowEmail,
      pollSnapshots: !!parsed.data.pollSnapshots,
      sortOrder: count,
    },
  });

  // Smoke-test the connection so a bad URL/password is caught immediately.
  try {
    await clientForDevice(device).webLogin();
  } catch {
    await prisma.device.delete({ where: { id: device.id } });
    return { error: "Couldn't log into that door — check the URL and password." };
  }

  revalidatePath("/admin/settings");
  return { ok: `Added ${device.name}.` };
}

export async function deleteDoor(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.device.delete({ where: { id } });
  revalidatePath("/admin/settings");
}

export async function toggleDoorActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id) await prisma.device.update({ where: { id }, data: { active } });
  revalidatePath("/admin/settings");
}
