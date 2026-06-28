/**
 * Pusher config from env. On Railway these are service variables; locally use
 * `tsx --env-file`. DRY_RUN lets the worker drain the queue and mark jobs done
 * WITHOUT touching the device (for testing the cloud half end-to-end).
 */
export interface PusherConfig {
  dryRun: boolean;
  pollMs: number;
  batch: number;
  akuvox: {
    baseUrl: string;
    apiUser: string;
    apiPassword: string;
    cfAccessClientId?: string;
    cfAccessClientSecret?: string;
  };
}

export function loadConfig(): PusherConfig {
  const dryRun = process.env.DRY_RUN === "true";
  const baseUrl = process.env.AKUVOX_BASE_URL ?? "";
  if (!dryRun && !baseUrl) {
    throw new Error("AKUVOX_BASE_URL is required unless DRY_RUN=true");
  }
  return {
    dryRun,
    pollMs: Number(process.env.PUSHER_POLL_MS ?? 3000),
    batch: Number(process.env.PUSHER_BATCH ?? 5),
    akuvox: {
      baseUrl,
      apiUser: process.env.AKUVOX_API_USER ?? "admin",
      apiPassword: process.env.AKUVOX_API_PASSWORD ?? "",
      cfAccessClientId: process.env.CF_ACCESS_CLIENT_ID || undefined,
      cfAccessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET || undefined,
    },
  };
}
