"use client";

import { useActionState } from "react";
import {
  approveSubmission,
  enrollByName,
  rejectSubmission,
  type ReviewState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";

export interface ReviewItem {
  id: string;
  from: string;
  subject: string;
  parsedName: string | null;
  faceValid: boolean | null;
  faceNote: string | null;
  photoUrl: string;
  candidates: { studentId: string; name: string; score: number }[];
}

export default function ReviewCard({
  item,
  groups,
}: {
  item: ReviewItem;
  groups: string[];
}) {
  const t = useT();
  const [aState, approveAction, aPending] = useActionState<ReviewState, FormData>(
    approveSubmission,
    {},
  );
  const [nState, nameAction, nPending] = useActionState<ReviewState, FormData>(
    enrollByName,
    {},
  );
  const ok = aState.ok ?? nState.ok;
  const error = aState.error ?? nState.error;
  const pending = aPending || nPending;

  if (ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
        {ok}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 flex flex-col sm:flex-row gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.photoUrl}
        alt="submission"
        className="w-32 h-32 rounded-lg object-cover bg-stone-100 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-xs rounded-full px-2 py-0.5 ${
              item.from === "door-scanner"
                ? "bg-amber-100 text-amber-800"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            {item.from === "door-scanner" ? t.review.sourceDoor : t.review.sourceEmail}
          </span>
          <span className="text-xs text-stone-400 truncate">{item.subject}</span>
        </div>
        {item.faceValid === false ? (
          <p className="text-sm text-amber-700 mb-2">
            ⚠ {t.review.noFaceWarn}
            {item.faceNote ? ` (${item.faceNote})` : ""}
          </p>
        ) : null}

        {/* Primary: type a name and add (no roster needed). */}
        <form action={nameAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="submissionId" value={item.id} />
          <input
            name="displayName"
            defaultValue={item.parsedName ?? ""}
            required
            placeholder={t.review.namePlaceholder}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm flex-1 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-bronze"
          />
          <select
            name="groupName"
            defaultValue=""
            className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bronze"
          >
            <option value="">{t.enroll.groupNone}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            name="pin"
            inputMode="numeric"
            placeholder={t.enroll.pinLabel}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-bronze"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-bronze px-4 py-1.5 text-sm font-medium text-white hover:bg-bronze-dark disabled:opacity-50"
          >
            {pending ? t.review.approving : t.review.addByName}
          </button>
        </form>

        {/* Secondary: roster candidates (emailed photos that matched). */}
        {item.candidates.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
              {t.review.orMatchRoster}
            </p>
            <div className="flex flex-wrap gap-2">
              {item.candidates.map((c) => (
                <form key={c.studentId} action={approveAction}>
                  <input type="hidden" name="submissionId" value={item.id} />
                  <input type="hidden" name="studentId" value={c.studentId} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg border border-bronze bg-bronze/5 px-3 py-1.5 text-sm hover:bg-bronze/15 disabled:opacity-50"
                    title={`${(c.score * 100).toFixed(0)}%`}
                  >
                    {t.review.approveAs} <b>{c.name}</b>{" "}
                    <span className="text-stone-400">({c.studentId})</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </div>

      <form action={rejectSubmission} className="shrink-0">
        <input type="hidden" name="submissionId" value={item.id} />
        <button
          type="submit"
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          {t.review.reject}
        </button>
      </form>
    </div>
  );
}
