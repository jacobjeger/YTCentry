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
import { prisma } from "@ytc/core";
import { loadConfig, type IngestConfig } from "./config";
import { processMessage, type IncomingMessage } from "./processMessage";

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Find a face image in a message: a file/inline attachment, else a base64
 *  data: URI embedded in the HTML body (pasted/inserted photos). */
function extractImage(parsed: ParsedMail): { bytes: Uint8Array; mime: string } | null {
  for (const a of parsed.attachments ?? []) {
    if (a.contentType?.startsWith("image/") && a.content) {
      return { bytes: new Uint8Array(a.content), mime: a.contentType };
    }
  }
  const html = parsed.html || "";
  const m = html.match(/data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/i);
  if (m) {
    return { bytes: new Uint8Array(Buffer.from(m[2]!, "base64")), mime: m[1]! };
  }
  return null;
}

/** Process recent messages (any read state) on an already-open mailbox, deduped
 *  on Message-ID so re-scans are harmless. */
let processing = false;
async function processNew(client: ImapFlow, cfg: IngestConfig): Promise<void> {
  if (processing) return; // avoid overlapping runs from rapid 'exists' events
  processing = true;
  try {
    const since = new Date(Date.now() - cfg.sinceDays * 86400000);
    const uids = await client.search({ since }, { uid: true });
    if (!uids || uids.length === 0) return;

    // Cheap pass: get Message-IDs from envelopes, skip already-ingested.
    const candidates: { uid: number; messageId: string }[] = [];
    for await (const m of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
      candidates.push({
        uid: m.uid,
        messageId: m.envelope?.messageId ?? `uid-${m.uid}-${cfg.user}`,
      });
    }
    const seen = new Set(
      (
        await prisma.photoSubmission.findMany({
          where: { gmailMessageId: { in: candidates.map((c) => c.messageId) } },
          select: { gmailMessageId: true },
        })
      ).map((r) => r.gmailMessageId),
    );
    const fresh = candidates.filter((c) => !seen.has(c.messageId));

    for (const c of fresh) {
      try {
        const msg = await client.fetchOne(c.uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = (await simpleParser(msg.source)) as ParsedMail;
        const img = extractImage(parsed);
        // Diagnostic: what does this message actually contain?
        const attTypes = (parsed.attachments ?? []).map((a) => a.contentType).join(",");
        console.log(
          `[ingest] candidate "${parsed.subject}" atts=[${attTypes}] htmlDataUri=${/data:image\//i.test(parsed.html || "")} image=${img ? img.mime : "NONE"}`,
        );
        const incoming: IncomingMessage = {
          messageId: c.messageId,
          from: parsed.from?.value?.[0]?.address ?? "unknown",
          subject: parsed.subject ?? "",
          image: img?.bytes ?? null,
          imageMime: img?.mime,
        };
        const res = await processMessage(incoming);
        console.log(`[ingest] "${incoming.subject}" → ${res.status} ${res.decision ?? ""}`);
      } catch (e) {
        console.warn(`[ingest] message uid ${c.uid} failed:`, e);
      }
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

      await processNew(client, cfg); // backlog on (re)connect

      // React to new mail (imapflow auto-IDLEs and emits 'exists').
      client.on("exists", () => {
        processNew(client, cfg).catch((e) =>
          console.warn("[ingest] processNew error:", e),
        );
      });

      // Also poll on an interval as a belt-and-suspenders against missed pushes.
      while (running && client.usable) {
        await sleep(cfg.pollMs);
        if (running && client.usable) await processNew(client, cfg);
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
