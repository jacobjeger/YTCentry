/**
 * GET /api/mobile/bootstrap -> { user, groups, doors }
 * Everything the app needs to render the Add Person + Temp PIN forms: the
 * cached group labels (never hits the door) and the active doors.
 */
import { prisma, getCachedGroups } from "@ytc/core";
import { bearerAccess } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await bearerAccess(request, "view", "mobile.bootstrap");
  if (access instanceof Response) return access;
  const user = access.user;

  const doors = await prisma.device.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, allowEmail: true },
  });

  const groups = doors.length ? await getCachedGroups(doors[0].id) : [];

  return Response.json({
    user: { name: user.name, role: user.role },
    groups,
    doors,
  });
}
