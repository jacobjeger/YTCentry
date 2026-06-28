"use server";

import { prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { deviceClient } from "@/lib/device";

export interface DeviceRow {
  userID: string;
  name: string;
  hasFace: boolean;
  managed: boolean; // in our automation band / managed by this system
}

export interface DeviceDirState {
  rows?: DeviceRow[];
  total?: number;
  error?: string;
}

/** Live-pull the full device directory and flag which records this system owns. */
export async function loadDeviceDirectory(): Promise<DeviceDirState> {
  await requireUser();
  try {
    const client = deviceClient();
    const [users, enrollees] = await Promise.all([
      client.getAllUsersViaWeb(),
      prisma.enrollee.findMany({ select: { akuvoxUserId: true } }),
    ]);
    const managed = new Set(enrollees.map((e) => String(e.akuvoxUserId)));
    const rows: DeviceRow[] = users
      .map((u) => ({
        userID: u.userID,
        name: u.name,
        hasFace: (u.faceID ?? 0) > 0,
        managed: managed.has(u.userID),
      }))
      .sort((a, b) => Number(a.userID) - Number(b.userID));
    return { rows, total: rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load the door directory." };
  }
}
