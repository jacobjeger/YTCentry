import Link from "next/link";
import { prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function stats() {
  const primary = await prisma.device.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const [people, doors, needsReview, guests, pushFailed] = await Promise.all([
    primary ? prisma.deviceUserCache.count({ where: { deviceId: primary.id } }) : 0,
    prisma.device.count({ where: { active: true } }),
    prisma.photoSubmission.count({
      where: { status: { in: ["RECEIVED", "NEEDS_MATCH", "MATCHED"] } },
    }),
    prisma.tempPin.count(),
    prisma.enrollee.count({ where: { status: "PUSH_FAILED" } }),
  ]);
  return { people, doors, needsReview, guests, pushFailed };
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
        <StatCard label={t.home.peopleOnDoor} value={s.people} href="/directory" />
        <StatCard label={t.home.doors} value={s.doors} href="/directory" />
        <StatCard
          label={t.home.awaitingReview}
          value={s.needsReview}
          href="/review"
        />
        {s.pushFailed > 0 ? (
          <StatCard
            label={t.home.pushFailed}
            value={s.pushFailed}
            href="/directory"
            warn
          />
        ) : (
          <StatCard label={t.home.guestCodes} value={s.guests} href="/temp-pins" />
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-stone-400 mb-3">
          {t.home.whatToDo}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            href="/enroll"
            icon="➕"
            title={t.home.addTitle}
            body={t.home.addBody}
            primary
          />
          <ActionCard
            href="/review"
            icon="📷"
            title={t.home.reviewTitle}
            body={t.home.reviewBody}
            badge={s.needsReview > 0 ? s.needsReview : undefined}
          />
          <ActionCard
            href="/temp-pins"
            icon="🔑"
            title={t.home.tempTitle}
            body={t.home.tempBody}
          />
          <ActionCard
            href="/roster"
            icon="📋"
            title={t.home.rosterTitle}
            body={t.home.rosterBody}
          />
          <ActionCard
            href="/directory"
            icon="👥"
            title={t.home.dirTitle}
            body={t.home.dirBody}
          />
        </div>
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
      className={`rounded-xl border bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${
        warn && value > 0 ? "border-red-200 bg-red-50/50" : "border-stone-200"
      }`}
    >
      <div
        className={`text-3xl font-semibold ${warn && value > 0 ? "text-red-600" : "text-stone-800"}`}
      >
        {value}
      </div>
      <div className="text-sm text-stone-500 mt-1">{label}</div>
    </Link>
  );
}

function ActionCard({
  href,
  icon,
  title,
  body,
  primary,
  badge,
}: {
  href: string;
  icon: string;
  title: string;
  body: string;
  primary?: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`relative flex flex-col rounded-2xl border p-6 transition-all hover:shadow-md hover:-translate-y-0.5 ${
        primary ? "border-bronze bg-bronze/5" : "border-stone-200 bg-white"
      }`}
    >
      {badge ? (
        <span className="absolute top-4 end-4 min-w-6 h-6 px-1.5 grid place-items-center rounded-full bg-red-500 text-white text-xs font-semibold">
          {badge}
        </span>
      ) : null}
      <span className="text-3xl mb-3" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-bronze-dark">{title}</h3>
      <p className="text-sm text-stone-600 mt-1">{body}</p>
    </Link>
  );
}
