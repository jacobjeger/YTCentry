/**
 * POST /api/mobile/review/reject  { submissionId } -> { ok }
 * Drops a photo from the queue. Same effect as the web Reject button.
 */
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { rejectOne } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  let submissionId = "";
  try {
    submissionId = String(((await request.json()) as { submissionId?: string }).submissionId ?? "");
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!submissionId.trim()) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    await rejectOne({ submissionId: submissionId.trim(), actorId: user.id });
  } catch {
    // Already gone (someone rejected it on the web first) — nothing to do, and
    // failing here would only make the app show a pointless error.
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true });
}
