/**
 * Auth helpers used by Server Components / Actions / Route Handlers.
 * Password hashing is argon2 (CLAUDE.md). Guard helpers redirect or throw so a
 * page/route can require a role in one line.
 */
import "server-only";
import { redirect } from "next/navigation";
import argon2 from "argon2";
import { prisma, type StaffUser } from "@ytc/core";
import { getCurrentUser } from "./session";
import { getAccess, logDenied } from "./access";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Authenticate by email+password. Returns the user or null. Honors `active`. */
export async function authenticate(
  email: string,
  password: string,
): Promise<StaffUser | null> {
  const user = await prisma.staffUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.active) return null;
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? user : null;
}

/** Require any logged-in, active user. Redirects to /login otherwise. */
export async function requireUser(): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an admin — a local ADMIN, or a portal session with admin rights.
 *  Redirects non-admins to the dashboard home (logging the refusal). */
export async function requireAdmin(): Promise<StaffUser> {
  const a = await getAccess();
  if (!a) redirect("/login");
  if (!a.isAdmin) {
    await logDenied(a, "admin", { perm: "admin" });
    redirect("/");
  }
  return a.user;
}
