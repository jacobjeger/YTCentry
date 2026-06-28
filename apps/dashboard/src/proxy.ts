/**
 * Proxy (Next 16's renamed middleware). Runs before every matched route.
 *
 * It does ONLY the cheap, edge-safe check: is a session cookie present? Real
 * verification (JWT signature + active StaffUser) happens in the data layer
 * (lib/session, lib/auth) inside Server Components / Actions, where Prisma and
 * argon2 are available. The proxy just bounces obviously-unauthenticated
 * requests to /login and keeps logged-in users out of /login.
 *
 * The agent queue API (/api/agent/*) authenticates with a bearer token, not the
 * cookie, so it is excluded from the cookie gate.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ytc_session";
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, static assets, the agent bearer
  // API, and common public files.
  matcher: [
    "/((?!api/agent|_next/static|_next/image|favicon.ico|toras-chaim-logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
