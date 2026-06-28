/**
 * Door (Device) registry helpers. A door's web password is stored encrypted;
 * clientForDevice() decrypts it and builds an AkuvoxClient pointed at that door.
 */
import { prisma } from "./db";
import { AkuvoxClient } from "./akuvox";
import { decryptSecret } from "./crypto";
import type { Device } from "@prisma/client";

export async function getActiveDevices(): Promise<Device[]> {
  return prisma.device.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

export async function getAllDevices(): Promise<Device[]> {
  return prisma.device.findMany({ orderBy: { sortOrder: "asc" } });
}

/** Build an AkuvoxClient for one door. CF Access headers come from env (the
 *  tunnels share the same Access setup, if any). */
export function clientForDevice(d: Device): AkuvoxClient {
  return new AkuvoxClient({
    baseUrl: d.baseUrl,
    apiUser: "admin",
    apiPassword: "",
    webUser: d.webUser,
    webPassword: decryptSecret(d.webPasswordEnc),
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID || undefined,
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || undefined,
    timeoutMs: 20000,
  });
}

export type { Device };
