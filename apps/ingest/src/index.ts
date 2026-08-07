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
import { replyUnusable } from "./reply";

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
const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);

/**
 * Walk the JPEG marker chain and confirm it reaches a frame header (SOF) and
 * then the scan (SOS).
 *
 * Merely spotting an SOF byte pair is not enough: in a few kB of arbitrary
 * binary an `FF Cx` pair turns up by chance, so a scan-for-bytes approach
 * happily "finds" images in random data. Following the segment lengths makes
 * that essentially impossible — every step must land exactly on a 0xFF.
 */
function looksLikeJpeg(b: Buffer): boolean {
  if (b.length < 1024 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  let i = 2;
  let sawFrame = false;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return false;
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; }              // fill byte
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; } // standalone
    if (m === 0xda) return sawFrame;                // start of scan
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2) return false;
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb)) {
      sawFrame = true;
    }
    i += 2 + len;
  }
  return false;
}

function jpegFromPdf(buf: Buffer): Uint8Array | null {
  // Preferred: anchor on the image filter, which bounds the search precisely.
  let from = 0;
  for (;;) {
    const marker = buf.indexOf("/DCTDecode", from, "latin1");
    if (marker < 0) break;
    const kw = buf.indexOf("stream", marker, "latin1");
    if (kw < 0) break;
    let start = kw + "stream".length;
    if (buf[start] === 0x0d) start++; // CR
    if (buf[start] === 0x0a) start++; // LF

    const end = buf.indexOf("endstream", start, "latin1");
    if (end > start) {
      // Trust the JPEG's own markers over the stream bounds — some writers pad.
      const soi = buf.indexOf(SOI, start);
      if (soi >= start && soi < end) {
        const eoi = buf.lastIndexOf(EOI, end);
        if (eoi > soi) return new Uint8Array(buf.subarray(soi, eoi + 2));
      }
    }
    from = marker + 1; // that one didn't pan out — try the next image
  }

  // Fallback: no plain "/DCTDecode" anywhere. Modern writers put image
  // dictionaries inside compressed object streams, so the filter name isn't
  // visible as text — but the JPEG payload itself is never compressed again
  // and still sits in the file verbatim. Scan for it and take the largest
  // candidate that actually parses as a JPEG frame.
  let best: Buffer | null = null;
  let at = buf.indexOf(SOI);
  while (at >= 0) {
    const eoi = buf.indexOf(EOI, at + 2);
    if (eoi < 0) break;
    const candidate = buf.subarray(at, eoi + 2);
    if (looksLikeJpeg(candidate) && (!best || candidate.length > best.length)) {
      best = candidate;
    }
    at = buf.indexOf(SOI, eoi + 2);
  }
  return best ? new Uint8Array(best) : null;
}

/** What a PDF we couldn't read actually contains — so a failure is diagnosable
 *  instead of just "image=NONE". */
function describePdf(buf: Buffer): string {
  const filters = ["/DCTDecode", "/JPXDecode", "/FlateDecode", "/CCITTFaxDecode", "/JBIG2Decode"]
    .filter((f) => buf.indexOf(f, 0, "latin1") >= 0)
    .join(" ");
  return `${(buf.length / 1024).toFixed(0)}kB filters=[${filters || "none-visible"}] soi=${buf.indexOf(SOI) >= 0} enc=${buf.indexOf("/Encrypt", 0, "latin1") >= 0}`;
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
      const pdf = a.content as Buffer;
      const jpeg = jpegFromPdf(pdf);
      if (jpeg) return { bytes: jpeg, mime: "image/jpeg" };
      console.log(`[ingest] pdf "${a.filename ?? "?"}" no JPEG inside — ${describePdf(pdf)}`);
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

        // Ask the sender for a usable photo. Only on the transition to
        // "unusable" (i.e. the row was just created), so one reply per email.
        if (res.status === "unusable") {
          try {
            const why = await replyUnusable(cfg, {
              to: incoming.from,
              subject: incoming.subject,
              messageId: c.messageId,
              attached: (incoming.attachments ?? [])
                .map((a) => (a.name ? `${a.name} (${a.type})` : a.type))
                .join(", "),
            });
            console.log(
              why
                ? `[ingest] no reply sent to ${incoming.from} — ${why}`
                : `[ingest] asked ${incoming.from} to resend as a photo`,
            );
          } catch (e) {
            // A failed reply must not fail the ingestion — the queue entry is
            // still there for staff either way.
            console.warn("[ingest] reply failed:", e instanceof Error ? e.message : e);
          }
        }
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
