/**
 * GET /api/mobile/roster -> RosterRow[]
 * The incoming-talmidim list, so the app can enroll a roster person (tap → Add
 * Person prefilled, carrying rosterEntryId). Mirrors listRoster in roster/actions.
 */
import { prisma } from "@ytc/core";
import { bearerAccess } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await bearerAccess(request, "view", "mobile.roster");
  if (access instanceof Response) return access;

  const entries = await prisma.rosterEntry.findMany({
    orderBy: { createdAt: "desc" },
    include: { enrollee: { select: { id: true, photoPath: true } } },
  });

  const rows = entries.map((e) => ({
    id: e.id,
    studentId: e.studentId,
    fullName: e.fullName,
    shiur: e.shiur,
    phone: e.phone,
    status: e.status,
    hasPhoto: !!e.enrollee?.photoPath,
    enrolleeId: e.enrollee?.id ?? null,
  }));

  return Response.json({ roster: rows });
}
