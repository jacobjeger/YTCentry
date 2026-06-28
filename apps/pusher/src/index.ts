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

  switch (job.action) {
    case "ADD": {
      await client.addUser({
        userId: job.akuvoxUserId,
        name: job.name,
        scheduleRelay: job.scheduleRelay,
      });
      return {};
    }
    case "UPDATE_FACE": {
      if (!job.photoUrl) throw new Error("UPDATE_FACE job has no photo");
      const image = await fetchImage(job.photoUrl);
      await client.enrollFace({
        userId: job.akuvoxUserId,
        name: job.name,
        image,
        scheduleRelay: job.scheduleRelay,
        isNew: false, // the ADD job already created the record
      });
      // Read back the device FaceUrl so the dashboard can show it landed.
      const u = await client.getUser(job.akuvoxUserId);
      return { faceUrl: u?.FaceUrl || "set" };
    }
    case "DELETE": {
      await client.delUser(job.akuvoxUserId);
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
      const n = await pollDoorSnapshots(client, { logstatus: cfg.accessLogStatus });
      if (n) console.log(`[door] ${n} new snapshot(s) queued for review`);
    } catch (e) {
      console.error("[door loop error]", e);
    }
    await sleep(cfg.doorPollMs);
  }
}

async function main() {
  console.log(
    `ytc pusher up — ${cfg.dryRun ? "DRY_RUN (no device calls)" : `target ${cfg.akuvox.baseUrl}`}`,
  );

  // Door snapshots need the real device + the web password; skip in DRY_RUN.
  if (cfg.doorSnapshots && !cfg.dryRun && cfg.akuvox.webPassword) {
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
