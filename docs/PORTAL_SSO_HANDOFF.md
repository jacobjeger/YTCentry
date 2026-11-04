# Handoff: ship YTC portal SSO for YTC Entry (access.ytchaim.com)

For a local Claude Code session with Railway CLI access. The code is **done and
pushed**; what's left is the migration, the Railway variables, the deploy, and
checking it in production.

## Context

- Repo `jacobjeger/YTCentry`, branch **`claude/confident-pasteur-wsng8c`**
  (commit `d3caa88`). It is not merged to `main` yet and there is no PR.
- Production deploys from `main` with `railway up` (see the README deploy notes).
- The feature adds:
  - `GET /portal-sso?token=…&next=…` — verifies the portal's one-time RS256 JWT
    and signs the person in.
  - `GET /portal-manifest.json` — the permissions, tiles and door scopes the
    portal reads.
  - Server-side permission and door-scope checks everywhere.
  - CSP `frame-ancestors` and a `SameSite=None; Partitioned` session cookie.
  - An `/logs` activity page, and `POST /logout`.
- The full design is in the README section "YTC central portal (single
  sign-on)". The core code is in `apps/dashboard/src/lib/portal-core.ts`,
  `portal.ts`, `access.ts`, `audit.ts` and `frame.ts`, and in `src/proxy.ts`.
- **The site's own email + password sign-in must keep working exactly as
  before.** Don't change that.

## Steps

0. **Pull first.**
   ```bash
   git fetch origin && git checkout claude/confident-pasteur-wsng8c && git pull
   npm ci && npm run db:generate
   ```

1. **Check locally.**
   ```bash
   cd apps/dashboard && npx tsc --noEmit -p . && npx tsx scripts/make-test-token.ts
   cd ../.. && npm run build
   ```
   Expect "All passed" and a green build. `npx eslint src` reports 12 errors
   that were already there before this work, in files this change doesn't
   touch; don't chase them.

2. **Run the migration on production — before the new code goes live.** This is
   required: the new code reads `StaffUser.portal*` columns, so without them
   every sign-in fails. The migration only adds things (nullable or defaulted
   columns and a new `PortalJti` table), so it's safe to run ahead of the
   deploy, and the old code keeps working.
   ```bash
   DATABASE_URL="<prod Postgres URL from Railway>" npm run migrate:deploy -w packages/core
   ```
   Expected migration: `20261104120000_portal_sso`. Confirm with
   `npx prisma migrate status` (in `packages/core`).

3. **Set the Railway variables on the `dashboard` service.** Values (the literal
   `\n` in the key is fine; the code handles it):
   - `PORTAL_PUBLIC_KEY` =
     ```
     -----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsKx4+hCNF7t5zo1CdsbM\nq1TZq/0bRDORnZrCX+I3d8kKYnSmZEuMZ2YQ0CSMLaAgKsIgGxE4DMlmkHnEV4Sq\n9szC0DjI7aMqcTB+PMlwf1NSPBd87kMkffwE4s7rpKYS62/cFtpqxaaMXnoIS0r0\nXicja7vI071vv7XmcH9ja+1gMO3N8T34intZAikiLI5hF3djSjpx6DAkVX5Sj0YL\nqlSN/a65BHUeHPBSElhphpLj05Tq4QPe1w7uUwBpKMXWHpD9+VQe3ro49NV4gK1U\n03RkxzvOSLdONR9v17LUJq+apyLkGLsMvZS1V7LwXISZFKiVZA76EpRYgaN1y/k+\nmwIDAQAB\n-----END PUBLIC KEY-----
     ```
   - `PORTAL_ORIGINS` =
     ```
     'self' http://10.0.0.80 http://100.119.39.109 http://ytc-portal https://ytc-portal.tail599708.ts.net http://portal.ytchaim.com https://portal.ytchaim.com
     ```
   The quoting around `'self'` is fiddly in a shell, so the Railway dashboard
   (Variables tab) is the safer place to set these. If you use the CLI, check the
   stored value afterwards with `railway variables`.

4. **Deploy.** Ask the user before merging to `main` or deploying.
   - Merge the branch into `main` (or open a PR, if the user prefers to review).
   - Deploy the `dashboard` service the usual way (`railway up`).
   - The `pusher` and `ingest` workers don't need redeploying: their code is
     unchanged, and the migration only adds things.

5. **Verify in production.**
   ```bash
   curl -sI https://access.ytchaim.com/login | grep -i -E "content-security-policy|x-frame-options"
   curl -s https://access.ytchaim.com/portal-manifest.json | head -c 400
   curl -sI "https://access.ytchaim.com/portal-sso?token=bad" | grep -i location   # → /login?error=portal_invalid_token
   ```
   - The CSP line should list the portal origins, with no `X-Frame-Options`
     header.
   - In a browser, local email + password sign-in and sign-out should still
     work, and Settings should show as before for an admin.
   - From the portal (`portal.ytchaim.com`), open Door Access. It should land
     signed in, inside the iframe, with no sign-out button.
   - `/logs` should show the `auth.login` row with `via: portal` and an IP.
   - Send the portal developer the live `/portal-manifest.json`. Its door scope
     keys are the real ones; they're the Settings door keys with `-` replaced
     by `_`.

6. **Rollback, if needed.**
   - Redeploy the previous `main` commit. The extra columns are harmless to the
     old code, so the migration doesn't need undoing.
   - Unsetting `PORTAL_PUBLIC_KEY` turns off portal sign-in on its own (it
     answers `portal_not_configured`).

## Open items — tell the user, don't fix without asking

- **`pw.txt` and `scratchpad_tok.txt` are committed in the repo root** and look
  like secrets. Recommend removing them and rotating whatever they contain.
  Nobody has opened them.
- **Safari blocks third-party cookies** when the portal runs on a different site
  from `access.ytchaim.com` (the IP, `ytc-portal` and Tailscale addresses), so
  the session may not stick there. `portal.ytchaim.com` is the same site and
  works.
- **No `unlock` permission.** `AkuvoxClient` has no relay trigger.
- **`logs` is the activity log of changes, not a door entry log.**
- **Door scope fails closed.** `scope.doors: []` means **no** doors; leave
  `scope` out to give every door.
- **Two access paths.** A person with a local password who loses access in the
  portal can still sign in directly with their role's access, until they're
  disabled on the Staff page.
