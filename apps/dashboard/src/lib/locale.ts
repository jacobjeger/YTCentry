/**
 * Resolve the active locale on the server: explicit cookie override wins,
 * otherwise detect from the browser's Accept-Language header. Default Hebrew.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  type Locale,
} from "./i18n";

function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  // e.g. "he-IL,he;q=0.9,en-US;q=0.8" → first matching base tag wins.
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const base = tag.split("-")[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return null;
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const override = cookieStore.get(LOCALE_COOKIE)?.value as Locale | undefined;
  if (override && LOCALES.includes(override)) return override;

  const h = await headers();
  return fromAcceptLanguage(h.get("accept-language")) ?? DEFAULT_LOCALE;
}
