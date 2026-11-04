/**
 * Dashboard-side audit: the core `audit()` plus who/where context on every row
 * — the actor's email and (portal) name, the client IP, and whether the session
 * came through the portal. Same signature as core `audit`, so call sites only
 * change their import.
 */
import "server-only";
import { headers } from "next/headers";
import { prisma, audit as coreAudit, type AuditAction } from "@ytc/core";
import { readClaims } from "./session";

export type { AuditAction };

/** Client IP as seen through Railway's proxy (first X-Forwarded-For hop). */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim().slice(0, 64) || null;
    return h.get("x-real-ip")?.trim().slice(0, 64) || null;
  } catch {
    return null; // outside a request (shouldn't happen in the dashboard)
  }
}

export async function audit(opts: {
  actorId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const ip = await requestIp();
  let actor: { email: string; name: string; portalName: string | null } | null = null;
  if (opts.actorId) {
    actor = await prisma.staffUser
      .findUnique({
        where: { id: opts.actorId },
        select: { email: true, name: true, portalName: true },
      })
      .catch(() => null);
  }
  let via: string | undefined;
  try {
    via = (await readClaims())?.src;
  } catch {
    via = undefined;
  }
  try {
    await coreAudit({
      ...opts,
      meta: {
        ...(opts.meta ?? {}),
        ...(ip ? { ip } : {}),
        ...(actor
          ? { actorEmail: actor.email, actorName: actor.portalName ?? actor.name }
          : {}),
        ...(via && !(opts.meta && "via" in opts.meta) ? { via } : {}),
      },
    });
  } catch (e) {
    // Never let a logging hiccup undo the change it describes.
    console.error("[audit] write failed", opts.action, e);
  }
}
