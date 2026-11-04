"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "./LocaleProvider";

const NAMES: Record<Locale, string> = { he: "עברית", en: "English" };

export default function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    // Inside the portal's (cross-site) iframe a Lax cookie is dropped, so on
    // https use the same SameSite=None + Partitioned attributes as the session.
    const attrs =
      location.protocol === "https:" ? "samesite=none; secure; partitioned" : "samesite=lax";
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; ${attrs}`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="sr-only">{t.nav.language}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => choose(e.target.value as Locale)}
        className="min-h-11 rounded-md border border-stone-300 bg-white px-2 py-1 text-stone-600"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
