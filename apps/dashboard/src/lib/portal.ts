/**
 * YTC central portal SSO — the server glue around lib/portal-core.ts:
 * the Postgres jti ledger, and find-or-create of the StaffUser.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, Prisma, type StaffUser } from "@ytc/core";
import { hashPassword } from "./auth";
import {
  verifyPortalToken,
  PortalSsoError,
  type JtiStore,
  type PortalClaims,
} from "./portal-core";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Redeemed-jti ledger in Postgres. The primary key makes `claim` atomic. */
export const dbJtiStore: JtiStore = {
  async claim(jti) {
    await prisma.portalJti
      .deleteMany({ where: { usedAt: { lt: new Date(Date.now() - DAY_MS) } } })
      .catch(() => undefined);
    // INSERT … ON CONFLICT DO NOTHING: exactly one caller ever gets count 1.
    const { count } = await prisma.portalJti.createMany({
      data: [{ jti }],
      skipDuplicates: true,
    });
    return count === 1;
  },
};

/** Verify the token, burn its jti, and find-or-create + refresh the user. */
export async function redeemPortalToken(
  token: string | null,
): Promise<{ user: StaffUser; claims: PortalClaims }> {
  const claims = await verifyPortalToken(token, {
    publicKeyPem: process.env.PORTAL_PUBLIC_KEY,
    jtiStore: dbJtiStore,
  });

  const portalData = {
    portalManaged: true,
    portalSub: claims.sub,
    portalName: claims.name,
    portalIsAdmin: claims.role === "admin",
    portalPerms: claims.perms,
    // Store the scope claim exactly as sent; it is resolved against the current
    // door list on every request (see buildAccess / resolveScopeDoors).
    portalScope:
      claims.scope === undefined || claims.scope === null
        ? Prisma.DbNull
        : (claims.scope as Prisma.InputJsonValue),
    portalSyncedAt: new Date(),
  };

  const existing = await prisma.staffUser.findUnique({ where: { email: claims.email } });
  if (existing) {
    // A login switched off in Staff stays off, portal or not.
    if (!existing.active) throw new PortalSsoError("disabled");
    const user = await prisma.staffUser.update({ where: { id: existing.id }, data: portalData });
    return { user, claims };
  }

  // New person: no usable local password (a random one nobody knows). An admin
  // can still set one later in Staff if they should also sign in directly.
  const user = await prisma.staffUser.create({
    data: {
      email: claims.email,
      name: claims.name,
      role: "STAFF",
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      ...portalData,
    },
  });
  return { user, claims };
}
