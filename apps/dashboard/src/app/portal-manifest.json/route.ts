/**
 * GET /portal-manifest.json — public, cache-friendly. Lists this site's
 * permissions, sidebar tiles and the `doors` scope (real door keys from the DB)
 * for the YTC portal. No secrets: door names and keys only.
 */
import { prisma } from "@ytc/core";
import { buildManifest } from "@/lib/manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  let doors: { key: string; name: string }[] = [];
  try {
    doors = await prisma.device.findMany({
      orderBy: { sortOrder: "asc" },
      select: { key: true, name: true },
    });
  } catch (e) {
    console.error("[portal-manifest] could not read doors", e);
  }
  return Response.json(buildManifest(doors), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
