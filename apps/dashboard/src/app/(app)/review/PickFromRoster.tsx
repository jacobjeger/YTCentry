"use client";

/**
 * Attach a submission to a roster entry chosen by hand.
 *
 * The auto-matched candidate buttons only appear when the matcher found
 * something, and it finds nothing when there's nothing to match on — an email
 * with no subject line carries no name. Without this, a good photo simply
 * couldn't be linked to its roster entry.
 */
import { useActionState, useState } from "react";
import { searchRoster, approveSubmission, type RosterHit, type ReviewState } from "./actions";
import { useT } from "@/components/LocaleProvider";

export default function PickFromRoster({ submissionId }: { submissionId: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RosterHit[]>([]);
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    approveSubmission,
    {},
  );

  async function onSearch(v: string) {
    setQ(v);
    setHits(v.trim().length >= 2 ? await searchRoster(v) : []);
  }

  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
        {t.review.pickRoster}
      </p>
      <input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t.review.pickRosterSearch}
        className="w-full max-w-xs rounded-lg border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bronze"
      />
      {q.trim().length >= 2 && hits.length === 0 ? (
        <p className="mt-1 text-xs text-stone-400">{t.review.pickRosterNone}</p>
      ) : null}
      {hits.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          {hits.map((h) => (
            <form key={h.studentId} action={action}>
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="studentId" value={h.studentId} />
              <button
                disabled={pending}
                className="w-full text-start rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span>
                  {h.name}
                  {h.shiur ? <span className="text-stone-400"> · {h.shiur}</span> : null}
                </span>
                <span className="text-xs text-bronze-dark">{t.review.approveAs} →</span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-red-600 mt-1">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700 mt-1">{state.ok}</p> : null}
    </div>
  );
}
