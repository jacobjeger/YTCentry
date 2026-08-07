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

/**
 * Pull the first embedded JPEG out of a PDF.
 *
 * Parents send photos as PDFs constantly — "Print to PDF", a scanner app, or
 * iOS wrapping an image on share. Those PDFs don't re-encode: the original
 * JPEG sits in the file verbatim as a /DCTDecode stream, so it can be lifted
 * out byte-for-byte with no rasterizer and no new dependency.
 *
 * Returns null for PDFs that hold no JPEG (vector or a Flate/JPX-coded bitmap);
 * those genuinely need rendering, which is out of scope here.
 */
function jpegFromPdf(buf: Buffer): Uint8Array | null {
  let from = 0;
  for (;;) {
    const marker = buf.indexOf("/DCTDecode", from, "latin1");
    if (marker < 0) return null;

    // The stream data starts after the next `stream` keyword and its EOL.
    const kw = buf.indexOf("stream", marker, "latin1");
    if (kw < 0) return null;
    let start = kw + "stream".length;
    if (buf[start] === 0x0d) start++; // CR
    if (buf[start] === 0x0a) start++; // LF

    const end = buf.indexOf("endstream", start, "latin1");
    if (end > start) {
      // Trust the JPEG's own markers over the stream bounds — some writers pad.
      const soi = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), start);
      if (soi >= start && soi < end) {
        const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9]), end);
        if (eoi > soi) return new Uint8Array(buf.subarray(soi, eoi + 2));
      }
    }
    from = marker + 1; // that one didn't pan out — try the next image
  }
}

/** Find a face image in a message: a file/inline attachment, a JPEG embedded in
 *  a PDF attachment, else a base64 data: URI in the HTML body (pasted photos). */
function extractImage(parsed: ParsedMail): { bytes: Uint8Array; mime: string } | null {
  for (const a of parsed.attachments ?? []) {
    if (a.contentType?.startsWith("image/") && a.content) {
      return { bytes: new Uint8Array(a.content), mime: a.contentType };
    }
  }
  for (const a of parsed.attachments ?? []) {
    if (a.contentType === "application/pdf" && a.content) {
      const jpeg = jpegFromPdf(a.content as Buffer);
      if (jpeg) return { bytes: jpeg, mime: "image/jpeg" };
    }
  }
  const html = parsed.html || "";
  const m = html.match(/data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/i);
  if (m) {
    return { bytes: new Uint8Array(Buffer.from(m[2]!, "base64")), mime: m[1]! };
  }
  return null;
}

/**
 * Messages we looked at and could do nothing with (no image anywhere).
 *
 * Dedup normally rides on a PhotoSubmission row, but a skipped message never
 * creates one — so every poll re-fetched and re-parsed it forever. One PDF-only
 * email was being re-read every cycle, filling the log and doing the work again
 * each time. In memory is enough: on restart it is re-examined once, which is
 * exactly what we want after a deploy that can handle a new attachment type.
 */
const skipped = new Set<string>();

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
    const fresh = candidates.filter(
      (c) => !seen.has(c.messageId) && !skipped.has(c.messageId),
    );

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
          attachments: (parsed.attachments ?? []).map((a) => ({
            type: a.contentType ?? "unknown",
            name: a.filename,
          })),
        };
        const res = await processMessage(incoming);
        // Only remember genuinely unrecorded messages; an "unusable" one now
        // has a row and dedupes on its own.
        if (res.status === "skipped_no_image") skipped.add(c.messageId);
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
