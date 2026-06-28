/**
 * Door-snapshot enrollment. The E16C photographs every access attempt (Save
 * Picture is enabled). This polls the access log, finds unrecognized FACE scans
 * (people who tried but aren't enrolled), pulls the snapshot, and drops it into
 * the same Review Queue the emailed photos use — so staff can enroll straight
 * from a denied scan.
 *
 * Dedup: one PhotoSubmission per access-log id (gmailMessageId = "door-<id>").
 *
 * NOTE on the filter: "unrecognized" = a face-type record with no matched user
 * (userID "-"). The captured sample window had no denied rows, so confirm the
 * exact representation (and the logstatus that surfaces denials) against a real
 * denied scan; tune FACE_TYPE / the filter / ACCESS_LOG_STATUS if needed.
 */
import {
  prisma,
  putPhoto,
  validateFace,
  matchRoster,
  type AkuvoxClient,
} from "@ytc/core";

const FACE_TYPE = 4; // type 4 = face recognition (12 = input/exit button)

export async function pollDoorSnapshots(
  client: AkuvoxClient,
  opts: { logstatus?: number } = {},
): Promise<number> {
  const records = await client.getAccessLog({ page: 1, logstatus: opts.logstatus });

  // Unrecognized face attempts are the ones worth enrolling.
  const unknown = records.filter(
    (r) => r.type === FACE_TYPE && (r.userID === "-" || r.userID === ""),
  );

  let created = 0;
  for (const r of unknown) {
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
