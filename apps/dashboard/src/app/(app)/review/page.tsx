import Link from "next/link";
import { prisma, signedPhotoUrl, type Prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";
import { type ReviewItem } from "./ReviewCard";
import ReviewList from "./ReviewList";

export const dynamic = "force-dynamic";

/** One pager control — a link when it goes somewhere, greyed out when it doesn't. */
function PageLink({
  href,
  enabled,
  label,
  glyph,
}: {
  href: string;
  enabled: boolean;
  label: string;
  glyph: string;
}) {
  if (!enabled) {
    return (
      <span
        aria-hidden
        className="rounded-lg border border-stone-200 px-3 py-1.5 text-stone-300"
      >
        {glyph}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
    >
      {glyph}
    </Link>
  );
}

const DOOR = "door-scanner";
type Source = "all" | "email" | "denied";

const PAGE_SIZE = 24;

type Sort = "newest" | "oldest";

/**
 * Emailed photos are a queue, so the fair default is oldest-first — whoever has
 * waited longest gets dealt with first. Denied door scans are the opposite: you
 * are looking at who was just turned away, and the newest ones sat on the LAST
 * page where nobody saw them.
 */
const defaultSort = (source: Source): Sort => (source === "denied" ? "newest" : "oldest");

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; page?: string; sort?: string }>;
}) {
  await requireUser();
  const t = getDictionary(await getLocale());

  const sp = await searchParams;
  const source: Source =
    sp.source === "email" || sp.source === "denied" ? sp.source : "all";
  const sort: Sort =
    sp.sort === "newest" || sp.sort === "oldest" ? sp.sort : defaultSort(source);
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

  // Counted first so the page number can be clamped BEFORE fetching. Asking for
  // a page past the end used to return nothing at all, which is what "jump to
  // the last page, then switch filter" did.
  const total = await prisma.photoSubmission.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const submissions = await prisma.photoSubmission.findMany({
    where,
    orderBy: { createdAt: sort === "newest" ? "desc" : "asc" },
    skip: safePage * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const hrefFor = (p: number, s: Sort = sort) =>
    `/review?${new URLSearchParams({
      ...(source !== "all" ? { source } : {}),
      // Only carry `sort` when it isn't this filter's default, so the common
      // URLs stay clean and a shared link still means what it looks like.
      ...(s !== defaultSort(source) ? { sort: s } : {}),
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
      // An unusable submission (unreadable attachment) has no stored image —
      // signing an empty key would render a broken thumbnail.
      photoUrl: s.imagePath ? await signedPhotoUrl(s.imagePath, 600) : null,
      // The in-use image first, then the others that arrived in the same email.
      photos: await Promise.all(
        [s.imagePath, ...s.altImagePaths]
          .filter(Boolean)
          .map(async (path) => ({ path, url: await signedPhotoUrl(path, 600) })),
      ),
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

      {/* Newest / oldest. Sorting resets to page 1 — keeping the page number
          while flipping the order lands you somewhere arbitrary. */}
      {total > 1 ? (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="text-stone-500">{t.review.sortLabel}</span>
          {([
            { key: "newest" as Sort, label: t.review.sortNewest },
            { key: "oldest" as Sort, label: t.review.sortOldest },
          ]).map((o) => (
            <Link
              key={o.key}
              href={hrefFor(0, o.key)}
              aria-current={sort === o.key ? "true" : undefined}
              className={`rounded-lg px-2.5 py-1 font-medium ${
                sort === o.key
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.review.empty}
        </div>
      ) : (
        <>
          <ReviewList items={items} />
          {pageCount > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm">
              <PageLink
                href={hrefFor(0)}
                enabled={safePage > 0}
                label={t.review.firstPage}
                glyph="«"
              />
              <PageLink
                href={hrefFor(safePage - 1)}
                enabled={safePage > 0}
                label={t.review.prevPage}
                glyph="←"
              />
              <span className="text-stone-500 px-1 tabular-nums">
                {safePage + 1} / {pageCount}
              </span>
              <PageLink
                href={hrefFor(safePage + 1)}
                enabled={safePage < pageCount - 1}
                label={t.review.nextPage}
                glyph="→"
              />
              <PageLink
                href={hrefFor(pageCount - 1)}
                enabled={safePage < pageCount - 1}
                label={t.review.lastPage}
                glyph="»"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
