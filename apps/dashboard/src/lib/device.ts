/**
 * Constructs an AkuvoxClient pointed at the door through the (public) tunnel,
 * for read-only directory sync from the dashboard. Uses the /web session
 * transport (web password), so no HTTP-API password is needed.
 */
import "server-only";
import { AkuvoxClient } from "@ytc/core";

export function deviceClient(): AkuvoxClient {
  const baseUrl = process.env.AKUVOX_BASE_URL;
  const webPassword = process.env.AKUVOX_WEB_PASSWORD;
  if (!baseUrl || !webPassword) {
    throw new Error("Door not configured (AKUVOX_BASE_URL / AKUVOX_WEB_PASSWORD).");
  }
  return new AkuvoxClient({
    baseUrl,
    apiUser: "admin",
    apiPassword: "",
    webUser: process.env.AKUVOX_WEB_USER ?? "admin",
    webPassword,
    cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID || undefined,
    cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || undefined,
    timeoutMs: 20000,
  });
}
