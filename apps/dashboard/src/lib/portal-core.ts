/**
 * YTC central portal (SSO) — the pure, framework-free part.
 *
 * No "server-only", no Prisma, no Next imports, so scripts/make-test-token.ts
 * can exercise exactly the code production runs. The Next-facing glue lives in
 * lib/portal.ts and lib/access.ts.
 */
import { importSPKI, jwtVerify, errors as joseErrors, type KeyLike } from "jose";

// ── Permissions ──────────────────────────────────────────────────────────────

/** Every permission this site understands. Keys: letters/digits/_ only. */
export const PERMS = [
  "view",
  "enroll",
  "review",
  "roster",
  "edit_access",
  "remove",
  "temp_pins",
  "logs",
  "admin",
] as const;
export type Perm = (typeof PERMS)[number];

export function isPerm(p: unknown): p is Perm {
  return typeof p === "string" && (PERMS as readonly string[]).includes(p);
}

/**
 * What a LOCAL (email + password) STAFF login can do today: everything outside
 * /admin. ADMIN gets everything. Kept here so the local mapping is in one place
 * and never drifts from what those people had before the portal existed.
 */
export const LOCAL_STAFF_PERMS: readonly Perm[] = [
  "view",
  "enroll",
  "review",
  "roster",
  "edit_access",
  "remove",
  "temp_pins",
];

export interface AccessShape {
  isAdmin: boolean;
  perms: ReadonlySet<Perm>;
  /** null = every door; otherwise the door KEYS this person may act on. */
  doorKeys: readonly string[] | null;
}

/** Admin implies all. */
export function hasPerm(a: AccessShape, perm: Perm): boolean {
  return a.isAdmin || a.perms.has(perm);
}

/**
 * Resolve a stored portal `scope` claim to door keys.
 *   scope missing / no `doors` key          → null (every door)
 *   scope.doors not a list                  → [] (no doors — fail closed)
 *   scope.doors names no known door         → [] (no doors)
 *   otherwise                               → the known keys it names
 * Admins are never limited (caller handles that).
 */
export function resolveScopeDoors(
  scope: unknown,
  knownDoorKeys: readonly string[],
): string[] | null {
  if (scope === null || scope === undefined) return null;
  if (typeof scope !== "object" || Array.isArray(scope)) return [];
  if (!("doors" in scope)) return null;
  const doors = (scope as { doors: unknown }).doors;
  if (doors === undefined) return null;
  if (!Array.isArray(doors)) return [];
  // Accept the manifest form ("kitchen_back") or the raw door key ("kitchen-back").
  const byScopeKey = new Map<string, string>();
  for (const k of knownDoorKeys) {
    byScopeKey.set(k, k);
    byScopeKey.set(doorScopeKey(k), k);
  }
  const out = doors
    .filter((d): d is string => typeof d === "string")
    .map((d) => byScopeKey.get(d))
    .filter((k): k is string => !!k);
  return [...new Set(out)];
}

/** A door key as published in the manifest: letters/digits/_ only. */
export function doorScopeKey(doorKey: string): string {
  return doorKey.replace(/[^A-Za-z0-9_]/g, "_");
}

export function buildAccess(input: {
  via: "local" | "portal";
  role: "ADMIN" | "STAFF";
  portalIsAdmin: boolean;
  portalPerms: readonly string[];
  portalScope: unknown;
  knownDoorKeys: readonly string[];
}): AccessShape {
  if (input.via === "local") {
    const isAdmin = input.role === "ADMIN";
    return {
      isAdmin,
      perms: new Set(isAdmin ? PERMS : LOCAL_STAFF_PERMS),
      doorKeys: null,
    };
  }
  const perms = new Set(input.portalPerms.filter(isPerm));
  // role:"admin" and the `admin` permission both mean full, unscoped access —
  // an admin can add and delete doors, so a door scope would be meaningless.
  const isAdmin = input.portalIsAdmin || perms.has("admin");
  return {
    isAdmin,
    perms: isAdmin ? new Set(PERMS) : perms,
    doorKeys: isAdmin ? null : resolveScopeDoors(input.portalScope, input.knownDoorKeys),
  };
}

