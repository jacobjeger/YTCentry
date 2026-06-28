"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

const schema = z.object({
  displayName: z.string().min(1, "Name is required."),
  studentId: z.string().optional(),
  shiur: z.string().optional(),
  phone: z.string().optional(),
});

export type EnrollState = {
  error?: string;
  ok?: { name: string; userId: number };
};

export async function enrollAction(
  _prev: EnrollState,
  formData: FormData,
): Promise<EnrollState> {
  const user = await requireUser();
  const t = getDictionary(await getLocale());

  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    studentId: formData.get("studentId") || undefined,
    shiur: formData.get("shiur") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t.login.invalid };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t.enroll.noFace };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { error: t.enroll.tooLarge };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const { enrollee } = await enrollPerson({
      ...parsed.data,
      source: "MANUAL",
      image: bytes,
      actorId: user.id,
    });
    return {
      ok: { name: enrollee.displayName, userId: enrollee.akuvoxUserId },
    };
  } catch (e) {
    if (e instanceof EnrollError) return { error: e.message };
    console.error("enroll failed", e);
    return { error: t.common.error };
  }
}
