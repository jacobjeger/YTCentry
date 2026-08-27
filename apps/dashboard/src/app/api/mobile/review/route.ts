/**
 * GET /api/mobile/review -> { submissions: [...] }
 *
 * The Review Queue for the phone: everything still awaiting a decision, newest
 * first, with a signed URL per image. Mirrors the web /review page.
 *
 * Every image the email carried is included, not just the one in use — a
 * signature logo travels alongside the real photo, so staff need to be able to
 * pick on the phone exactly as they can on the web.
 */
import { prisma, signedPhotoUrl } from "@ytc/core";
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { PENDING_STATUSES } from "@/lib/review";

export const dynamic = "force-dynamic";

const DOOR = "door-scanner";
/** Long enough to review a queue without the images going stale mid-scroll. */
const URL_TTL_SECONDS = 3600;

export async function GET(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  // The app shows door checkboxes per photo, pre-ticked to the everyday doors,
  // so it needs the same door list the web card gets.
  const doors = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, allowEmail: true },
  });

  const rows = await prisma.photoSubmission.findMany({
    where: { status: { in: [...PENDING_STATUSES] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const submissions = await Promise.all(
    rows.map(async (s) => ({
      id: s.id,
      source: s.fromAddress === DOOR ? "door" : "email",
      from: s.fromAddress,
      subject: s.subjectRaw ?? "",
      parsedName: s.parsedName,
      faceValid: s.faceValid,
      faceNote: s.faceNote,
      createdAt: s.createdAt.toISOString(),
      // An unusable submission has no stored image; the app renders a warning
      // card instead of a broken thumbnail.
      photos: await Promise.all(
        [s.imagePath, ...s.altImagePaths]
          .filter(Boolean)
          .map(async (path) => ({ path, url: await signedPhotoUrl(path, URL_TTL_SECONDS) })),
      ),
      candidates: Array.isArray(s.matchCandidates)
        ? (s.matchCandidates as { studentId: string; name: string; score: number }[])
        : [],
    })),
  );

  return Response.json({ submissions, doors });
}
