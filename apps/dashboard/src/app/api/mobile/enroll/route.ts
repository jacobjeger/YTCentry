/**
 * POST /api/mobile/enroll  (multipart/form-data)
 *   displayName, groupName?, pin?, deviceIds (csv), rosterEntryId?, photo (file)
 * -> { ok, userId, name, pushed } | { error }
 *
 * Thin wrapper over enrollPerson — same contract as the web Add Person action:
 * only report success when the door actually accepted the face (pushed===true).
 */
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
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
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
