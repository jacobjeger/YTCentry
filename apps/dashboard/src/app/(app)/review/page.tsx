import Link from "next/link";
import { prisma, signedPhotoUrl, type Prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";
import { type ReviewItem } from "./ReviewCard";
import ReviewList from "./ReviewList";

export const dynamic = "force-dynamic";

const DOOR = "door-scanner";
type Source = "all" | "email" | "denied";

const PAGE_SIZE = 24;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; page?: string }>;
}) {
  await requireUser();
  const t = getDictionary(await getLocale());

  const sp = await searchParams;
  const source: Source =
    sp.source === "email" || sp.source === "denied" ? sp.source : "all";
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const sourceWhere: Prisma.PhotoSubmissionWhereInput =
    source === "denied"
      ? { fromAddress: DOOR }
      : source === "email"
        ? { fromAddress: { not: DOOR } }
        : {};

  const where: Prisma.PhotoSubmissionWhereInput = {
    status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] },
    ...sourceWhere,
  };

  const [total, submissions] = await Promise.all([
    prisma.photoSubmission.count({ where }),
    prisma.photoSubmission.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const hrefFor = (p: number) =>
    `/review?${new URLSearchParams({
      ...(source !== "all" ? { source } : {}),
      ...(p > 0 ? { page: String(p) } : {}),
    }).toString()}`.replace(/\?$/, "");

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

      <div className="flex items-center gap-2 mb-6 flex-wrap">
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
        <span className="text-sm text-stone-500 ms-auto">
          {fmt(t.review.total, { n: total })}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.review.empty}
        </div>
      ) : (
        <>
          <ReviewList items={items} />
          {pageCount > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              {safePage > 0 ? (
                <Link
                  href={hrefFor(safePage - 1)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
                >
                  ←
                </Link>
              ) : (
                <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-300">←</span>
              )}
              <span className="text-stone-500">
                {safePage + 1} / {pageCount}
              </span>
              {safePage < pageCount - 1 ? (
                <Link
                  href={hrefFor(safePage + 1)}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
                >
                  →
                </Link>
              ) : (
                <span className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-300">→</span>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
