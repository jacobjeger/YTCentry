/**
 * Akuvox E16C HTTP API client.
 *
 * Verified against the live YTC door unit (E16C V2.0, lighttpd) on 2026-06-28:
 *   GET /api/user/get -> { retcode:0, message:"OK", data:{ num, item:[...] } }
 *
 * Auth: Basic, realm "HTTP API". NOTE this credential is the *HTTP API* user/pass
 * configured under Setting -> HTTP API on the device — it is NOT the web-login pass.
 *
 * Success quirk: the manual shows add/set/del returning retcode:1 on success but
 * get/clear returning retcode:0. We therefore treat 0 OR 1 + message "OK" as success,
 * and every write is verified with a follow-up get (verifyWrite).
 *
 * Reserved-ID policy: the door already holds 832 hand-managed identities at UserID
 * 1..832. This automated system ONLY ever reads/writes its own band (>= ID_BAND_START).
 * It must never add/set/del a record below that line. assertManagedId() enforces it.
 */

const ID_BAND_START = 100000; // automation owns UserIDs >= this; humans own < this.

export interface AkuvoxUser {
  UserID: string;
  ID: string;
  Name: string;
  CardCode: string;
  FaceUrl: string;
  PrivatePIN: string;
  ScheduleRelay: string;   // e.g. "1001-1" = built-in 24h schedule, relay 1
  ScheduleSRelay: string;
  LiftFloorNum: string;
  SourceType: string;
  Type: string;
  WebRelay: string;
}

export interface AkuvoxConfig {
  baseUrl: string;        // LAN "http://10.0.0.215" OR the gated tunnel "https://door.<domain>"
  apiUser: string;        // "admin"
  apiPassword: string;    // the HTTP API password (Doppler / env — never hardcode)
  timeoutMs?: number;
  // Cloudflare Access service-token headers — required when baseUrl is the
  // Access-gated tunnel hostname (cloud push). Omit for direct LAN access.
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

export class AkuvoxError extends Error {
  constructor(msg: string, readonly detail?: unknown) {
    super(msg);
    this.name = "AkuvoxError";
  }
}

export class AkuvoxClient {
  private readonly auth: string;
  private readonly timeout: number;

  constructor(private readonly cfg: AkuvoxConfig) {
    this.auth =
      "Basic " + Buffer.from(`${cfg.apiUser}:${cfg.apiPassword}`).toString("base64");
    this.timeout = cfg.timeoutMs ?? 8000;
  }

  /**
   * Cloudflare Access service-token headers. When the device is reached through
   * the Access-gated tunnel (baseUrl = https://door.<domain>), every request
   * must carry these or it is dropped at the edge before reaching the door.
   * Empty when talking to the LAN IP directly. See PUSH_VIA_TUNNEL.
   */
  private cfHeaders(): Record<string, string> {
    const { cfAccessClientId: id, cfAccessClientSecret: secret } = this.cfg;
    return id && secret
      ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret }
      : {};
  }

