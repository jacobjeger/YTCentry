import { prisma } from "@ytc/core";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

/**
 * How much of the roster actually has a face on file.
 *
 * "hasPhoto" is defined exactly as the roster table below defines it — an
 * enrollee row with a stored photo — so the headline number can never disagree
 * with the list it sits above.
 */
export default async function RosterStats() {
  const t = getDictionary(await getLocale());
  const [total, withPhoto] = await Promise.all([
    prisma.rosterEntry.count(),
    prisma.rosterEntry.count({ where: { enrollee: { photoPath: { not: null } } } }),
  ]);
  if (total === 0) return null; // nothing imported yet — the upload box says it all

  const pct = Math.round((withPhoto / total) * 100);
  const remaining = total - withPhoto;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 mb-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {withPhoto}
            <span className="text-stone-400"> / {total}</span>
          </span>
          <span className="text-sm text-stone-500">{t.roster.statsHave}</span>
        </div>
        <span className="text-2xl font-semibold text-bronze tabular-nums">{pct}%</span>
      </div>

      <div
        className="mt-3 h-2 w-full rounded-full bg-stone-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.roster.statsHave}
      >
        <div className="h-full bg-bronze transition-all" style={{ width: `${pct}%` }} />
      </div>

      {remaining > 0 ? (
        <p className="text-sm text-stone-500 mt-2">
          {fmt(t.roster.statsRemaining, { count: remaining })}
        </p>
      ) : (
        <p className="text-sm text-green-700 mt-2">{t.roster.statsComplete}</p>
      )}
    </div>
  );
}
