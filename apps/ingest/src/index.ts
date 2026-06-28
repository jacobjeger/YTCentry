/**
 * Gmail ingestion worker. Long-running Railway service. Never touches the LAN.
 *
 * Design: ONE persistent IMAP connection held open with IDLE, rather than a
 * connect/disconnect every poll — Gmail throttles frequent reconnects (it
 * accepts the login, then stalls the next command). We connect once, process the
 * backlog, then react to the 'exists' event (new mail) push. On any drop we
 * reconnect with a backoff. Idempotency: Message-ID unique + the \Seen flag.
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

/** Process all currently-unseen messages on an already-open mailbox. */
let processing = false;
async function processNew(client: ImapFlow, user: string): Promise<void> {
  if (processing) return; // avoid overlapping runs from rapid 'exists' events
  processing = true;
  try {
    const uids = await client.search({ seen: false }, { uid: true });
    if (!uids || uids.length === 0) return;
    for (const uid of uids) {
      try {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          continue;
        }
        const parsed = (await simpleParser(msg.source)) as ParsedMail;
        const img = firstImage(
          (parsed.attachments ?? []) as {
            contentType: string;
            content: Buffer;
            size?: number;
          }[],
        );
        const incoming: IncomingMessage = {
          messageId: parsed.messageId ?? `uid-${uid}-${user}`,
          from: parsed.from?.value?.[0]?.address ?? "unknown",
          subject: parsed.subject ?? "",
          image: img?.bytes ?? null,
          imageMime: img?.mime,
        };
        const res = await processMessage(incoming);
        if (res.status === "created") {
          console.log(`[ingest] ${incoming.from} "${incoming.subject}" → ${res.decision}`);
        }
      } catch (e) {
        console.warn(`[ingest] message uid ${uid} failed:`, e);
      }
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    }
  } finally {
    processing = false;
  }
}

async function watch(cfg: IngestConfig): Promise<void> {
  while (running) {
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: true,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
      // Long socket timeout: an IDLE connection is quiet for minutes.
      socketTimeout: 5 * 60 * 1000,
    });
    // Required, or an unhandled 'error' event crashes the process.
    client.on("error", (e: unknown) => {
      console.warn("[ingest] imap error:", e instanceof Error ? e.message : e);
    });

    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      console.log(`[ingest] connected, watching ${cfg.user}`);

      await processNew(client, cfg.user); // backlog on (re)connect

      // React to new mail (imapflow auto-IDLEs and emits 'exists').
      client.on("exists", () => {
        processNew(client, cfg.user).catch((e) =>
          console.warn("[ingest] processNew error:", e),
        );
      });

      // Also poll on an interval as a belt-and-suspenders against missed pushes.
      while (running && client.usable) {
        await sleep(cfg.pollMs);
        if (running && client.usable) await processNew(client, cfg.user);
      }
    } catch (e) {
      console.warn(
        "[ingest] connection lost:",
        e instanceof Error ? e.message : e,
      );
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
    if (running) await sleep(20000); // gentle backoff before reconnecting
  }
}

const cfg = loadConfig();
if (!cfg) {
  console.log("ytc ingest: GMAIL_USER/GMAIL_APP_PASSWORD not set — idling.");
  setInterval(() => {}, 1 << 30);
} else {
  console.log(`ytc ingest up — mailbox ${cfg.user}`);
  watch(cfg);
}
