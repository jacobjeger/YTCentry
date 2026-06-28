import Link from "next/link";
import { prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";

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
  const s = await stats();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
        <p className="text-stone-500">
          Enroll talmidim on the door reader — upload a photo or approve an
          emailed one.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Enrolled on door" value={s.enrolled} href="/directory" />
        <StatCard label="Awaiting review" value={s.needsReview} href="/review" />
        <StatCard label="In push queue" value={s.queued} href="/directory" />
        <StatCard
          label="Push failed"
          value={s.pushFailed}
          href="/directory"
          warn={s.pushFailed > 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          href="/enroll"
          title="Add a person"
          body="Type a name, snap or upload a photo, and send them to the door."
          primary
        />
        <ActionCard
          href="/review"
          title="Review emailed photos"
          body="Match incoming photos to the roster and approve them for enrollment."
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
        primary
          ? "border-bronze bg-bronze/5"
          : "border-stone-200 bg-white"
      }`}
    >
      <h2 className="text-lg font-semibold text-bronze-dark">{title}</h2>
      <p className="text-sm text-stone-600 mt-1">{body}</p>
    </Link>
  );
}
