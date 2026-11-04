/**
 * Who may show this site in an iframe: the YTC portal only. Read from env
 * PORTAL_ORIGINS (space- or comma-separated) so the list can change without a
 * code edit; 'self' is always kept. Anything that isn't 'self' or an http(s)
 * origin is dropped, so a typo can't inject other CSP directives.
 */
export const DEFAULT_PORTAL_ORIGINS =
  "'self' http://10.0.0.80 http://100.119.39.109 http://ytc-portal https://ytc-portal.tail599708.ts.net http://portal.ytchaim.com https://portal.ytchaim.com";

export function frameAncestors(raw: string | undefined = process.env.PORTAL_ORIGINS): string {
  const src = raw && raw.trim() ? raw : DEFAULT_PORTAL_ORIGINS;
  const tokens = src
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean)
    .map((t) => (t === "self" ? "'self'" : t))
    .filter((t) => t === "'self'" || /^https?:\/\/[A-Za-z0-9.\-]+(:\d+)?$/.test(t.replace(/\/+$/, "")))
    .map((t) => t.replace(/\/+$/, ""));
  const list = ["'self'", ...tokens.filter((t) => t !== "'self'")];
  return [...new Set(list)].join(" ");
}

export function frameCsp(raw?: string): string {
  return `frame-ancestors ${frameAncestors(raw)}`;
}
