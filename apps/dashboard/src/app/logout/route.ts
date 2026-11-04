/**
 * POST /logout — sign out. A route handler (not a Server Action) so it can send
 * two Set-Cookie headers: one for the current Partitioned cookie and one for a
 * pre-portal unpartitioned cookie, which browsers store separately.
 */
import { NextResponse, type NextRequest } from "next/server";
import { clearSessionHeaders, readClaims } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Cross-site form posts can't sign anyone out.
  const origin = request.headers.get("origin");
  if (origin) {
    const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")]
      .filter(Boolean)
      .flatMap((h) => h!.split(",").map((x) => x.trim()));
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    if (!hosts.includes(originHost)) return new NextResponse("forbidden", { status: 403 });
  }
  const claims = await readClaims();
  if (claims) {
    await audit({ actorId: claims.sub, action: "auth.logout", targetType: "StaffUser", targetId: claims.sub });
  }
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
  for (const c of clearSessionHeaders()) res.headers.append("Set-Cookie", c);
  return res;
}
