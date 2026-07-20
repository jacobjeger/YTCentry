/** POST /api/mobile/temp/revoke  { id } -> { ok }
 *  revokeTempPin is band-guarded + name-matched (safe delete) in core. */
import { audit, revokeTempPin } from "@ytc/core";
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { describeDeviceError } from "@/lib/device";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  let id = "";
  try {
    const body = await request.json();
    id = String(body?.id ?? "").trim();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!id) return Response.json({ error: "id_required" }, { status: 400 });

  try {
    await revokeTempPin(id);
    await audit({
      actorId: user.id,
      action: "enrollee.remove",
      targetType: "TempPin",
      targetId: id,
      meta: { via: "mobile" },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: describeDeviceError(e, "temp PIN revoke") }, { status: 502 });
  }
}
