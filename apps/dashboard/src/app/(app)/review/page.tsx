import { prisma, signedPhotoUrl } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import ReviewCard, { type ReviewItem } from "./ReviewCard";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireUser();
  const t = getDictionary(await getLocale());

  const submissions = await prisma.photoSubmission.findMany({
    where: { status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const items: ReviewItem[] = await Promise.all(
    submissions.map(async (s) => ({
      id: s.id,
      from: s.fromAddress,
      subject: s.subjectRaw ?? "",
      parsedName: s.parsedName,
      faceValid: s.faceValid,
      faceNote: s.faceNote,
      photoUrl: await signedPhotoUrl(s.imagePath, 600),
      candidates: Array.isArray(s.matchCandidates)
        ? (s.matchCandidates as { studentId: string; name: string; score: number }[])
        : [],
    })),
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">{t.review.title}</h1>
      <p className="text-stone-500 mt-1 mb-6">{t.review.subtitle}</p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.review.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
