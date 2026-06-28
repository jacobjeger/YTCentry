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
