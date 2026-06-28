/**
 * Server-side helpers for talking to a door (Device) from the dashboard, for
 * read-only directory sync + admin delete. Doors are DB-managed now.
 */
import "server-only";
import { prisma, clientForDevice, type AkuvoxClient } from "@ytc/core";

/** Client for a specific door, or the first active door when none is given. */
export async function deviceClientById(deviceId?: string): Promise<AkuvoxClient> {
  const device = deviceId
    ? await prisma.device.findUnique({ where: { id: deviceId } })
    : await prisma.device.findFirst({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      });
  if (!device) throw new Error("No door configured. Add one in Settings.");
  return clientForDevice(device);
}

/**
 * Turn a device-call failure into a clear, user-facing message. A hung/offline
 * door or a down tunnel surfaces as an AbortError / "fetch failed" — translate
 * that to something staff understand, and log it server-side for diagnosis.
 */
export function describeDeviceError(e: unknown, context = "door"): string {
  const msg = e instanceof Error ? e.message : String(e);
  const unreachable =
    /abort|timed out|timeout|fetch failed|ECONN|ENOTFOUND|network|socket/i.test(msg) ||
    (e instanceof Error && e.name === "AbortError");
  if (unreachable) {
    console.error(`[device] ${context} unreachable:`, msg);
    return "The door isn't responding — it may be offline, rebooting, or the tunnel is down. Try again in a minute.";
  }
  console.error(`[device] ${context} error:`, msg);
  return msg;
}
