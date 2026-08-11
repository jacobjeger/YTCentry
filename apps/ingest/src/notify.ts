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

/**
 * "Greenberg, Shua" → "Shua Greenberg".
 *
 * Names are stored as staff typed them, and surname-first is common — which
 * reads badly mid-sentence ("Greenberg, Shua has successfully been added").
 * Only a single comma is rearranged; anything else is left exactly as stored.
 */
function readableName(name: string): string {
  const parts = name.split(",");
  if (parts.length !== 2) return name.trim();
  const [last, first] = parts.map((p) => p.trim());
  return last && first ? `${first} ${last}` : name.trim();
}

function body(name: string): string {
  return [
    "Hello,",
    "",
    `${name} has successfully been added to the Toras Chaim front door`,
    "entrance system. The photo you submitted is now on file and access is",
    "active.",
    "",
    "If you have an issue getting in, please reply to this email.",
    "",
    "Thank you.",
  ].join("\n");
}

/**
 * Subject for a reply that actually lands in their existing thread.
 *
 * The In-Reply-To/References headers alone are not enough: Gmail also keys on
 * the subject, so a new one starts a fresh conversation no matter what the
 * headers say. Reusing their subject with "Re:" is what keeps the confirmation
 * attached to the email they sent.
 */
function replySubject(original: string | null | undefined, name: string): string {
  const subj = (original ?? "").trim();
  if (!subj) return `Door access active — ${name}`;
  return /^re:/i.test(subj) ? subj : `Re: ${subj}`;
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

    // Their original subject, so the confirmation lands in the thread they
    // started rather than as a separate conversation.
    const original = e.notifyMessageId
      ? await prisma.photoSubmission.findUnique({
          where: { gmailMessageId: e.notifyMessageId },
          select: { subjectRaw: true },
        })
      : null;

    try {
      await mailer(cfg).sendMail({
        from: cfg.user,
        to: e.notifyEmail!,
        subject: replySubject(original?.subjectRaw, readableName(e.displayName)),
        text: body(readableName(e.displayName)),
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
