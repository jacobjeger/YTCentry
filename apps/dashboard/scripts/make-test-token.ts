/**
 * Portal SSO test kit — uses a THROWAWAY RS256 key pair, never the real portal key.
 *
 *   npx tsx scripts/make-test-token.ts                 # unit tests (no server, no DB)
 *   npx tsx scripts/make-test-token.ts keys <dir>      # write a test key pair to <dir>
 *   npx tsx scripts/make-test-token.ts sign <private.pem> [--aud doors] [--exp 60]
 *        [--email a@b.c] [--role user|admin] [--perms view,enroll] [--scope '{"doors":["front"]}']
 *   npx tsx scripts/make-test-token.ts e2e <baseUrl> <private.pem>
 *        # against a running dashboard started with PORTAL_PUBLIC_KEY=<dir>/public.pem
 *
 * Covers: wrong audience → refused, expired → refused, reused jti → refused,
 * missing perm → 403, admin → allowed (+ scope fail-closed, safe `next`).
 */
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, importPKCS8 } from "jose";
import {
  verifyPortalToken,
  PortalSsoError,
  buildAccess,
  permStatus,
  resolveScopeDoors,
  safeNext,
  type JtiStore,
} from "../src/lib/portal-core";

interface SignOpts {
  aud?: string;
  iss?: string;
  expSec?: number; // seconds from now (negative = already expired)
  email?: string;
  role?: "admin" | "user";
  perms?: string[];
  scope?: unknown;
  jti?: string;
  lang?: "he" | "en";
}

