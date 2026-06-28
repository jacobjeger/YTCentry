# Cloudflare Tunnel setup — pushing to the door from the cloud

This is how the cloud **push worker** (`apps/pusher`, running on Railway) reaches
the Akuvox E16C at `10.0.0.215`, which lives on the yeshiva LAN and is not
otherwise reachable from the internet.

Instead of installing an on-site agent, we reuse the **existing Cloudflare
Tunnel** and expose the door as a hostname that is locked behind **Cloudflare
Access** (service-token auth). Only a request carrying the right service-token
headers is let through to the device; everything else is dropped at Cloudflare's
edge. The device's HTTP Basic auth is the second layer.

```
[apps/pusher on Railway] --HTTPS--> door.<domain> (Cloudflare)
        |  CF-Access-Client-Id / CF-Access-Client-Secret
        v
   Access policy check  -->  existing tunnel  -->  LAN  -->  http://10.0.0.215
```

---

## 1. Add a tunnel route for the door

In the Cloudflare Zero Trust dashboard → **Networks → Tunnels** → open the
existing tunnel → **Public Hostnames** → **Add a public hostname**:

- **Subdomain / hostname:** `door` → `door.<yourdomain>`
- **Service type:** `HTTP`
- **URL:** `10.0.0.215:80`

Nothing else about the tunnel changes — it keeps serving its current routes.

> Pin a DHCP reservation for the door at `10.0.0.215` so the route never breaks.

---

## 2. Create an Access service token

Zero Trust → **Access → Service Auth → Service Tokens** → **Create service token**:

- Name it e.g. `ytc-pusher`.
- Copy the **Client ID** and **Client Secret** now — the secret is shown once.

---

## 3. Gate the door hostname with an Access application

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- **Application domain:** `door.<yourdomain>`
- **Session duration:** any (service tokens ignore it).
- Add a **policy**:
  - **Action:** `Service Auth`
  - **Include:** *Service Token* → select `ytc-pusher`.
- Save.

Now only requests with valid `CF-Access-Client-Id` / `CF-Access-Client-Secret`
headers reach the tunnel; browsers without the token get the Access login page
and never touch the device.

---

## 4. Set the push-worker env (Railway → pusher service)

```
AKUVOX_BASE_URL=https://door.<yourdomain>      # the gated hostname, NOT 10.0.0.215
AKUVOX_API_USER=admin
AKUVOX_API_PASSWORD=<the HTTP API password>    # rotate off the setup value
CF_ACCESS_CLIENT_ID=<service token Client ID>
CF_ACCESS_CLIENT_SECRET=<service token Client Secret>
DATABASE_URL=<injected by Railway Postgres>
# storage creds so the worker can fetch face images (see .env.example: S3_*)
```

`AkuvoxClient` automatically attaches the two `CF-Access-*` headers to **both**
request paths (the JSON `/api/*` calls and the multipart `enrollFace` upload)
whenever `cfAccessClientId` / `cfAccessClientSecret` are set — no other code
change is needed. The band guard, `verifyWrite`, `verifyFace`, and the reserved
ID policy are all unchanged.

---

## 5. Verify the route (run once)

With the token, the call reaches the device and returns the JSON user list.
Without it, Cloudflare blocks the request before it ever hits the door:

```bash
# WITH token -> reaches device -> JSON user list
curl -s -u admin:"$AKUVOX_API_PASSWORD" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  "https://door.<yourdomain>/api/user/get" | head

# WITHOUT token -> blocked by Access (HTML, never hits the device)
curl -s "https://door.<yourdomain>/api/user/get" | head
```

---

## 6. The one open device test — `enrollFace` transport (do once)

Before trusting face enrollment end-to-end, confirm which transport the device
honors (this is Task #7 / the "transport gate"). Run it through the gated
hostname (or on the LAN). Use a throwaway automation-band ID like `100777`:

```bash
curl -s -u admin:"$AKUVOX_API_PASSWORD" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -F "file=@/path/to/any-face.jpg;type=image/jpeg" \
  "https://door.<yourdomain>/api/user/set?UserID=100777&name=PushTest&PrivatePIN=&RFcard=&Floor=0&WebRelay=0&id=0&faceID=0&Phone=&Group=Default&Priority=0&DialAccount=0&relay=1&Schedule=1001-1&Schedule1=1001&faceupload=1&web=1"

# confirm FaceUrl populated, then delete the test user
curl -s -u admin:"$AKUVOX_API_PASSWORD" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  "https://door.<yourdomain>/api/user/get" | python3 -c \
  "import sys,json;print([u for u in json.load(sys.stdin)['data']['item'] if u['UserID']=='100777'])"
```

- **`retcode:0` + `FaceUrl` non-empty** → the Basic-auth `/api/user/set` path
  works. Keep `enrollFace`'s default `path:"/api/user/set"`; no other change.
- **401 / 404 / `retcode != 0`** → the face upload needs the `/web` + `session`
  login flow. Set `enrollFace`'s `path:"/web/user/set"` and wire a login →
  `session` token step in `AkuvoxClient`.

Clean up the `100777` test record afterward (the `del` call) so it isn't left
on the door.

---

## What this trades vs. a local agent

- The device HTTP API password lives in the cloud worker env (not on-site). Keep
  it in Railway/Doppler and **rotate it off the setup value**.
- A push needs the tunnel + cloud up at that moment. The `PushJob` row still
  gives retries, so a blip **delays** a push rather than losing it.
- Keep a periodic reconcile that re-asserts the automation band (UserID
  `>= 100000`) and re-pushes anything that drifted out of the device.