/** HTTP status for a permission check — what an API route returns. */
export function permStatus(a: AccessShape | null, perm: Perm): 200 | 401 | 403 {
  if (!a) return 401;
  return hasPerm(a, perm) ? 200 : 403;
}

// ── Redirect target ──────────────────────────────────────────────────────────

/** Only a path starting with a single "/" (no "//", no "/\", no control chars). */
export function safeNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (next.length > 2000) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  return next;
}

// ── Token verification ───────────────────────────────────────────────────────

export const PORTAL_ISSUER = "ytc-portal";
export const PORTAL_AUDIENCE = "doors";

export interface PortalClaims {
  sub: string;
  email: string;
  name: string;
  role: "admin" | "user";
  perms: string[];
  lang: "he" | "en";
  jti: string;
  /** Raw scope claim; undefined when absent. */
  scope: unknown;
}

/** Short, user-facing reason codes. Never contain token material. */
export type PortalFailCode =
  | "missing_token"
  | "not_configured"
  | "expired"
  | "invalid_token"
  | "bad_claims"
  | "reused"
  | "disabled"
  | "error";

export class PortalSsoError extends Error {
  constructor(public code: PortalFailCode) {
    super(code);
  }
}

/** Env vars often store the PEM with literal "\n". */
export function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}

const keyCache = new Map<string, Promise<KeyLike>>();
export function loadPortalKey(rawPem: string | undefined): Promise<KeyLike> {
  if (!rawPem || !rawPem.trim()) throw new PortalSsoError("not_configured");
  const pem = normalizePem(rawPem);
  let p = keyCache.get(pem);
  if (!p) {
    p = importSPKI(pem, "RS256");
    p.catch(() => keyCache.delete(pem));
    keyCache.set(pem, p);
  }
  return p;
}

/** A store of redeemed jtis. `claim` must be atomic: true the first time only. */
export interface JtiStore {
  claim(jti: string): Promise<boolean>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verify a portal hand-off token and burn its jti. Throws PortalSsoError.
 * Checks: RS256 only, iss=ytc-portal, aud=doors, exp (±30 s), and that the
 * token is genuinely short-lived (exp no more than 5 min out).
 */
export async function verifyPortalToken(
  token: string | null | undefined,
  opts: { publicKeyPem: string | undefined; jtiStore: JtiStore; now?: Date },
): Promise<PortalClaims> {
  if (!token || typeof token !== "string" || token.length > 8192) {
    throw new PortalSsoError("missing_token");
  }
  const key = await loadPortalKey(opts.publicKeyPem).catch((e) => {
    throw e instanceof PortalSsoError ? e : new PortalSsoError("not_configured");
  });

  let payload: Record<string, unknown>;
  try {
    const res = await jwtVerify(token, key, {
      issuer: PORTAL_ISSUER,
      audience: PORTAL_AUDIENCE,
      algorithms: ["RS256"],
      clockTolerance: 30,
      requiredClaims: ["exp", "sub", "jti"],
      currentDate: opts.now,
    });
    payload = res.payload as Record<string, unknown>;
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw new PortalSsoError("expired");
    throw new PortalSsoError("invalid_token");
  }

  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (typeof payload.exp !== "number" || payload.exp - nowSec > 300) {
    throw new PortalSsoError("invalid_token"); // not a one-time hand-off token
  }

  const emailRaw =
    typeof payload.email === "string"
      ? payload.email
      : typeof payload.username === "string"
        ? payload.username
        : "";
  const email = emailRaw.trim().toLowerCase();
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  if (!EMAIL_RE.test(email) || !sub || !jti || jti.length > 200) {
    throw new PortalSsoError("bad_claims");
  }

  const role = payload.role === "admin" ? "admin" : "user";
  const perms = Array.isArray(payload.perms)
    ? payload.perms.filter((p): p is string => typeof p === "string" && /^[A-Za-z0-9_]+$/.test(p))
    : [];
  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim().slice(0, 200)
      : email;
  const lang = payload.lang === "en" ? "en" : "he";

  // Burn the jti last, so a token that fails any check above can't be used to
  // pre-burn someone else's id — and a valid one can never be used twice.
  if (!(await opts.jtiStore.claim(jti))) throw new PortalSsoError("reused");

  return { sub, email, name, role, perms, lang, jti, scope: payload.scope };
}
