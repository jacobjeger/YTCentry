import JSZip from "jszip";
import { prisma, getPhotoBytes } from "@ytc/core";
import { requireUser } from "@/lib/auth";

/** Zip the photos of the selected roster people, each named by the person. */
export async function GET(req: Request) {
  await requireUser();
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return new Response("No people selected.", { status: 400 });

  const entries = await prisma.rosterEntry.findMany({
    where: { id: { in: ids } },
    include: { enrollee: { select: { photoPath: true } } },
  });

  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;
  for (const e of entries) {
    const path = e.enrollee?.photoPath;
    if (!path) continue;
    try {
      const bytes = await getPhotoBytes(path);
      const base = e.fullName.replace(/[^\p{L}\p{N} _.-]/gu, "").trim() || e.studentId;
      let fn = `${base}.jpg`;
      let i = 2;
      while (used.has(fn)) fn = `${base} (${i++}).jpg`;
      used.add(fn);
      zip.file(fn, bytes);
      added++;
    } catch {
      /* skip a photo we can't read */
    }
  }
  if (added === 0) return new Response("None of the selected people have a photo.", { status: 404 });

  const blob = await zip.generateAsync({ type: "uint8array" });
  return new Response(blob as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="roster-photos.zip"`,
    },
  });
}
