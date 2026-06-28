/**
 * Gmail ingestion worker. Long-running Railway service. Never touches the LAN.
 *
 * Loop (~60s): connect IMAP → fetch UNSEEN messages → for each, extract the
 * first image, run processMessage() (dedupe + validate + match + write a
 * PhotoSubmission) → mark the message \Seen. Idempotency comes from the
 * Message-ID unique constraint plus the \Seen flag, so a re-poll is harmless.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { loadConfig, type IngestConfig } from "./config";
import { processMessage, type IncomingMessage } from "./processMessage";

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function firstImage(
  attachments: { contentType: string; content: Buffer; size?: number }[],
): { bytes: Uint8Array; mime: string } | null {
  for (const a of attachments) {
    if (a.contentType?.startsWith("image/")) {
      return { bytes: new Uint8Array(a.content), mime: a.contentType };
    }
  }
  return null;
}

async function pollOnce(cfg: IngestConfig): Promise<number> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  let processed = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ seen: false }, { uid: true });
    if (uids && uids.length) {
      for await (const message of client.fetch(
        uids,
        { source: true, envelope: true, uid: true },
        { uid: true },
      )) {
        try {
          if (!message.source) {
            await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
            continue;
          }
          const parsed = (await simpleParser(message.source)) as ParsedMail;
          const img = firstImage(
            (parsed.attachments ?? []) as {
              contentType: string;
              content: Buffer;
              size?: number;
            }[],
          );
          const msg: IncomingMessage = {
            messageId:
              parsed.messageId ?? `uid-${message.uid}-${cfg.user}`,
            from: parsed.from?.value?.[0]?.address ?? "unknown",
            subject: parsed.subject ?? "",
            image: img?.bytes ?? null,
            imageMime: img?.mime,
          };
          const res = await processMessage(msg);
          if (res.status === "created") {
            processed++;
            console.log(
              `[ingest] ${msg.from} "${msg.subject}" → ${res.decision}`,
            );
          }
        } catch (e) {
          console.warn(`[ingest] message ${message.uid} failed:`, e);
        }
        // Mark seen regardless so we don't re-fetch the same mail forever.
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return processed;
}

async function main(cfg: IngestConfig) {
  console.log(`ytc ingest up — mailbox ${cfg.user}`);
  while (running) {
    try {
      const n = await pollOnce(cfg);
      if (n) console.log(`[ingest] processed ${n} new submission(s)`);
    } catch (e) {
      console.error("[ingest] poll error:", e);
    }
    await sleep(cfg.pollMs);
  }
  console.log("ytc ingest shutting down");
}

const cfg = loadConfig();
if (!cfg) {
  // No Gmail creds yet — stay alive and idle so the deploy stays healthy. Set
  // GMAIL_USER + GMAIL_APP_PASSWORD to start polling (see .env.example).
  console.log("ytc ingest: GMAIL_USER/GMAIL_APP_PASSWORD not set — idling.");
  setInterval(() => {}, 1 << 30);
} else {
  main(cfg);
}
