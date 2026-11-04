/**
 * Proxy (Next 16's renamed middleware). Runs before every matched route.
 *
 * 1. Framing: every response gets `Content-Security-Policy: frame-ancestors …`
 *    (the YTC portal only, from env PORTAL_ORIGINS) and never X-Frame-Options.
 * 2. The cheap, edge-safe gate: is a session cookie present? Real verification
 *    (JWT signature + active StaffUser + permission) happens in the data layer
 *    (lib/session, lib/access) inside pages, Server Actions and route handlers.
 *
 * Public without a session: /login, /portal-sso, /portal-manifest.json.
 * The agent queue API (/api/agent/*) and the phone-app API (/api/mobile/*)
 * authenticate with a bearer token, so the cookie gate skips them (they still
 * get the framing header).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { frameCsp } from "@/lib/frame";

const SESSION_COOKIE = "ytc_session";
/** Reachable signed-out; a signed-in visitor is bounced home from these. */
const LOGIN_PATHS = ["/login"];
/** Reachable by anyone, signed in or not. */
const OPEN_PATHS = ["/portal-sso", "/portal-manifest.json", "/logout"];
const BEARER_PREFIXES = ["/api/agent", "/api/mobile"];

const matches = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname.startsWith(p + "/"));

function withFrameHeaders(res: NextResponse): NextResponse {
  res.headers.set("Content-Security-Policy", frameCsp());
  res.headers.delete("X-Frame-Options");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (matches(pathname, OPEN_PATHS) || matches(pathname, BEARER_PREFIXES)) {
    return withFrameHeaders(NextResponse.next());
  }

  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isLogin = matches(pathname, LOGIN_PATHS);

  if (!hasSession && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return withFrameHeaders(NextResponse.redirect(url));
  }

  if (hasSession && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withFrameHeaders(NextResponse.redirect(url));
  }

  return withFrameHeaders(NextResponse.next());
}

export const config = {
  // Everything except Next internals and static files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|toras-chaim-logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
