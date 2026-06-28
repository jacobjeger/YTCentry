/**
 * Cloud push worker. Long-running Railway service.
 *
 * Loop: claim QUEUED PushJobs → execute each against the E16C (through the
 * Access-gated Cloudflare tunnel) → report DONE/FAILED. Jobs are processed
 * one at a time because the door is a single device. The PushJob row gives us
 * retries and an audit trail; a tunnel/cloud blip delays a push, never loses it.
 *
 * Set DRY_RUN=true to drain the queue without touching the device.
 */
import {
  AkuvoxClient,
  claimJobs,
  completeJob,
  cleanupExpiredDoorSubmissions,
  expireTempPins,
  activateDueTempPins,
  getActiveDevices,
  syncDeviceDirectory,
  type ClaimedJob,
} from "@ytc/core";
import { loadConfig } from "./config";
import { pollDoorSnapshots } from "./doorSnapshots";

const cfg = loadConfig();
const client = new AkuvoxClient({ ...cfg.akuvox, timeoutMs: 12000 });

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchImage(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch face image (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function execute(job: ClaimedJob): Promise<{ faceUrl?: string }> {
  if (cfg.dryRun) {
    return job.action === "UPDATE_FACE" ? { faceUrl: "dryrun://face" } : {};
  }

  // We use the CONFIRMED /web session transport (pushUserWeb) — the device's own
  // web UI path — which works with the web login and needs no separate HTTP-API
  // password. A single /web/user/set (id=0,faceID=0) creates the user AND
  // attaches the face, so ADD is a no-op here and UPDATE_FACE does the real work.
  switch (job.action) {
    case "ADD":
      return {};
    case "UPDATE_FACE": {
      if (!job.photoUrl) throw new Error("UPDATE_FACE job has no photo");
      const image = await fetchImage(job.photoUrl);
      await client.pushUserWeb({
        userId: job.akuvoxUserId,
        name: job.name,
        image,
        scheduleRelay: job.scheduleRelay,
      });
      return { faceUrl: "set" };
    }
    case "DELETE": {
      await client.delUserWeb(job.akuvoxUserId);
      return {};
    }
  }
}

async function tick(): Promise<number> {
  const jobs = await claimJobs(cfg.batch);
  for (const job of jobs) {
    try {
      const { faceUrl } = await execute(job);
      await completeJob({ jobId: job.id, ok: true, faceUrl });
      console.log(`[done] ${job.action} user=${job.akuvoxUserId} (${job.name})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await completeJob({ jobId: job.id, ok: false, error: msg });
      console.warn(`[fail] ${job.action} user=${job.akuvoxUserId}: ${msg}`);
    }
  }
  return jobs.length;
}

/** Separate, slower loop: pull denied door scans into the Review Queue. */
async function doorLoop() {
  console.log("ytc pusher: door-snapshot polling enabled");
  while (running) {
    try {
      const n = await pollDoorSnapshots(client, {
        logstatus: cfg.accessLogStatus,
        pages: cfg.doorPages,
      });
      if (n) console.log(`[door] ${n} new snapshot(s) queued for review`);
    } catch (e) {
      console.error("[door loop error]", e);
    }
    await sleep(cfg.doorPollMs);
  }
}

/** Hourly retention sweep: expire week-old denied door scans. */
async function cleanupLoop() {
  while (running) {
    try {
      const n = await cleanupExpiredDoorSubmissions(7);
      if (n) console.log(`[cleanup] expired ${n} old door submission(s)`);
    } catch (e) {
      console.error("[cleanup error]", e);
    }
    await sleep(60 * 60 * 1000); // hourly
  }
}

/** Expire temp PINs — DB-only unless one actually lapses. Cheap, runs often. */
async function tempPinLoop() {
  while (running) {
    try {
      const activated = await activateDueTempPins();
      if (activated) console.log(`[temppin] activated ${activated} scheduled PIN(s)`);
      const expired = await expireTempPins();
      if (expired) console.log(`[temppin] removed ${expired} expired guest PIN(s)`);
    } catch (e) {
      console.error("[temppin loop error]", e);
    }
    await sleep(5 * 60 * 1000);
  }
}

/**
 * Reconcile the directory cache with the door. Since every dashboard action
 * updates the cache instantly, this only catches edits made on the device's own
 * screen — so it runs INFREQUENTLY (default 30 min) to spare the small E16C.
 */
async function directorySyncLoop() {
  const interval = Number(process.env.DIRECTORY_SYNC_MS ?? 30 * 60 * 1000);
  while (running) {
    try {
      for (const d of await getActiveDevices()) {
        try {
          const n = await syncDeviceDirectory(d);
          console.log(`[sync] ${d.name}: ${n} users cached`);
        } catch (e) {
          console.warn(`[sync] ${d.name} failed:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error("[sync loop error]", e);
    }
    await sleep(interval);
  }
}

async function main() {
  console.log(
    `ytc pusher up — ${cfg.dryRun ? "DRY_RUN (no device calls)" : `target ${cfg.akuvox.baseUrl}`}`,
  );
  cleanupLoop();
  tempPinLoop();
  directorySyncLoop();

  // Door snapshots are device READS via the /web session (only need the web
  // password + a reachable baseUrl) — independent of DRY_RUN, which only mocks
  // the push side.
  if (cfg.doorSnapshots && cfg.akuvox.webPassword && cfg.akuvox.baseUrl) {
    doorLoop();
  }

  while (running) {
    let n = 0;
    try {
      n = await tick();
    } catch (e) {
      console.error("[loop error]", e);
    }
    await sleep(n > 0 ? 250 : cfg.pollMs);
  }
  console.log("ytc pusher shutting down");
}

main();
