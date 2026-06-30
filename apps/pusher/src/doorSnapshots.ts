/**
 * Door-snapshot enrollment. The E16C photographs every access attempt (Save
 * Picture is enabled). This polls the access log, finds unrecognized FACE scans
 * (people who tried but aren't enrolled), pulls the snapshot, and drops it into
 * the same Review Queue the emailed photos use — so staff can enroll straight
 * from a denied scan.
 *
 * Dedup: one PhotoSubmission per access-log id (gmailMessageId = "door-<id>").
 *
 * Filter CONFIRMED from a denied-scan capture (2026-06-28): a denied face is
 *   { type: 4, status: 1, userID: "-", name: "Visitor", picture: <file> }
 * vs a granted face (status 0, real userID). Denials get pushed past page 1 by
 * granted scans, so we page back a few pages each poll (dedup makes re-reads
 * harmless). ACCESS_LOG_STATUS can switch to a denied-only device filter if one
 * is confirmed.
 */
import {
  prisma,
  putPhoto,
  validateFace,
  matchRoster,
  type AkuvoxClient,
  type DoorLogRecord,
} from "@ytc/core";

const FACE_TYPE = 4; // type 4 = face recognition (12 = input/exit button)
const STATUS_DENIED = 1; // 0 = granted, 1 = denied/unrecognized

export async function pollDoorSnapshots(
  client: AkuvoxClient,
  opts: { logstatus?: number; pages?: number } = {},
): Promise<number> {
  const pages = Math.max(1, opts.pages ?? 3);
  const records: DoorLogRecord[] = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await client.getAccessLog({ page, logstatus: opts.logstatus });
    records.push(...batch);
    if (batch.length === 0) break;
  }

  // Denied face scans (unrecognized "Visitor") are what we enroll from.
  const denied = records.filter(
    (r) => r.type === FACE_TYPE && r.status === STATUS_DENIED,
  );

  // Dedup repeat scans: the same person retrying produces a burst of denials a
  // few seconds apart. Collapse anything within DEDUP_MS of the previous kept
  // scan so one person's repeated attempts become a single review item.
  const DEDUP_MS = Number(process.env.DENIED_DEDUP_MS ?? 120_000);
  const ts = (r: DoorLogRecord): number => {
    const d = Date.parse(`${r.date}T${r.time}`);
    return Number.isNaN(d) ? 0 : d;
  };
  denied.sort((a, b) => ts(a) - ts(b));
  const kept: DoorLogRecord[] = [];
  let lastKept = 0;
  for (const r of denied) {
    const t = ts(r);
    if (t && lastKept && t - lastKept < DEDUP_MS) continue; // within a burst → skip
    kept.push(r);
    if (t) lastKept = t;
  }

  let created = 0;
  for (const r of kept) {
    if (!r.picture) continue;
    const messageId = `door-${r.id}`;
    const existing = await prisma.photoSubmission.findUnique({
      where: { gmailMessageId: messageId },
      select: { id: true },
    });
    if (existing) continue;

    let bytes: Uint8Array;
    try {
      bytes = await client.getDoorPicture(r.picture);
    } catch {
      continue; // snapshot may have rotated off the device
    }

    const face = await validateFace(bytes);
    const imageBytes = face.ok && face.image ? face.image : bytes;
    const imagePath = `submissions/door-${r.id}.jpg`;
    await putPhoto(imagePath, imageBytes, "image/jpeg");

    // No name on a denied scan — staff match it by hand in the Review Queue.
    const match = await matchRoster({ parsedName: null, studentId: null });

    try {
      await prisma.photoSubmission.create({
        data: {
          gmailMessageId: messageId,
          fromAddress: "door-scanner",
          subjectRaw: `Door scan ${r.date} ${r.time}`,
          parsedName: null,
          imagePath,
          faceValid: face.ok,
          faceNote: face.ok ? null : (face.reason ?? null),
          matchCandidates: match.candidates as object,
          status: "NEEDS_MATCH",
        },
      });
      created++;
    } catch (e) {
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
        continue; // race: another poll created it
      }
      throw e;
    }
  }
  return created;
}
