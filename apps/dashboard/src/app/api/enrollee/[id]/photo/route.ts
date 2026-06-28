/**
 * Serves an enrollee's stored face photo, named after the person.
 *   GET /api/enrollee/<id>/photo            → inline (e.g. <img src>)
 *   GET /api/enrollee/<id>/photo?download=1 → attachment, "First Last.jpg"
 * Auth: a logged-in staff session (cookie). Not the agent bearer API.
 */
import { prisma, getPhotoBytes } from "@ytc/core";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const e = await prisma.enrollee.findUnique({ where: { id } });
  if (!e || !e.photoPath) return new Response("not found", { status: 404 });

  let bytes: Uint8Array;
  try {
    bytes = await getPhotoBytes(e.photoPath);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = e.displayName.trim() || "person";
  const ascii = name.replace(/[^\x20-\x7E]/g, "_"); // ASCII fallback filename
  const disposition = `${download ? "attachment" : "inline"}; filename="${ascii}.jpg"; filename*=UTF-8''${encodeURIComponent(name)}.jpg`;

  return new Response(new Blob([bytes as BlobPart], { type: "image/jpeg" }), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  });
}
