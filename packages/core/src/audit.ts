/**
 * Append-only audit trail. CLAUDE.md: "full AuditLog on enroll / push / remove".
 * Every mutation funnels through here so there is one place to see who did what.
 */
import { prisma } from "./db";

export type AuditAction =
  | "enrollee.create"
  | "enrollee.update"
  | "enrollee.remove"
  | "face.push"
  | "face.replace"
  | "push.requeue"
  | "submission.approve"
  | "submission.reject"
  | "submission.reassign"
  | "roster.upload"
  | "staff.create"
  | "staff.disable"
  | "auth.login";

export async function audit(opts: {
  actorId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      meta: (opts.meta ?? {}) as object,
    },
  });
}
