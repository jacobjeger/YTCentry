"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, encryptSecret, clientForDevice, isUnreachableError } from "@ytc/core";
import { requireAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

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

/**
 * Turn whatever was pasted into a base URL the device client can use.
 *
 * The reader's admin page lives at a hash route, so copying the address bar
 * gives "https://door.example.org/#/". Trailing-slash stripping alone leaves
 * the "#", and every request then silently goes to the site root instead of
 * /web — the fragment is never sent to the server — so the door answers with
 * HTML and login "fails" for a reason nobody could guess from the message.
 */
function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    u.hash = "";
    u.search = "";
    // Keep any real path prefix, drop a bare "/" and trailing slashes.
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.origin}${path}`;
  } catch {
    return trimmed.replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "door";
}

export async function addDoor(
  _prev: DoorActionState,
  formData: FormData,
): Promise<DoorActionState> {
  await requireAdmin();
  const t = getDictionary(await getLocale());
  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    baseUrl: normalizeBaseUrl(String(formData.get("baseUrl") ?? "")),
    webPassword: formData.get("webPassword"),
    webUser: formData.get("webUser") || undefined,
    allowEmail: formData.get("allowEmail") === "on",
    pollSnapshots: formData.get("pollSnapshots") === "on",
  });
  if (!parsed.success) {
    return { error: t.doors.invalid };
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
  // "Couldn't log in" covered both a door that never answered and a door that
  // answered "wrong user or pwd" — two completely different fixes, and the
  // message sent people to check the URL when the URL was fine.
  try {
    await clientForDevice(device).webLogin();
  } catch (e) {
    await prisma.device.delete({ where: { id: device.id } });
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: isUnreachableError(msg) ? t.doors.unreachable : t.doors.badPassword,
    };
  }

  revalidatePath("/admin/settings");
  return { ok: fmt(t.doors.added, { name: device.name }) };
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
