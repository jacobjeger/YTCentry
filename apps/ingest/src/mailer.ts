/**
 * The one outbound mail path for this service.
 *
 * Both things we send — the "we couldn't read your attachment" reply and the
 * "they're set up at the door" confirmation — go to people who wrote to a
 * shared mailbox, so they share the same rules: one transport, one set of
 * addresses we refuse to write to, and a kill switch.
 */
import nodemailer from "nodemailer";
import type { IngestConfig } from "./config";

/**
 * Addresses we must never write to. Mailing an automated sender is how mail
 * loops start, and writing to our own mailbox would have us ingest our own
 * message as a fresh submission.
 */
const NEVER_MAIL = /(^|[.<@])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i;

/** The door scanner isn't a person and its "address" isn't one either. */
const DOOR = "door-scanner";

let transport: nodemailer.Transporter | null = null;

export function mailer(cfg: IngestConfig): nodemailer.Transporter {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return transport;
}

/** A short reason why this address is off-limits, or null when it's fine. */
export function refuseToMail(cfg: IngestConfig, to: string): string | null {
  const addr = (to ?? "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) return "no address";
  if (addr === DOOR) return "door scan";
  if (addr === cfg.user.toLowerCase()) return "own mailbox";
  if (NEVER_MAIL.test(addr)) return "automated sender";
  return null;
}
