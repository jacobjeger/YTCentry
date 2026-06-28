/**
 * Retention: door-scanner submissions are transient — if a denied scan isn't
 * acted on within a week, drop it (and its stored snapshot). Emailed photos are
 * NOT expired here; they're kept until a human rejects/approves them.
 */
import { prisma } from "./db";
import { deletePhoto } from "./storage";

const DOOR = "door-scanner";

export async function cleanupExpiredDoorSubmissions(days = 7): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400000);
  const old = await prisma.photoSubmission.findMany({
    where: {
      fromAddress: DOOR,
      status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] },
      createdAt: { lt: cutoff },
    },
    select: { id: true, imagePath: true },
  });
  if (old.length === 0) return 0;
  for (const s of old) {
    if (s.imagePath) await deletePhoto(s.imagePath).catch(() => {});
  }
  await prisma.photoSubmission.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
  return old.length;
}