  private assertManagedId(id: string | number) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < ID_BAND_START) {
      throw new AkuvoxError(
        `Refusing to touch UserID ${id}: outside the automation band (>= ${ID_BAND_START}). ` +
          `IDs below that are hand-managed on the device.`
      );
    }
  }

  private async call<T = any>(
    target: string,
    action: string,
    data?: unknown
  ): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await fetch(`${this.cfg.baseUrl}/api/${target}/${action}`, {
        method: "POST",
        headers: {
          Authorization: this.auth,
          "Content-Type": "application/json",
          ...this.cfHeaders(),
        },
        body: JSON.stringify(data ? { target, action, data } : { target, action }),
        signal: ctrl.signal,
      });
      if (res.status === 401)
        throw new AkuvoxError("401 Unauthorized — check the HTTP API credential.");
      if (res.status === 403)
        throw new AkuvoxError("403 Forbidden — caller IP not in the device allowlist (1st–5th IP).");
      if (!res.ok) throw new AkuvoxError(`HTTP ${res.status} from device.`);

      const body = await res.json();
      const ok =
        (body?.retcode === 0 || body?.retcode === 1) &&
        String(body?.message ?? "").toLowerCase() === "ok";
      if (!ok) throw new AkuvoxError(`Device rejected ${target}/${action}.`, body);
      return body as T;
    } finally {
      clearTimeout(t);
    }
  }

  /** Pull the full directory. Use sparingly (832+ records); cache on the agent. */
  async getUsers(): Promise<AkuvoxUser[]> {
    const body = await this.call("user", "get");
    return body?.data?.item ?? [];
  }

  async getUser(userId: string | number): Promise<AkuvoxUser | null> {
    const all = await this.getUsers();
    return all.find((u) => u.UserID === String(userId)) ?? null;
  }

  /** Highest UserID currently on the device (across ALL bands) — for safe allocation. */
  async maxUserId(): Promise<number> {
    const all = await this.getUsers();
    return all.reduce((m, u) => Math.max(m, Number(u.UserID) || 0), 0);
  }

  /**
   * Create a user record (no face yet). userId MUST be in the automation band.
   * Face is attached separately once enrollFace is wired (see below).
   */
  async addUser(u: {
    userId: string | number;
    name: string;
    scheduleRelay?: string; // default "1001-1" (24h, relay 1)
    privatePIN?: string;
    cardCode?: string;
  }): Promise<void> {
    this.assertManagedId(u.userId);
    const id = String(u.userId);
    await this.call("user", "add", {
      item: [
        {
          UserID: id,
          ID: id,
          Name: u.name,
          ScheduleRelay: u.scheduleRelay ?? "1001-1",
          PrivatePIN: u.privatePIN ?? "",
          CardCode: u.cardCode ?? "",
          FaceUrl: "",
          LiftFloorNum: "0",
          Type: "0",
          WebRelay: "0",
        },
      ],
    });
    await this.verifyWrite(id, u.name);
  }

  async setUser(u: Partial<AkuvoxUser> & { UserID: string }): Promise<void> {
    this.assertManagedId(u.UserID);
    await this.call("user", "set", { item: [{ ID: u.UserID, ...u }] });
  }

  async delUser(userId: string | number): Promise<void> {
    this.assertManagedId(userId);
    await this.call("user", "del", { item: [{ ID: String(userId) }] });
  }

  private async verifyWrite(userId: string, expectName: string) {
    const got = await this.getUser(userId);
    if (!got || got.Name !== expectName)
      throw new AkuvoxError(
        `Write verification failed for UserID ${userId} (device did not reflect the change).`
      );
  }

  /**
   * Enroll (or replace) a face. CONFIRMED mechanism, captured from the E16C web
   * UI on 2026-06-28:
   *
   *   POST /web/user/set?UserID=..&name=..&relay=1&Schedule=1001-1&Schedule1=1001
   *        &id=0&faceID=0&faceupload=1&web=1   (all user fields in the QUERY STRING)
   *   body: multipart/form-data, single field "file" = the image bytes (png/jpeg)
   *   resp: { retcode:0, action:"set", message:"ok" }
   *
   * With a fresh UserID + id=0&faceID=0 this single call BOTH creates the user and
   * attaches the face — so for new talmidim you don't need a separate addUser().
   *
   * TRANSPORT — the one thing still to confirm (run the curl in CLAUDE.md):
   *   - If `/api/user/set?...&faceupload=1` honors this under Basic auth (default
   *     below), the agent needs no session handling. Keep `path:"/api/user/set"`.
   *   - If only `/web/user/set` works, it needs a `session` token from login. Set
   *     `path:"/web/user/set"` and pass `session` (wire login once captured).
   */
  async enrollFace(opts: {
    userId: string | number;
    name: string;
    image: Uint8Array;
    mime?: "image/jpeg" | "image/png";
    scheduleRelay?: string; // "1001-1"
    privatePIN?: string;
    cardCode?: string;
    isNew?: boolean;        // true (default) -> id=0,faceID=0 (create + face in one shot)
    path?: string;          // default "/api/user/set"; fallback "/web/user/set"
    session?: string;       // only for the /web transport
  }): Promise<void> {
    this.assertManagedId(opts.userId);
    const id = String(opts.userId);
    const sched = opts.scheduleRelay ?? "1001-1";
    const q = new URLSearchParams({
      UserID: id,
      name: opts.name,
      PrivatePIN: opts.privatePIN ?? "",
      RFcard: opts.cardCode ?? "",
      Floor: "0",
      WebRelay: "0",
      id: opts.isNew === false ? id : "0",
      faceID: "0",
      Phone: "",
      Group: "Default",
      Priority: "0",
      DialAccount: "0",
      relay: sched.split("-")[1] ?? "1",
      Schedule: sched,
      Schedule1: sched.split("-")[0] ?? "1001",
      faceupload: "1",
      web: "1",
    });
    if (opts.session) q.set("session", opts.session);

    const fd = new FormData();
    // Do NOT set Content-Type manually — fetch adds the multipart boundary.
    fd.append(
      "file",
      // Cast: a plain Uint8Array is a valid BlobPart at runtime, but TS 5.7's
      // DOM lib types BlobPart as ArrayBufferView<ArrayBuffer> which rejects the
      // generic Uint8Array<ArrayBufferLike>. Harmless, well-known lib friction.
      new Blob([opts.image as BlobPart], { type: opts.mime ?? "image/jpeg" }),
      opts.mime === "image/png" ? "face.png" : "face.jpg"
    );

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      const res = await fetch(
        `${this.cfg.baseUrl}${opts.path ?? "/api/user/set"}?${q.toString()}`,
        {
          method: "POST",
          headers: { Authorization: this.auth, ...this.cfHeaders() },
          body: fd,
          signal: ctrl.signal,
        }
      );
      if (res.status === 401) throw new AkuvoxError("401 on face upload — Basic creds rejected; the /web+session transport may be required.");
      if (!res.ok) throw new AkuvoxError(`HTTP ${res.status} on face upload.`);
      const body = await res.json();
      const ok =
        (body?.retcode === 0 || body?.retcode === 1) &&
        String(body?.message ?? "").toLowerCase() === "ok";
      if (!ok) throw new AkuvoxError("Device rejected face upload.", body);
    } finally {
      clearTimeout(t);
    }
    await this.verifyFace(id);
  }

  /** Confirm the face actually landed: FaceUrl should be non-empty after upload. */
  private async verifyFace(userId: string) {
    const u = await this.getUser(userId);
    if (!u) throw new AkuvoxError(`Face verify failed: UserID ${userId} not found after upload.`);
    if (!u.FaceUrl) throw new AkuvoxError(`Face verify failed: FaceUrl still empty for UserID ${userId}.`);
  }
}

export { ID_BAND_START };
