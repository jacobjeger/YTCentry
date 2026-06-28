"use client";

import { createContext, useContext } from "react";
import type { Dict, Locale } from "@/lib/i18n";

interface Ctx {
  locale: Locale;
  t: Dict;
}

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({
  locale,
  t,
  children,
}: {
  locale: Locale;
  t: Dict;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

/** Client hook for translations. Server components call getDictionary directly. */
export function useT(): Dict {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT must be used inside LocaleProvider");
  return ctx.t;
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx.locale;
}
