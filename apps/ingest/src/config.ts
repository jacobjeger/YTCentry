/**
 * Ingest worker config. On Railway these are service variables; locally use
 * `tsx --env-file`. The Gmail app password requires 2FA on the account.
 */
export interface IngestConfig {
  user: string;
  pass: string;
  host: string;
  port: number;
  pollMs: number;
  sinceDays: number; // only look at mail from the last N days
}

/** Returns null (rather than throwing) when Gmail creds aren't set yet, so the
 *  Railway service can stay up and idle until the app password is configured. */
export function loadConfig(): IngestConfig | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return {
    user,
    pass,
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    pollMs: Number(process.env.INGEST_POLL_MS ?? 60000),
    sinceDays: Number(process.env.INGEST_SINCE_DAYS ?? 3),
  };
}
