/**
 * Tell the person who emailed a photo in that it reached the door.
 *
 * Driven off Enrollee state, NOT off the code that pushes. Six separate places
 * set status to PUSHED — the dashboard enroll, a directory photo replace, three
 * paths in the store-and-forward retry, and the PushJob queue — and the one
 * that matters most fires hours later, when a door outage clears. A send hooked
 * onto any single call site would silently miss exactly that case, so this
 * polls for "live on the door, not yet told" instead.
 *
 * `notifiedAt` makes it idempotent; `notifyAttempts` stops a dead address being
 * retried forever. Sent in English and unsigned, matching the auto-reply.
 */
import { prisma } from "@ytc/core";
import type { IngestConfig } from "./config";
import { mailer, refuseToMail } from "./mailer";

/** After this many failed sends, stop trying and leave it for a human. */
const MAX_ATTEMPTS = 3;

function body(name: string): string {
  return [
    "Hello,",
    "",
    `${name} is now set up at the door. The photo you sent has been added, and`,
    "the door will recognize them from now on.",
    "",
    "If it doesn't work, or the picture needs changing, reply to this email and",
    "we'll take another look.",
    "",
    "Thank you.",
  ].join("\n");
}

/** Returns how many confirmations were sent. */
export async function notifyEnrolled(cfg: IngestConfig, limit = 25): Promise<number> {
  if (process.env.NOTIFY_ON_ENROLL === "false") return 0;

  const pending = await prisma.enrollee.findMany({
    where: {
      status: "PUSHED",
      notifiedAt: null,
      notifyEmail: { not: null },
      notifyAttempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { pushedAt: "asc" },
    take: limit,
  });
  if (pending.length === 0) return 0;

  let sent = 0;
  for (const e of pending) {
    const refusal = refuseToMail(cfg, e.notifyEmail!);
    if (refusal) {
      // Never going to be sendable — settle it now rather than re-checking it
      // on every cycle for the life of the row.
      await prisma.enrollee.update({
        where: { id: e.id },
        data: { notifiedAt: new Date(), notifyAttempts: MAX_ATTEMPTS },
      });
      console.log(`[notify] skipped ${e.displayName} — ${refusal}`);
      continue;
    }

    try {
      await mailer(cfg).sendMail({
        from: cfg.user,
        to: e.notifyEmail!,
        subject: `${e.displayName} is set up at the door`,
        text: body(e.displayName),
        // Thread under their original email so it reads as a reply to the
        // photo they sent, not as mail out of nowhere.
        ...(e.notifyMessageId
          ? { inReplyTo: e.notifyMessageId, references: e.notifyMessageId }
          : {}),
      });
      await prisma.enrollee.update({
        where: { id: e.id },
        data: { notifiedAt: new Date(), notifyAttempts: { increment: 1 } },
      });
      sent++;
      console.log(`[notify] told ${e.notifyEmail} that ${e.displayName} is on the door`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.enrollee.update({
        where: { id: e.id },
        data: { notifyAttempts: { increment: 1 } },
      });
      // Loud on every failure — a confirmation that silently never goes out is
      // indistinguishable from one that was never attempted.
      console.warn(
        `[notify fail] ${e.displayName} → ${e.notifyEmail} (attempt ${e.notifyAttempts + 1}/${MAX_ATTEMPTS}): ${msg}`,
      );
    }
  }
  return sent;
}
