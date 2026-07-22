"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, audit } from "@ytc/core";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "STAFF"]),
});

export type StaffActionState = { error?: string; ok?: string };

export async function createStaff(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const t = getDictionary(await getLocale());
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const tooShort = parsed.error.issues.some((i) => i.path[0] === "password");
    return { error: tooShort ? t.staff.pwTooShort : t.login.invalid };
  }
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) return { error: t.staff.exists };

  const user = await prisma.staffUser.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await audit({
    actorId: admin.id,
    action: "staff.create",
    targetType: "StaffUser",
    targetId: user.id,
    meta: { email, role: parsed.data.role },
  });
  revalidatePath("/admin/staff");
  return { ok: fmt(t.staff.created, { email }) };
}

const resetSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(8),
});

/** Admin sets a new password for another login (forgot-password recovery). */
export async function resetStaffPassword(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const admin = await requireAdmin();
  const t = getDictionary(await getLocale());
  const parsed = resetSchema.safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: t.staff.pwTooShort };

  const user = await prisma.staffUser.findUnique({ where: { id: parsed.data.id } });
  if (!user) return { error: t.login.invalid };

  await prisma.staffUser.update({
    where: { id: parsed.data.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  await audit({
    actorId: admin.id,
    action: "staff.password",
    targetType: "StaffUser",
    targetId: user.id,
    meta: { email: user.email, byAdmin: true },
  });
  revalidatePath("/admin/staff");
  return { ok: fmt(t.staff.resetDone, { email: user.email }) };
}

export async function setActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  // Don't let an admin disable their own login (lockout guard).
  if (id === admin.id && !active) return;
  await prisma.staffUser.update({ where: { id }, data: { active } });
  await audit({
    actorId: admin.id,
    action: active ? "staff.create" : "staff.disable",
    targetType: "StaffUser",
    targetId: id,
    meta: { active },
  });
  revalidatePath("/admin/staff");
}
