/**
 * One process for both background workers. Each module starts its own loops
 * when imported (exactly as when it ran as its own service) and they share one
 * Prisma connection pool from @ytc/core.
 *
 * - pusher: drains the PushJob queue to the doors, syncs directories, temp PINs.
 * - ingest: watches the enrollment mailbox; idles if GMAIL_* isn't set.
 */
import "../../pusher/src/index";
import "../../ingest/src/index";

// Both modules stop their loops on SIGTERM, but some loops sleep for hours
// between runs, so the process would otherwise linger until Railway force-kills
// it on every deploy. Give in-flight work a few seconds, then exit.
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => setTimeout(() => process.exit(0), 5000));
}
