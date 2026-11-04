/**
 * Permissions + door scope, enforced on the SERVER in every page, Server Action
 * and route handler (Server Actions are public endpoints — each one checks the
 * caller itself; hiding a button is only cosmetic).
 *
 *   local sign-in  → today's access: ADMIN = everything, STAFF = all but /admin
 *   portal sign-in → the `perms` / `scope` the portal sent (stored on the user,
 *                    refreshed on every portal sign-in). Admin implies all.
 */
import "server-only";
import { redirect } from "next/navigation";
import { prisma, type StaffUser } from "@ytc/core";
import { readClaims, userFromClaims, type SessionSource } from "./session";
import { buildAccess, hasPerm, type AccessShape, type Perm } from "./portal-core";
import { audit } from "./audit";

export type { Perm };

export interface Access extends AccessShape {
  user: StaffUser;
  via: SessionSource;
  /** Portal name in a portal session, otherwise the local name. */
  displayName: string;
}

async function knownDoorKeys(): Promise<string[]> {
  const rows = await prisma.device.findMany({ select: { key: true } });
  return rows.map((r) => r.key);
}

/** Build access for a known user + session source (also used by the bearer API). */
export async function accessForUser(user: StaffUser, via: SessionSource): Promise<Access> {
  const shape = buildAccess({
    via,
    role: user.role,
    portalIsAdmin: user.portalIsAdmin,
    portalPerms: user.portalPerms ?? [],
    portalScope: user.portalScope,
    knownDoorKeys: via === "portal" ? await knownDoorKeys() : [],
  });
  return {
    ...shape,
    user,
    via,
    displayName: (via === "portal" ? user.portalName : null) ?? user.name,
  };
}

/** The signed-in caller's access, or null when not signed in / disabled. */
export async function getAccess(): Promise<Access | null> {
  const claims = await readClaims();
  if (!claims) return null;
  const user = await userFromClaims(claims);
  if (!user) return null;
  return accessForUser(user, claims.src);
}

/** Signed in at all (any permission). Redirects to /login otherwise. */
export async function requireAccess(): Promise<Access> {
  const a = await getAccess();
  if (!a) redirect("/login");
  return a;
}

export function can(a: Access, perm: Perm): boolean {
  return hasPerm(a, perm);
}

/** Log a refused check. `what` is the page/action/route name. */
export async function logDenied(
  a: Access | null,
  what: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await audit({
    actorId: a?.user.id ?? null,
    action: "auth.denied",
    targetType: "Permission",
    targetId: what,
    meta,
  });
}

/**
 * For Server Actions: the caller's Access if they hold `perm`, else null (and
 * the refusal is logged). Not signed in → redirect to /login, as before.
 */
export async function authorize(perm: Perm, what: string): Promise<Access | null> {
  const a = await requireAccess();
  if (can(a, perm)) return a;
  await logDenied(a, what, { perm });
  return null;
}

/** Like authorize, but any one of `perms` will do (e.g. door lists that several
 *  screens share). */
export async function authorizeAny(perms: Perm[], what: string): Promise<Access | null> {
  const a = await requireAccess();
  if (perms.some((p) => can(a, p))) return a;
  await logDenied(a, what, { perm: perms.join("|") });
  return null;
}

/** For pages: the caller's Access, or a redirect to /no-access. */
export async function requirePagePerm(perm: Perm, what: string): Promise<Access> {
  const a = await requireAccess();
  if (!can(a, perm)) {
    await logDenied(a, what, { perm });
    redirect("/no-access");
  }
  return a;
}

/** For route handlers: Access, or a 401/403 Response. */
export async function authorizeRoute(
  perm: Perm,
  what: string,
): Promise<Access | Response> {
  const a = await getAccess();
  if (!a) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!can(a, perm)) {
    await logDenied(a, what, { perm });
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return a;
}

// ── Door scope ───────────────────────────────────────────────────────────────

/** Device ids this caller may act on, or null for every door. */
export async function allowedDoorIds(a: Access): Promise<Set<string> | null> {
  if (a.isAdmin || a.doorKeys === null) return null;
  if (a.doorKeys.length === 0) return new Set();
  const rows = await prisma.device.findMany({
    where: { key: { in: [...a.doorKeys] } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function canUseDoor(a: Access, deviceId: string): Promise<boolean> {
  const allowed = await allowedDoorIds(a);
  return allowed === null || allowed.has(deviceId);
}

/** True when every one of `deviceIds` is in scope (an empty list is in scope). */
export async function canUseDoors(a: Access, deviceIds: string[]): Promise<boolean> {
  const allowed = await allowedDoorIds(a);
  return allowed === null || deviceIds.every((id) => allowed.has(id));
}

/** Keep only the doors in scope. */
export async function filterDoors<T extends { id: string }>(a: Access, doors: T[]): Promise<T[]> {
  const allowed = await allowedDoorIds(a);
  return allowed === null ? doors : doors.filter((d) => allowed.has(d.id));
}

/** The first active door this caller may use (the old "first door" default). */
export async function firstAllowedDoorId(a: Access): Promise<string | null> {
  const allowed = await allowedDoorIds(a);
  const first = await prisma.device.findFirst({
    where: { active: true, ...(allowed ? { id: { in: [...allowed] } } : {}) },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

/** Door check that logs the refusal. */
export async function requireDoors(
  a: Access,
  deviceIds: string[],
  what: string,
): Promise<boolean> {
  if (await canUseDoors(a, deviceIds)) return true;
  await logDenied(a, what, { scope: "doors", deviceIds });
  return false;
}

/** The doors an enrollee is on — used to scope actions on a whole person. */
export async function enrolleeDoorIds(enrolleeId: string): Promise<string[]> {
  const rows = await prisma.enrolleeDevice.findMany({
    where: { enrolleeId },
    select: { deviceId: true },
  });
  return rows.map((r) => r.deviceId);
}
