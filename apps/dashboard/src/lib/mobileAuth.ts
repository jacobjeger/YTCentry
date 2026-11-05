/**
 * Bearer-token auth for the native phone app (/api/mobile/*).
 *
 * The app logs in once (POST /api/mobile/login) and gets a long-lived JWT — the
 * same jose token the web cookie uses, just carried in an Authorization header
 * instead of a cookie. Every request re-reads the StaffUser and checks `active`
 * (via userFromClaims), so disabling a login in the dashboard instantly locks
 * the phone out even though the token itself is still valid. No device
 * credential ever lives on the phone — enrollment goes server → tunnel → door.
 */
import "server-only";
import type { StaffUser } from "@ytc/core";
import { verifyToken, userFromClaims } from "./session";
import { accessForUser, can, logDenied, type Access } from "./access";
import type { Perm } from "./portal-core";

/** Resolve the bearer token on a request to an active StaffUser, or null. */
export async function bearerUser(req: Request): Promise<StaffUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const claims = await verifyToken(match[1].trim());
  if (!claims) return null;
  // This API grants local-sign-in access. A portal session is limited to its
  // portal perms and door scope, so its token must not work here.
  if (claims.src === "portal") return null;
  return userFromClaims(claims);
}

/** Standard 401 JSON response for the mobile API. */
export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Bearer user + permission check in one call. The phone app signs in with an
 * email + password, so it gets the same access as a local web sign-in (ADMIN =
 * everything, STAFF = all but admin) — enforced here exactly as on the web.
 */
export async function bearerAccess(
  req: Request,
  perm: Perm,
  what: string,
): Promise<Access | Response> {
  const user = await bearerUser(req);
  if (!user) return unauthorized();
  const a = await accessForUser(user, "local");
  if (!can(a, perm)) {
    await logDenied(a, what, { perm, via: "mobile" });
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return a;
}