async function sign(privatePem: string, o: SignOpts = {}): Promise<string> {
  const key = await importPKCS8(privatePem, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const email = o.email ?? "test.user@ytchaim.com";
  const claims: Record<string, unknown> = {
    email,
    username: email,
    name: "Test User",
    role: o.role ?? "user",
    perms: o.perms ?? ["view"],
    lang: o.lang ?? "en",
  };
  if (o.scope !== undefined) claims.scope = o.scope;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(o.iss ?? "ytc-portal")
    .setAudience(o.aud ?? "doors")
    .setSubject("portal-user-1")
    .setJti(o.jti ?? randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + (o.expSec ?? 60))
    .sign(key);
}

function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function memoryStore(): JtiStore {
  const used = new Set<string>();
  return {
    async claim(jti) {
      if (used.has(jti)) return false;
      used.add(jti);
      return true;
    },
  };
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function expectCode(
  name: string,
  p: Promise<unknown>,
  code: PortalSsoError["code"] | "ok",
) {
  try {
    await p;
    check(name, code === "ok", "accepted");
  } catch (e) {
    const got = e instanceof PortalSsoError ? e.code : String(e);
    check(name, got === code, `got ${got}`);
  }
}

async function unitTests() {
  const { publicPem, privatePem } = makeKeys();
  const other = makeKeys();
  const store = memoryStore();
  // Env vars often store the PEM with literal "\n" — exercise that path too.
  const envStyle = publicPem.replace(/\n/g, "\\n");
  const v = (t: string) => verifyPortalToken(t, { publicKeyPem: envStyle, jtiStore: store });

  await expectCode("valid token → accepted", v(await sign(privatePem)), "ok");
  await expectCode("wrong audience → refused", v(await sign(privatePem, { aud: "payroll" })), "invalid_token");
  await expectCode("wrong issuer → refused", v(await sign(privatePem, { iss: "someone" })), "invalid_token");
  await expectCode("expired (2 min ago) → refused", v(await sign(privatePem, { expSec: -120 })), "expired");
  await expectCode("expired 10 s ago → accepted (30 s clock tolerance)", v(await sign(privatePem, { expSec: -10 })), "ok");
  await expectCode("long-lived (1 h) token → refused", v(await sign(privatePem, { expSec: 3600 })), "invalid_token");
  await expectCode("signed by another key → refused", v(await sign(other.privatePem)), "invalid_token");
  const once = await sign(privatePem, { jti: "jti-reuse-test" });
  await expectCode("first use of a jti → accepted", v(once), "ok");
  await expectCode("reused jti → refused", v(once), "reused");
  await expectCode("missing token → refused", v(""), "missing_token");
  await expectCode(
    "no PORTAL_PUBLIC_KEY → refused",
    verifyPortalToken(await sign(privatePem), { publicKeyPem: undefined, jtiStore: store }),
    "not_configured",
  );
  // alg=none / HS256 confusion: a token whose header isn't RS256 must fail.
  const hs = await new SignJWT({ email: "x@y.z" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("ytc-portal").setAudience("doors").setSubject("s").setJti(randomUUID())
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(publicPem));
  await expectCode("HS256 token keyed with the public PEM → refused", v(hs), "invalid_token");

  // Permissions (what every API route / Server Action checks).
  const doors = ["front", "kitchen-back"];
  const viewer = buildAccess({ via: "portal", role: "STAFF", portalIsAdmin: false, portalPerms: ["view"], portalScope: undefined, knownDoorKeys: doors });
  check("missing perm → 403", permStatus(viewer, "enroll") === 403);
  check("held perm → allowed", permStatus(viewer, "view") === 200);
  check("not signed in → 401", permStatus(null, "view") === 401);
  const admin = buildAccess({ via: "portal", role: "STAFF", portalIsAdmin: true, portalPerms: [], portalScope: { doors: [] }, knownDoorKeys: doors });
  check("admin → allowed (every perm)", (["view", "enroll", "remove", "admin", "logs"] as const).every((p) => permStatus(admin, p) === 200));
  check("admin → never door-limited", admin.doorKeys === null);
  const permAdmin = buildAccess({ via: "portal", role: "STAFF", portalIsAdmin: false, portalPerms: ["admin"], portalScope: undefined, knownDoorKeys: doors });
  check("`admin` perm implies all", permStatus(permAdmin, "temp_pins") === 200);
  const localStaff = buildAccess({ via: "local", role: "STAFF", portalIsAdmin: true, portalPerms: ["admin"], portalScope: { doors: [] }, knownDoorKeys: doors });
  check("local STAFF sign-in keeps today's access (no admin, all doors)", permStatus(localStaff, "remove") === 200 && permStatus(localStaff, "admin") === 403 && localStaff.doorKeys === null);
  const localAdmin = buildAccess({ via: "local", role: "ADMIN", portalIsAdmin: false, portalPerms: [], portalScope: undefined, knownDoorKeys: doors });
  check("local ADMIN sign-in keeps today's access", permStatus(localAdmin, "admin") === 200);

  // Door scope — fail closed.
  check("scope missing → every door", resolveScopeDoors(undefined, doors) === null);
  check("scope.doors list → those doors", JSON.stringify(resolveScopeDoors({ doors: ["front", "nope"] }, doors)) === '["front"]');
  check("scope.doors manifest key kitchen_back → kitchen-back", JSON.stringify(resolveScopeDoors({ doors: ["kitchen_back"] }, doors)) === '["kitchen-back"]');
  check("scope.doors [] → no doors", JSON.stringify(resolveScopeDoors({ doors: [] }, doors)) === "[]");
  check("scope.doors not a list → no doors", JSON.stringify(resolveScopeDoors({ doors: "front" }, doors)) === "[]");
  check("scope.doors names no known door → no doors", JSON.stringify(resolveScopeDoors({ doors: ["nope"] }, doors)) === "[]");

  // Redirect target.
  check("next=/directory kept", safeNext("/directory?x=1") === "/directory?x=1");
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", "/\u0000x"]) {
    check(`next=${JSON.stringify(bad)} → /`, safeNext(bad) === "/");
  }
}

// ── e2e against a running server ─────────────────────────────────────────────

async function sso(base: string, token: string, next = "/directory") {
  const url = `${base}/portal-sso?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  const res = await fetch(url, { redirect: "manual" });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((c) => c.startsWith("ytc_session=") && !c.startsWith("ytc_session=;"));
  return { status: res.status, location: res.headers.get("location") ?? "", session: session?.split(";")[0], setCookie };
}

async function e2e(base: string, privatePem: string) {
  base = base.replace(/\/+$/, "");
  const stamp = Date.now();

  const wrongAud = await sso(base, await sign(privatePem, { aud: "payroll" }));
  check("e2e wrong audience → refused", wrongAud.location.startsWith("/login?error=portal_invalid_token") && !wrongAud.session, wrongAud.location);
  check("e2e refusal does not echo the token", !wrongAud.location.includes("ey"), wrongAud.location);

  const expired = await sso(base, await sign(privatePem, { expSec: -120 }));
  check("e2e expired → refused", expired.location === "/login?error=portal_expired" && !expired.session, expired.location);

  const viewerTok = await sign(privatePem, { email: `viewer.${stamp}@ytchaim.com`, perms: ["view"] });
  const viewer = await sso(base, viewerTok, "/directory");
  check("e2e valid token → signed in + redirected to next", viewer.status === 303 && viewer.location === "/directory" && !!viewer.session, `${viewer.status} ${viewer.location}`);
  const cookieLine = viewer.setCookie.find((c) => c.startsWith("ytc_session=")) ?? "";
  console.log(`      cookie attrs: ${cookieLine.split(";").slice(1).join(";").trim()}`);

  const reused = await sso(base, viewerTok);
  check("e2e reused jti → refused", reused.location === "/login?error=portal_reused" && !reused.session, reused.location);

  const evilNext = await sso(base, await sign(privatePem, { email: `viewer.${stamp}@ytchaim.com` }), "//evil.example");
  check("e2e next=//evil.example → /", evilNext.location === "/", evilNext.location);

  // Missing perm → 403 (viewer has `view`, not `roster`).
  const photos = await fetch(`${base}/api/roster/photos?ids=x`, { headers: { cookie: viewer.session! }, redirect: "manual" });
  check("e2e missing perm → 403", photos.status === 403, String(photos.status));
  const dirPage = await fetch(`${base}/directory`, { headers: { cookie: viewer.session! }, redirect: "manual" });
  check("e2e held perm → page renders", dirPage.status === 200, String(dirPage.status));
  const enrollPage = await fetch(`${base}/enroll`, { headers: { cookie: viewer.session! }, redirect: "manual" });
  check("e2e page without perm → /no-access", enrollPage.status === 307 && (enrollPage.headers.get("location") ?? "").includes("/no-access"), `${enrollPage.status} ${enrollPage.headers.get("location")}`);
  const html = await dirPage.text();
  check("e2e portal session hides sign-out", !html.includes('action="/logout"'));

  const adminTok = await sign(privatePem, { email: `admin.${stamp}@ytchaim.com`, role: "admin", perms: [] });
  const admin = await sso(base, adminTok, "/");
  check("e2e admin token → signed in", !!admin.session, admin.location);
  const adminPhotos = await fetch(`${base}/api/roster/photos?ids=x`, { headers: { cookie: admin.session! }, redirect: "manual" });
  check("e2e admin → allowed (past the permission check)", adminPhotos.status !== 401 && adminPhotos.status !== 403, String(adminPhotos.status));
  const settings = await fetch(`${base}/admin/settings`, { headers: { cookie: admin.session! }, redirect: "manual" });
  check("e2e admin → settings page renders", settings.status === 200, String(settings.status));

  const manifest = await fetch(`${base}/portal-manifest.json`);
  const m = (await manifest.json()) as { id?: string; permissions?: unknown[] };
  check("e2e manifest is public JSON", manifest.status === 200 && m.id === "doors" && Array.isArray(m.permissions));
  check("e2e frame-ancestors header", (manifest.headers.get("content-security-policy") ?? "").startsWith("frame-ancestors 'self'"));
  check("e2e no X-Frame-Options", !manifest.headers.get("x-frame-options"));
  const anon = await fetch(`${base}/api/roster/photos?ids=x`, { redirect: "manual" });
  check("e2e no session → bounced to /login", anon.status === 307 && (anon.headers.get("location") ?? "").startsWith("/login"), String(anon.status));
}

async function main() {
  const [cmd, a1, a2, ...rest] = process.argv.slice(2);
  if (cmd === "keys") {
    const dir = a1 ?? "./portal-test-keys";
    mkdirSync(dir, { recursive: true });
    const { publicPem, privatePem } = makeKeys();
    writeFileSync(join(dir, "public.pem"), publicPem);
    writeFileSync(join(dir, "private.pem"), privatePem);
    console.log(`Wrote throwaway keys to ${dir}/ (public.pem → PORTAL_PUBLIC_KEY for a TEST server only)`);
    return;
  }
  if (cmd === "sign") {
    const args = [a2, ...rest].filter(Boolean) as string[];
    const opt = (n: string) => {
      const i = args.indexOf(`--${n}`);
      return i >= 0 ? args[i + 1] : undefined;
    };
    console.log(
      await sign(readFileSync(a1!, "utf8"), {
        aud: opt("aud"),
        expSec: opt("exp") ? Number(opt("exp")) : undefined,
        email: opt("email"),
        role: opt("role") === "admin" ? "admin" : "user",
        perms: opt("perms")?.split(",").filter(Boolean),
        scope: opt("scope") ? JSON.parse(opt("scope")!) : undefined,
      }),
    );
    return;
  }
  if (cmd === "e2e") {
    await e2e(a1!, readFileSync(a2!, "utf8"));
  } else {
    await unitTests();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nAll passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
