/**
 * POST /api/mobile/review/approve  (JSON)
 *   { submissionId, studentId }                     -> approve as that roster person
 *   { submissionId, displayName, groupName?, pin? } -> enroll under a typed name
 * -> { ok, userId, name, queued } | { error }
 *
 * Thin wrapper over the shared review logic, so approving from the phone
 * captures the sender's address for the confirmation email and links the roster
 * entry exactly as the web does.
 */
import { isUnreachableError } from "@ytc/core";
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { approveAsRoster, approveByName, type ReviewResult } from "@/lib/review";

export const dynamic = "force-dynamic";

/** The app renders an unmapped code verbatim, so send a sentence. */
const MESSAGES: Record<string, string> = {
  not_found: "That photo has already been dealt with by someone else.",
  roster_missing: "That person is no longer on the roster.",
  photo_unreadable: "The photo couldn't be read. Try picking another image.",
  failed: "Something went wrong approving this photo.",
};

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  let payload: {
    submissionId?: string;
    studentId?: string;
    displayName?: string;
    groupName?: string | null;
    pin?: string | null;
  };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const submissionId = String(payload.submissionId ?? "").trim();
  if (!submissionId) return Response.json({ error: "bad_request" }, { status: 400 });

  const pin = payload.pin ? String(payload.pin).trim() : null;
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return Response.json({ error: "bad_pin" }, { status: 400 });
  }

  const studentId = String(payload.studentId ?? "").trim();
  const res: ReviewResult = studentId
    ? await approveAsRoster({ submissionId, studentId, actorId: user.id })
    : await approveByName({
        submissionId,
        displayName: String(payload.displayName ?? ""),
        groupName: payload.groupName ? String(payload.groupName).trim() : null,
        pin,
        actorId: user.id,
      });

  if (!res.ok) {
    if (res.code === "name_required") {
      return Response.json({ error: "name_required" }, { status: 400 });
    }
    // The device's own words ("no face found", "too dark") are far more useful
    // than a generic failure, so they pass straight through.
    if (res.code === "rejected_by_device") {
      return Response.json({ error: res.message ?? MESSAGES.failed }, { status: 400 });
    }
    return Response.json(
      { error: MESSAGES[res.code] ?? MESSAGES.failed },
      { status: res.code === "not_found" ? 409 : 400 },
    );
  }

  // A door that can't be reached is NOT a failed approval: the person is saved
  // with their photo, the retry loop lands them once it's back, and the sender
  // is emailed then. Same contract as /api/mobile/enroll — reporting an error
  // here makes staff re-approve people who are already queued.
  if (res.queued && !isUnreachableError(res.deviceError)) {
    return Response.json({ error: res.deviceError ?? MESSAGES.failed }, { status: 502 });
  }

  return Response.json({
    ok: true,
    queued: res.queued,
    userId: res.userId,
    name: res.name,
  });
}
