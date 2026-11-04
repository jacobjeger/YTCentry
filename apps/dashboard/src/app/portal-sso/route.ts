/**
 * GET /portal-sso?token=<one-time RS256 JWT>&next=/path
 *
 * The YTC central portal sends the browser here (inside its iframe) with a
 * 60-second, single-use token. We verify it (lib/portal-core), find-or-create
 * the StaffUser, refresh their portal name / admin flag / perms / door scope,
 * start a normal session marked as a portal session, set the language, and
 * redirect to `next` (same-site paths only).
 *
 * Any failure → /login?error=<short code>. The token itself is never echoed,
 * logged or put anywhere it could leak; Referrer-Policy keeps it out of the
 * Referer of the next request too.
 */
import { NextResponse, type NextRequest } from "next/server";
import { redeemPortalToken } from "@/lib/portal";
import { PortalSsoError, safeNext } from "@/lib/portal-core";
import { signSessionToken, sessionCookieOptions, clearSessionHeaders, SESSION_COOKIE } from "@/lib/session";
import { audit } from "@/lib/audit";
import { LOCALE_COOKIE } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function redirectTo(location: string): NextResponse {
  // Relative Location: correct behind Railway's proxy, whatever Host it forwards.
  return new NextResponse(null, { status: 303, headers: { Location: location, ...NO_STORE } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("token");
  const next = safeNext(params.get("next"));

  try {
    const { user, claims } = await redeemPortalToken(token);

    const res = redirectTo(next);
    const session = await signSessionToken(user, 60 * 60 * 12, "portal");
    res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
    const { httpOnly: _h, ...localeOpts } = sessionCookieOptions(60 * 60 * 24 * 365);
    void _h;
    res.cookies.set(LOCALE_COOKIE, claims.lang, { ...localeOpts, httpOnly: false });

    await audit({
      actorId: user.id,
      action: "auth.login",
      targetType: "StaffUser",
      targetId: user.id,
      meta: {
        via: "portal",
        portalSub: claims.sub,
        isAdmin: claims.role === "admin",
        perms: claims.perms,
        scope: claims.scope ?? null,
      },
    });
    return res;
  } catch (e) {
    const code = e instanceof PortalSsoError ? e.code : "error";
    if (!(e instanceof PortalSsoError)) console.error("[portal-sso] unexpected failure", e);
    await audit({
      actorId: null,
      action: "auth.failed",
      targetType: "PortalSso",
      targetId: code,
      meta: { via: "portal", reason: code },
    });
    const res = redirectTo(`/login?error=portal_${code}`);
    // Don't leave a previous person signed in behind a failed hand-off.
    for (const c of clearSessionHeaders()) res.headers.append("Set-Cookie", c);
    return res;
  }
}
