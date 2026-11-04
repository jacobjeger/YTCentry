"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { audit } from "@/lib/audit";
import { safeNext } from "@/lib/portal-core";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const t = getDictionary(await getLocale());
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: t.login.invalid };

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    await audit({
      actorId: null,
      action: "auth.failed",
      targetType: "StaffUser",
      targetId: parsed.data.email.trim().toLowerCase().slice(0, 200),
      meta: { via: "local" },
    });
    return { error: t.login.badCreds };
  }

  await createSession(user);
  await audit({
    actorId: user.id,
    action: "auth.login",
    targetType: "StaffUser",
    targetId: user.id,
  });

  // Only allow same-site relative redirects.
  // ("//evil.example" also starts with "/", so use the strict check.)
  const dest = safeNext(parsed.data.next);
  redirect(dest);
}
