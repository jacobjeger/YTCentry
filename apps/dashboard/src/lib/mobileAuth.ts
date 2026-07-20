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

/** Resolve the bearer token on a request to an active StaffUser, or null. */
export async function bearerUser(req: Request): Promise<StaffUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const claims = await verifyToken(match[1].trim());
  if (!claims) return null;
  return userFromClaims(claims);
}

/** Standard 401 JSON response for the mobile API. */
export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
