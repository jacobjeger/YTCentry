/**
 * POST /api/mobile/review/photo  { submissionId, path } -> { ok }
 *
 * Pick which of the email's images is the person's photo. The chosen key is
 * swapped into imagePath, so a later approve — from the phone or the web —
 * enrolls the right picture. Only images that arrived with this submission are
 * accepted; the shared helper enforces that.
 */
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { choosePhoto } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  let body: { submissionId?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const submissionId = String(body.submissionId ?? "").trim();
  const path = String(body.path ?? "").trim();
  if (!submissionId || !path) return Response.json({ error: "bad_request" }, { status: 400 });

  const res = await choosePhoto({ submissionId, path, actorId: user.id });
  if (!res.ok) return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json({ ok: true });
}
