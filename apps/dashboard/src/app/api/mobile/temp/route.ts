/**
 * GET  /api/mobile/temp  -> { pins: TempPinRow[] }   (active guest PINs)
 * POST /api/mobile/temp  -> create a temp PIN (once or recurring weekly)
 *
 * Validation mirrors createTempPinAction (temp-pins/actions.ts) but returns
 * error codes instead of localized strings — the app owns its own copy.
 */
import { prisma, audit, createTempPin, listTempPins } from "@ytc/core";
import { bearerUser, unauthorized } from "@/lib/mobileAuth";
import { describeDeviceError } from "@/lib/device";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  const [pins, devices] = await Promise.all([
    listTempPins(),
    prisma.device.findMany({ select: { id: true, name: true } }),
  ]);
  const dn = new Map(devices.map((d) => [d.id, d.name]));
  const rows = pins.map((p) => ({
    id: p.id,
    label: p.label,
    pin: p.pin,
    deviceName: dn.get(p.deviceId) ?? "",
    startsAt: p.startsAt?.toISOString() ?? null,
    expiresAt: p.expiresAt.toISOString(),
    active: p.activatedAt != null,
    weekly: p.weekly,
    timeBegin: p.timeBegin,
    timeEnd: p.timeEnd,
  }));
  return Response.json({ pins: rows });
}

export async function POST(request: Request) {
  const user = await bearerUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const label = String(body.label ?? "").trim();
  const deviceId = String(body.deviceId ?? "").trim();
  const customPin = String(body.pin ?? "").trim();
  const mode = String(body.mode ?? "once");
  if (!label) return Response.json({ error: "label_required" }, { status: 400 });
  if (!deviceId) return Response.json({ error: "door_required" }, { status: 400 });
  if (customPin && !/^\d{4,6}$/.test(customPin)) {
    return Response.json({ error: "bad_pin" }, { status: 400 });
  }

  let startsAt: Date | null = null;
  let expiresAt: Date;
  let recurring: { weekly: string; timeBegin: string; timeEnd: string } | undefined;

  if (mode === "repeat") {
    const weekly = (Array.isArray(body.days) ? body.days : [])
      .map((d) => String(d))
      .sort()
      .join("");
    const timeBegin = String(body.timeFrom ?? "").trim();
    const timeEnd = String(body.timeTo ?? "").trim();
    const untilRaw = String(body.until ?? "").trim();
    if (!weekly) return Response.json({ error: "days_required" }, { status: 400 });
    if (!/^\d{2}:\d{2}$/.test(timeBegin) || !/^\d{2}:\d{2}$/.test(timeEnd)) {
      return Response.json({ error: "bad_time" }, { status: 400 });
    }
    expiresAt = untilRaw
      ? new Date(`${untilRaw}T23:59`)
      : new Date(Date.now() + 365 * 24 * 3600000);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return Response.json({ error: "bad_until" }, { status: 400 });
    }
    recurring = { weekly, timeBegin, timeEnd };
  } else {
    const startsRaw = String(body.startsAt ?? "").trim();
    const endsRaw = String(body.endsAt ?? "").trim();
    startsAt = startsRaw ? new Date(startsRaw) : null;
    expiresAt = endsRaw ? new Date(endsRaw) : new Date(Date.now() + 12 * 3600000);
    if (isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return Response.json({ error: "end_in_past" }, { status: 400 });
    }
    if (startsAt && (isNaN(startsAt.getTime()) || startsAt.getTime() >= expiresAt.getTime())) {
      return Response.json({ error: "bad_start" }, { status: 400 });
    }
  }

  try {
    const { pin, userId, expiresAt: exp } = await createTempPin({
      deviceId,
      label,
      startsAt,
      expiresAt,
      recurring,
      pin: customPin || undefined,
      createdById: user.id,
    });
    await audit({
      actorId: user.id,
      action: "enrollee.create",
      targetType: "TempPin",
      targetId: String(userId),
      meta: { label, via: "mobile" },
    });
    return Response.json({ ok: true, pin, label, expiresAt: exp.toISOString() });
  } catch (e) {
    return Response.json({ error: describeDeviceError(e, "temp PIN create") }, { status: 502 });
  }
}
