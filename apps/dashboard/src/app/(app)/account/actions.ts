"use server";

import { prisma, audit } from "@ytc/core";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export type PwState = { error?: string; ok?: boolean };

export async function changePassword(_prev: PwState, formData: FormData): Promise<PwState> {
  const sessionUser = await requireUser();
  const t = getDictionary(await getLocale());

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: t.account.tooShort };
  if (next !== confirm) return { error: t.account.mismatch };

  const user = await prisma.staffUser.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: t.common.error };

  const ok = await verifyPassword(user.passwordHash, current);
  if (!ok) return { error: t.account.wrongCurrent };

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  await audit({
    actorId: user.id,
    action: "staff.password",
    targetType: "StaffUser",
    targetId: user.id,
  });
  return { ok: true };
}
