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

/** How this session was started. "portal" = /portal-sso; anything else is a
 *  normal email + password sign-in (old cookies carry no `src` → local). */
export type SessionSource = "local" | "portal";

export interface SessionClaims {
  sub: string; // StaffUser.id
  email: string;
  role: Role;
  src: SessionSource;
}

/** Sign a session JWT and return the raw string (no cookie). Used by the mobile
 *  bearer API; the web cookie path calls createSession which wraps this. */
export async function signSessionToken(
  user: { id: string; email: string; role: Role },
  maxAgeSec: number = MAX_AGE,
  src: SessionSource = "local",
): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, ...(src === "portal" ? { src } : {}) })
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
      src: payload.src === "portal" ? "portal" : "local",
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

/**
 * Cookie attributes. The site is shown inside the YTC portal's iframe, which is
 * a cross-site context for most portal addresses, so in production the cookie
 * is `SameSite=None; Secure; HttpOnly; Partitioned` (CHIPS) — otherwise Chrome
 * and Safari drop it inside the frame. Server Actions keep Next's built-in
 * Origin/Host check, so SameSite=None does not open them to CSRF.
 * Plain http in development can't carry SameSite=None, so dev stays Lax.
 */
export function sessionCookieOptions(maxAge: number = MAX_AGE) {
  const prod = process.env.NODE_ENV === "production";
  return prod
    ? ({ httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/", maxAge } as const)
    : ({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge } as const);
}

export async function createSession(
  user: { id: string; email: string; role: Role },
  src: SessionSource = "local",
): Promise<void> {
  const token = await signSessionToken(user, MAX_AGE, src);
  const store = await cookies();
  store.set(COOKIE, token, sessionCookieOptions(MAX_AGE));
}

/**
 * Clear the session from a Server Action. Clears the current (partitioned)
 * cookie. A route handler should prefer `clearSessionHeaders()`, which also
 * removes a pre-portal, unpartitioned cookie (browsers keep the two apart).
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, "", sessionCookieOptions(0));
}

/** Raw Set-Cookie values that expire BOTH the partitioned cookie and any
 *  legacy unpartitioned one, for a route handler response. */
export function clearSessionHeaders(): string[] {
  const base = `${COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`;
  if (process.env.NODE_ENV !== "production") return [`${base}; SameSite=Lax`];
  return [
    `${base}; Secure; SameSite=None; Partitioned`,
    `${base}; Secure; SameSite=Lax`,
  ];
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
