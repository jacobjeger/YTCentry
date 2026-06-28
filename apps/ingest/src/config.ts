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
}

export function loadConfig(): IngestConfig {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are required");
  }
  return {
    user,
    pass,
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    pollMs: Number(process.env.INGEST_POLL_MS ?? 60000),
  };
}
