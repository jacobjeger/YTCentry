/**
 * Session handling — signed JWT in an httpOnly cookie. No email provider, no
 * magic links: admins create logins and hand out passwords (see CLAUDE.md
 * "Auth"). jose is used because it runs in both the Node and the Proxy (edge)
 * runtimes, so the same verification works everywhere.
 *
 * The cookie carries only id/email/role for fast checks. `getCurrentUser()`
 * re-reads the StaffUser so a disabled (`active:false`) login is rejected
 * immediately, even with a still-valid cookie.
 */
import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma, type Role } from "@ytc/core";

const COOKIE = "ytc_session";
const MAX_AGE = 60 * 60 * 12; // 12h
/** Phone app tokens live longer — re-logging-in every 12h on a phone is painful.
 *  A lost phone is handled by disabling the StaffUser (checked on every request). */
const MOBILE_MAX_AGE = 60 * 60 * 24 * 30; // 30d

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export interface SessionClaims {
  sub: string; // StaffUser.id
  email: string;
  role: Role;
}

/** Sign a session JWT and return the raw string (no cookie). Used by the mobile
 *  bearer API; the web cookie path calls createSession which wraps this. */
export async function signSessionToken(
  user: { id: string; email: string; role: Role },
  maxAgeSec: number = MAX_AGE,
): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret());
}

/** The 30-day token minted for the native phone app. */
export function signMobileToken(user: {
  id: string;
  email: string;
  role: Role;
}): Promise<string> {
  return signSessionToken(user, MOBILE_MAX_AGE);
}

/** Verify a raw JWT string (cookie value or bearer token). Returns claims or null. */
export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || !payload.role) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Re-read the StaffUser for verified claims and confirm it's still active.
 *  Shared by the cookie and bearer paths so a disabled login is rejected at once. */
export async function userFromClaims(claims: SessionClaims) {
  const user = await prisma.staffUser.findUnique({ where: { id: claims.sub } });
  if (!user || !user.active) return null;
  return user;
}

export async function createSession(user: {
  id: string;
  email: string;
  role: Role;
}): Promise<void> {
  const token = await signSessionToken(user, MAX_AGE);

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Verify the cookie JWT only (no DB hit). Returns claims or null. */
export async function readClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Full check: verify cookie AND confirm the StaffUser is still active. */
export async function getCurrentUser() {
  const claims = await readClaims();
  if (!claims) return null;
  return userFromClaims(claims);
}

export const SESSION_COOKIE = COOKIE;
