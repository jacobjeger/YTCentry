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
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="sr-only">{t.nav.language}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => choose(e.target.value as Locale)}
        className="rounded-md border border-stone-300 bg-white px-2 py-1 text-stone-600"
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
