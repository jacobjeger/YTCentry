import Link from "next/link";
import { prisma, signedPhotoUrl, type Prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { type ReviewItem } from "./ReviewCard";
import ReviewList from "./ReviewList";

export const dynamic = "force-dynamic";

const DOOR = "door-scanner";
type Source = "all" | "email" | "denied";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  await requireUser();
  const t = getDictionary(await getLocale());

  const raw = (await searchParams).source;
  const source: Source =
    raw === "email" || raw === "denied" ? raw : "all";

  const sourceWhere: Prisma.PhotoSubmissionWhereInput =
    source === "denied"
      ? { fromAddress: DOOR }
      : source === "email"
        ? { fromAddress: { not: DOOR } }
        : {};

  const submissions = await prisma.photoSubmission.findMany({
    where: {
      status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] },
      ...sourceWhere,
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const filters: { key: Source; label: string }[] = [
    { key: "all", label: t.review.filterAll },
    { key: "email", label: t.review.filterEmail },
    { key: "denied", label: t.review.filterDenied },
  ];

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
      <p className="text-stone-500 mt-1 mb-4">{t.review.subtitle}</p>

      <div className="flex gap-2 mb-6">
        {filters.map((f) => {
          const active = source === f.key;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/review" : `/review?source=${f.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-bronze text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.review.empty}
        </div>
      ) : (
        <ReviewList items={items} />
      )}
    </div>
  );
}
