# YTC Entry — Face Enrollment Dashboard

A friendly web dashboard for managing the yeshiva's **Akuvox E16C** face scanners,
so office staff (not just IT) can add and manage who gets through the doors.
Hebrew (primary, RTL) and English, auto-detected from the browser.

---

## What it does

- **Add a person** — type a name, pick a photo (upload or webcam), choose the
  door(s) + group + optional PIN. The face is pushed to the scanner and verified
  before it reports success.
- **Review queue** — photos that arrive by email *or* as denied door scans get
  matched to people and approved into the door. Door scans expire after a week;
  emails are kept until rejected.
- **Directory** — everyone on a door (legacy + system-added) in one fast,
  cached, paginated, sortable, searchable list. Edit a person's name/PIN/group
  (face preserved), replace their photo, re-push, download their photo, or remove
  them (with a confirm; stronger warning for pre-existing records).
- **Temporary PINs** — PIN-only guest codes (no face) that **auto-expire** (1h–7d),
  with a live countdown, "add time", and revoke. Auto-deleted from the door when
  they lapse.
- **Multiple doors** — front + kitchen scanners; a person is pushed to whichever
  doors you select. Doors are managed in Settings (URL + web password, connection-
  tested on add).
- **Staff & roles** — admin-created logins (argon2), ADMIN/STAFF, full audit log.

Reserved-ID policy: this system only ever writes UserIDs **≥ 100000** (temp PINs
use **≥ 200000**). The ~832 pre-existing hand-managed records are shown read-only
and never written by automation.

---

## Architecture

```
[Staff browser] → [dashboard (Railway, Next.js 16)] → [Postgres (Railway)]
        │                    │  ▲                            ▲
        │                    │  └── reads the door directly through the (public)
        │                    │      Cloudflare tunnel for sync pushes + edits
        ▼                    ▼
  [Railway Bucket (S3)] ← face photos      [pusher (Railway worker)]
                                             • drains PushJob queue
[ingest (Railway worker)]                    • polls denied door scans → Review Queue
  • IMAP-polls the enrollment mailbox        • syncs the directory cache (5 min)
  • matches photos to the roster             • expires temp PINs + old door scans

         Cloudflare tunnel:  https://door.<your-domain>  →  E16C (LAN)
```

The dashboard and workers reach the door through the existing **Cloudflare
tunnel** (currently not Access-gated), using the device's **`/web` session API**
(login with the web password → token). No on-site agent.

---

## The Akuvox E16C `/web` API (confirmed from live captures)

All under `https://<door>/web`, session from `POST /web {target:login,
action:login, data:{userName, password: md5(webPassword)}}` → `token`.

| Operation | Request |
|---|---|
| List users | `GET /web/user/get?page&search&type=0&facestatus=0` → `data.userList[]` (paged) |
| Create + face | `POST /web/user/set?…&id=0&faceID=0&faceupload=1` + multipart `file` (creates user + face in one call) |
| Create PIN-only | same, `faceupload=0` + empty `file`, `PrivatePIN=…` (unique PIN enforced) |
| Edit (no face) | `POST /web/user/edit?…&faceupload=0&FaceStatus=<0/1>` + empty `file` (preserves face) |
| Delete | `POST /web {target:user, action:del, data:{type:"select", ids:[<internalId>], faceIDs:[<faceId>]}}` |
| Groups | `GET /web/usergroup/get`; delete `{target:usergroup, action:del, data:{type:"select", ids:[…]}}` |
| Schedules | `GET /web/schedule/get`; add `{target:schedule, action:add, data:{name, mode, dayrange_*, weekly, time_*}}` |
| Access log | `GET /web/accesslog/get?page&logstatus=3` → rows `{id,userID,name,type,date,time,status,picture}` (type 4=face, 12=exit; status 1=denied) |
| Snapshot | `GET /Image/DoorPicture/<picture>` (no auth on-device) |

Verify a face actually landed by re-reading the user — `faceID > 0` means a real
template enrolled. `AkuvoxClient` (`packages/core/src/akuvox.ts`) implements all
of this, including CF Access headers and session re-login.

---

## Monorepo (npm workspaces)

- `packages/core` — shared library: `AkuvoxClient`, name matcher, Prisma schema +
  client, storage (S3), id allocation, face validation (sharp → JPEG), queue,
  devices + password crypto, temp PINs, cleanup, audit.
- `apps/dashboard` — Next.js 16 App Router UI + API.
- `apps/pusher` — cloud worker: push queue, denied-scan polling, directory-cache
  sync, temp-PIN + door-scan expiry.
- `apps/ingest` — Gmail IMAP worker: matches emailed photos to the roster.

Each app deploys to Railway from `apps/<name>/Dockerfile` (built from the repo
root) via `RAILWAY_DOCKERFILE_PATH`.

---

## Local development

```bash
npm install
npm run db:generate
# .env files are gitignored — see .env.example. Prisma reads packages/core/.env;
# the dashboard reads apps/dashboard/.env.local (DATABASE_URL, SESSION_SECRET,
# S3_*, AKUVOX_BASE_URL, AKUVOX_WEB_PASSWORD, AGENT_BEARER_TOKEN).
npm run db:migrate
SEED_ADMIN_PASSWORD=… npm run db:seed
npm run dev            # dashboard at http://localhost:3000
```

Infra (Railway project "YTC Entry"): Postgres (+ pg_trgm), a native S3 **Bucket**
`ytc-faces`, and the `dashboard` / `pusher` / `ingest` services. Door web
passwords are AES-encrypted in the DB (`DEVICE_SECRET` / `SESSION_SECRET`).

---

## Adding a kitchen door

Settings → **Doors → Add a door**: name + tunnel URL + web password (it connection-
tests before saving). It then appears in the Add Person door picker and the
Directory door selector automatically. Tick "receives emails" only on the front
door (kitchen = staff-only).

---

## Known follow-ups

- **Groups & Schedules management UI** — assignment works (a person's
  group + access schedule); the create/edit screens are pending.
- **Scan log** — a text-only "when each person scanned" history (cheap; the
  device already logs it).
- **PIN column** in the Directory.
- Rotate the device web password off the setup value; keep it in Railway/Doppler.
