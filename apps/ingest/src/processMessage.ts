/**
 * Per-message ingestion logic — pure enough to unit-test without IMAP.
 *
 * Given one parsed email (message id, sender, subject, first image), it:
 *   - dedupes on the Message-ID (PhotoSubmission.gmailMessageId is unique)
 *   - validates + stores the face image
 *   - parses a student ID / name from the subject
 *   - runs the roster matcher and writes a PhotoSubmission for the Review Queue
 */
import {
  prisma,
  validateFace,
  putPhoto,
  matchRoster,
  type SubmissionStatus,
} from "@ytc/core";

export interface IncomingMessage {
  messageId: string;
  from: string;
  subject: string;
  image: Uint8Array | null;
  imageMime?: string;
  /** What was attached, so an unusable file can be described to staff. */
  attachments?: { type: string; name?: string }[];
}

export interface ProcessResult {
  status: "skipped_duplicate" | "skipped_no_image" | "created" | "unusable";
  submissionId?: string;
  decision?: string;
}

/** "Photo - 1042 Moshe Goldberg", "Re: 1042", "Moshe Goldberg" → {studentId?, name?} */
export function parseSubject(subject: string): {
  studentId?: string;
  name?: string;
} {
  let s = (subject ?? "")
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/\b(photo|picture|image|pic)\b/gi, "")
    .replace(/תמונ[הת]|תמונות/g, " ") // Hebrew "photo" — \b doesn't fit Hebrew
    .replace(/[-–—:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const idMatch = s.match(/\b(\d{3,6})\b/);
  const studentId = idMatch?.[1];
  if (studentId) s = s.replace(idMatch[0], " ").replace(/\s+/g, " ").trim();
  const name = s || undefined;
  return { studentId, name };
}

export async function processMessage(
  msg: IncomingMessage,
): Promise<ProcessResult> {
  // Idempotency: Message-ID unique constraint stops double-processing.
  const existing = await prisma.photoSubmission.findUnique({
    where: { gmailMessageId: msg.messageId },
    select: { id: true },
  });
  if (existing) return { status: "skipped_duplicate" };

  const { studentId, name } = parseSubject(msg.subject);

  if (!msg.image) {
    // Someone attached something we couldn't read a photo out of. Silently
    // dropping it meant the sender waited on an enrollment that was never
    // coming and nobody knew — so record it for the Review Queue, with what
    // was actually attached. A mail with NO attachment at all is just noise in
    // a shared mailbox and is still skipped.
    const atts = msg.attachments ?? [];
    if (atts.length === 0) return { status: "skipped_no_image" };

    const described = atts
      .map((a) => (a.name ? `${a.name} (${a.type})` : a.type))
      .join(", ");
    try {
      const sub = await prisma.photoSubmission.create({
        data: {
          gmailMessageId: msg.messageId,
          fromAddress: msg.from,
          subjectRaw: msg.subject,
          parsedName: name ?? null,
          imagePath: "", // nothing stored — the card renders a placeholder
          faceValid: false,
          faceNote: `No usable photo in this email. Attached: ${described}. Ask the sender for a JPEG or PNG.`,
          matchCandidates: [],
          status: "NEEDS_MATCH",
        },
      });
      return { status: "unusable", submissionId: sub.id };
    } catch (e) {
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
        return { status: "skipped_duplicate" };
      }
      throw e;
    }
  }

  // Validate + normalize the face; keep the submission even if it fails so a
  // human can see why (faceValid=false, faceNote).
  const face = await validateFace(msg.image);
  const imageBytes = face.ok && face.image ? face.image : msg.image;
  const imagePath = `submissions/${sanitize(msg.messageId)}.jpg`;
  await putPhoto(imagePath, imageBytes, "image/jpeg");

  const match = await matchRoster({ parsedName: name, studentId });
  const status: SubmissionStatus =
    match.decision === "no_match" ? "NEEDS_MATCH"
    : match.exactRosterId ? "MATCHED"
    : "NEEDS_MATCH";

  try {
    const sub = await prisma.photoSubmission.create({
      data: {
        gmailMessageId: msg.messageId,
        fromAddress: msg.from,
        subjectRaw: msg.subject,
        parsedName: name ?? null,
        imagePath,
        faceValid: face.ok,
        faceNote: face.ok ? null : (face.reason ?? null),
        matchCandidates: match.candidates as object,
        status,
        rosterEntryId: match.exactRosterId ?? null,
      },
    });
    return { status: "created", submissionId: sub.id, decision: match.decision };
  } catch (e) {
    // Race: another poll created it first (unique gmailMessageId).
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return { status: "skipped_duplicate" };
    }
    throw e;
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}
