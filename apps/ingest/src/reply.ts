/**
 * Auto-reply to a sender whose attachment we couldn't read.
 *
 * Recording the problem in the Review Queue tells staff, but the person who
 * sent it is the only one who can fix it — and they're sitting there assuming
 * it went through. This asks them directly, as a threaded reply.
 *
 * Sent exactly once per message: the caller only invokes it when the
 * PhotoSubmission row was newly created, and that row's unique gmailMessageId
 * stops the message being handled twice.
 */
import nodemailer from "nodemailer";
import type { IngestConfig } from "./config";

/**
 * Addresses we must never reply to. Auto-replying to an automated sender is
 * how mail loops start, and replying to our own mailbox would have us ingest
 * our own message.
 */
const NEVER_REPLY = /(^|[.<@])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i;

let transport: nodemailer.Transporter | null = null;

function mailer(cfg: IngestConfig): nodemailer.Transporter {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return transport;
}

export interface UnusableReply {
  to: string;
  subject: string;
  /** original Message-ID, so the reply threads under it */
  messageId: string;
  /** what they actually attached, e.g. 'photo.pdf (application/pdf)' */
  attached: string;
}

/** Returns a short reason when it deliberately didn't send, else null. */
export async function replyUnusable(
  cfg: IngestConfig,
  msg: UnusableReply,
): Promise<string | null> {
  if (process.env.REPLY_TO_UNUSABLE === "false") return "disabled";

  const to = msg.to.trim().toLowerCase();
  if (!to || !to.includes("@")) return "no address";
  if (to === cfg.user.toLowerCase()) return "own mailbox";
  if (NEVER_REPLY.test(to)) return "automated sender";

  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject || "Photo"}`;
  const text = [
    "Hello,",
    "",
    "Thank you for sending this in. Unfortunately we weren't able to read a",
    "photo from your email — this attachment isn't in a format we can use:",
    "",
    `    ${msg.attached}`,
    "",
    "Could you reply to this email with the picture attached as a photo file",
    "(JPEG or PNG)? Taking it with your phone camera and attaching it directly",
    "works best. A PDF or a scanned document usually doesn't.",
    "",
    "Thank you.",
  ].join("\n");

  await mailer(cfg).sendMail({
    from: cfg.user,
    to: msg.to,
    subject,
    text,
    inReplyTo: msg.messageId,
    references: msg.messageId,
  });
  return null;
}
