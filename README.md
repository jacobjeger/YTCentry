# YTC Entry — Face Enrollment Dashboard

A friendly web dashboard for enrolling people on the yeshiva's **Akuvox E16C**
face reader, so office staff (not just IT) can add talmidim. Two entry points —
manual photo/webcam upload and emailed photos matched against a roster — feed
one enrollment core that validates the face, allocates a band-safe door ID, and
pushes it to the reader. **Nothing auto-pushes; a human always clicks.**

Hebrew (primary, RTL) and English, auto-detected from the browser.

## Architecture

```
[Staff browser] → [dashboard (Railway, Next.js 16)] → [Postgres (Railway)]
                                                          ↑   ↓
                         PushJob queue (QUEUED rows)  ─────┘   │
[ingest worker (Railway)] ─IMAP→ ytc.entry@gmail.com          │
[Railway Bucket (S3)] ← face photos (dashboard + ingest)      │
                                                          ┌────┘
[pusher (Railway)] ─HTTPS via Cloudflare Access tunnel→ http://10.0.0.215 (door)
```

The cloud cannot reach the door's LAN IP directly, so the **pusher** worker
reaches it through the existing Access-gated Cloudflare tunnel (see
`docs/CLOUDFLARE_SETUP.md`). No on-site agent to install.

**Reserved-ID policy:** automation owns UserIDs `>= 100000`. The 832 legacy
hand-managed records (`1..832`) are never touched (`assertManagedId`).

## Monorepo (npm workspaces)

- `packages/core` — shared library: `AkuvoxClient` (E16C), name matcher, Prisma
  schema + client, storage (S3), id allocation, face validation, queue, audit.
- `apps/dashboard` — Next.js 16 App Router UI + API (auth, enroll, roster,
  review, directory, settings, `/api/agent/*` queue endpoints).
- `apps/pusher` — cloud push worker; drains PushJobs to the door via the tunnel.
- `apps/ingest` — Gmail IMAP worker; matches emailed photos to the roster.

## Local development

```bash
npm install
npm run db:generate
# .env files are gitignored; see .env.example for every variable.
#   packages/core/.env      -> DATABASE_URL (Railway Postgres public proxy)
#   apps/dashboard/.env.local -> DATABASE_URL, SESSION_SECRET, AGENT_BEARER_TOKEN, S3_*
npm run db:migrate            # apply migrations (init + pg_trgm trigram index)
SEED_ADMIN_PASSWORD=... npm run db:seed   # create the first ADMIN login
npm run dev                   # dashboard at http://localhost:3000

# workers (need their own env; see .env.example):
DRY_RUN=true npm run agent --workspace apps/pusher   # drain queue without the device
npm run ingest --workspace apps/ingest               # needs GMAIL_APP_PASSWORD
```

## Infrastructure (Railway, project "YTC Entry")

- **Postgres** plugin — schema via Prisma migrations; `pg_trgm` for fuzzy roster
  matching.
- **Bucket** `ytc-faces` (native S3, region `ams`) — face photos.
- Deploy `dashboard`, `pusher`, and `ingest` as separate services; inject env
  per service (DB internal URL, bucket creds, agent token; CF/device creds and
  Gmail app password only where needed).

## Open setup items (require external access)

- Rotate the device HTTP-API password off the setup value; store in the pusher
  env only.
- Enable 2FA + an app password on `ytc.entry@gmail.com` for the ingest worker.
- Wire the Cloudflare tunnel + Access service token (`docs/CLOUDFLARE_SETUP.md`).
- Run the **`enrollFace` transport gate** curl once on the door to confirm the
  Basic-auth `/api/user/set` face path vs. the `/web` + session path.
