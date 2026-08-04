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

// The app renders an unmapped error code verbatim (Common.kt errorText), so
// send a sentence rather than a slug — "bad_request" told staff nothing and
// blamed their input rather than the upload.
const UPLOAD_INCOMPLETE =
  "The photo didn't finish uploading. Check the connection and try again.";

/**
 * Merge duplicate Content-Disposition headers within each multipart section.
 *
 * The Android app passes its own `Content-Disposition: filename="photo.jpg"`
 * for the photo part, and Ktor emits that IN ADDITION to the one it generates
 * ("form-data; name=photo"). Two Content-Disposition lines in one part make
 * undici — and therefore request.formData() — reject the whole body with
 * "Failed to parse body as FormData", no matter how small or well-formed the
 * upload otherwise is. Verified by reproducing that exact error locally.
 *
 * Repairing server-side fixes every app build already in the field. Only ever
 * called after a normal parse has failed, so a well-formed upload never goes
 * near this. Returns null when there was nothing to fix.
 *
 * latin1 round-trips bytes 1:1, so the binary payload is preserved exactly.
 */
function mergeDuplicateDispositions(body: string, boundary: string): string | null {
  if (!boundary) return null;
  const sections = body.split(`--${boundary}`);
  let changed = false;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const headerEnd = section.indexOf("\r\n\r\n"); // first blank line = end of part headers
    if (headerEnd < 0) continue;

    const lines = section.slice(0, headerEnd).split("\r\n");
    const isDispo = (l: string) => /^content-disposition:/i.test(l);
    const dispositions = lines.filter(isDispo);
    if (dispositions.length < 2) continue;

    const merged = dispositions
      .map((l, idx) => (idx === 0 ? l : l.replace(/^content-disposition:\s*/i, "")))
      .join("; ");

    let kept = false;
    const rebuilt = lines
      .filter((l) => {
        if (!isDispo(l)) return true;
        if (kept) return false; // drop the extras
        kept = true;
        return true;
      })
      .map((l) => (isDispo(l) ? merged : l));

    sections[i] = rebuilt.join("\r\n") + section.slice(headerEnd);
    changed = true;
  }

  return changed ? sections.join(`--${boundary}`) : null;
}

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  // Buffer the body before parsing rather than letting formData() consume the
  // stream. Two reasons: a truncated upload becomes measurable (declared
  // Content-Length vs bytes actually received) instead of an opaque
  // "Failed to parse body as FormData", and re-parsing from a complete buffer
  // sidesteps stream-level parse failures.
  let form: FormData;
  const contentType = request.headers.get("content-type") ?? "";
  const declared = Number(request.headers.get("content-length") ?? "0");
  let raw: ArrayBuffer;
  try {
    raw = await request.arrayBuffer();
  } catch (e) {
    console.error("[mobile/enroll] could not read body", {
      reason: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      declared,
      user: user.id,
    });
    return Response.json({ error: UPLOAD_INCOMPLETE }, { status: 400 });
  }

  try {
    form = await new Request("http://form.local/", {
      method: "POST",
      headers: { "content-type": contentType },
      body: raw,
    }).formData();
  } catch (e) {
    const bytes = new Uint8Array(raw);
    const boundaryForRepair = /boundary=([^;]+)/i.exec(contentType)?.[1]?.trim() ?? "";
    const repaired = mergeDuplicateDispositions(
      Buffer.from(bytes).toString("latin1"),
      boundaryForRepair,
    );
    let recovered: FormData | null = null;
    if (repaired) {
      try {
        recovered = await new Request("http://form.local/", {
          method: "POST",
          headers: { "content-type": contentType },
          body: Buffer.from(repaired, "latin1"),
        }).formData();
      } catch {
        recovered = null; // repair didn't help — report the original failure
      }
    }

    if (!recovered) {
      // Show whether the bytes arrived and whether the closing delimiter is
      // there. A short body means the connection dropped; a full body that
      // still won't parse means the encoding itself is wrong.
      const tail = Buffer.from(bytes.slice(Math.max(0, bytes.length - 120))).toString("latin1");
      // The part headers live at the top, before the JPEG payload.
      const head = Buffer.from(bytes.slice(0, 700)).toString("latin1");
      console.error("[mobile/enroll] formData() failed", {
        reason: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
        contentType,
        declaredLength: declared,
        receivedLength: bytes.length,
        truncated: declared > 0 && bytes.length < declared,
        hasClosingDelimiter: boundaryForRepair
          ? tail.includes(`--${boundaryForRepair}--`)
          : null,
        head: JSON.stringify(head),
        tail: JSON.stringify(tail.slice(-80)),
        transferEncoding: request.headers.get("transfer-encoding"),
        user: user.id,
      });
      return Response.json({ error: UPLOAD_INCOMPLETE }, { status: 400 });
    }

    console.warn("[mobile/enroll] repaired duplicate Content-Disposition headers", {
      user: user.id,
      bytes: bytes.length,
    });
    form = recovered;
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
