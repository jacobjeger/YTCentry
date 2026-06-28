import Link from "next/link";
import { prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function stats() {
  const [needsReview, pushFailed, queued, enrolled] = await Promise.all([
    prisma.photoSubmission.count({
      where: { status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] } },
    }),
    prisma.enrollee.count({ where: { status: "PUSH_FAILED" } }),
    prisma.pushJob.count({ where: { status: { in: ["QUEUED", "CLAIMED"] } } }),
    prisma.enrollee.count({ where: { status: "PUSHED" } }),
  ]);
  return { needsReview, pushFailed, queued, enrolled };
}

export default async function Home() {
  const user = await requireUser();
  const t = getDictionary(await getLocale());
  const s = await stats();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {fmt(t.home.welcome, { name: user.name })}
        </h1>
        <p className="text-stone-500">{t.home.subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.home.enrolled} value={s.enrolled} href="/directory" />
        <StatCard
          label={t.home.awaitingReview}
          value={s.needsReview}
          href="/review"
        />
        <StatCard label={t.home.inQueue} value={s.queued} href="/directory" />
        <StatCard
          label={t.home.pushFailed}
          value={s.pushFailed}
          href="/directory"
          warn={s.pushFailed > 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          href="/enroll"
          title={t.home.addTitle}
          body={t.home.addBody}
          primary
        />
        <ActionCard
          href="/review"
          title={t.home.reviewTitle}
          body={t.home.reviewBody}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  warn,
}: {
  label: string;
  value: number;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-stone-200 bg-white p-5 hover:shadow-sm transition-shadow"
    >
      <div
        className={`text-3xl font-semibold ${warn ? "text-red-600" : "text-stone-800"}`}
      >
        {value}
      </div>
      <div className="text-sm text-stone-500 mt-1">{label}</div>
    </Link>
  );
}

function ActionCard({
  href,
  title,
  body,
  primary,
}: {
  href: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-6 transition-shadow hover:shadow-sm ${
        primary ? "border-bronze bg-bronze/5" : "border-stone-200 bg-white"
      }`}
    >
      <h2 className="text-lg font-semibold text-bronze-dark">{title}</h2>
      <p className="text-sm text-stone-600 mt-1">{body}</p>
    </Link>
  );
}
