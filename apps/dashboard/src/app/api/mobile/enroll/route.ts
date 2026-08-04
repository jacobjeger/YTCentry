/**
 * POST /api/mobile/enroll  (multipart/form-data)
 *   displayName, groupName?, pin?, deviceIds (csv), rosterEntryId?, photo (file)
 * -> { ok, userId, name, pushed } | { error }
 *
 * Thin wrapper over enrollPerson — same contract as the web Add Person action:
 * only report success when the door actually accepted the face (pushed===true).
 */
import { isUnreachableError } from "@ytc/core";
import { enrollPerson, EnrollError } from "@/lib/enroll";
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { describeDeviceError } from "@/lib/device";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB, matches the web form

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch (e) {
    // Don't swallow this. A failure here is almost always a truncated or
    // unparseable upload, and without the reason "bad_request" is unactionable
    // — it says only that the photo never arrived intact.
    console.error("[mobile/enroll] formData() failed", {
      reason: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      transferEncoding: request.headers.get("transfer-encoding"),
      user: user.id,
    });
    // The app renders an unmapped code verbatim (Common.kt errorText), so send
    // a sentence rather than a slug — "bad_request" told staff nothing and
    // pointed at the wrong thing (their input, not the upload).
    return Response.json(
      { error: "The photo didn't finish uploading. Check the connection and try again." },
      { status: 400 },
    );
  }

  const displayName = String(form.get("displayName") ?? "").trim();
  const groupName = String(form.get("groupName") ?? "").trim() || null;
  const pin = String(form.get("pin") ?? "").trim() || null;
  const rosterEntryId = String(form.get("rosterEntryId") ?? "").trim() || null;
  const deviceIds = String(form.get("deviceIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!displayName) return Response.json({ error: "name_required" }, { status: 400 });
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return Response.json({ error: "bad_pin" }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return Response.json({ error: "photo_required" }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return Response.json({ error: "photo_too_large" }, { status: 400 });
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());

  try {
    const { enrollee, pushed, deviceError } = await enrollPerson({
      displayName,
      groupName,
      pin,
      rosterEntryId,
      source: rosterEntryId ? "EMAIL" : "MANUAL",
      image: bytes,
      actorId: user.id,
      deviceIds: deviceIds.length ? deviceIds : undefined,
    });

    if (!pushed) {
      // The door being unreachable is NOT a failed enrollment. The person is
      // saved with their photo and the pusher's retry loop lands them once the
      // door is back — same contract as the web Add Person form. Reporting an
      // error here makes staff re-add people who are already queued, so this
      // returns success with `queued` set. (Older app builds ignore the extra
      // field and simply show the success screen, which is still accurate.)
      if (isUnreachableError(deviceError)) {
        return Response.json({
          ok: true,
          queued: true,
          userId: enrollee.akuvoxUserId,
          name: enrollee.displayName,
        });
      }
      return Response.json(
        { error: deviceError ?? "push_failed", userId: enrollee.akuvoxUserId },
        { status: 502 },
      );
    }
    return Response.json({
      ok: true,
      userId: enrollee.akuvoxUserId,
      name: enrollee.displayName,
    });
  } catch (e) {
    if (e instanceof EnrollError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return Response.json({ error: describeDeviceError(e, "mobile enroll") }, { status: 500 });
  }
}
