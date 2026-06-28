"use client";

import { useActionState, useState } from "react";
import {
  approveSubmission,
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

export default function ReviewCard({ item }: { item: ReviewItem }) {
  const t = useT();
  const [state, action, pending] = useActionState<ReviewState, FormData>(
    approveSubmission,
    {},
  );
  const [otherId, setOtherId] = useState("");

  if (state.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
        {state.ok}
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
        <p className="text-sm text-stone-500">
          {t.review.from}: <span className="text-stone-700">{item.from}</span>
        </p>
        <p className="font-medium truncate">
          {item.subject || item.parsedName || "—"}
        </p>
        {item.faceValid === false ? (
          <p className="text-sm text-amber-700 mt-1">
            ⚠ {t.review.noFaceWarn}
            {item.faceNote ? ` (${item.faceNote})` : ""}
          </p>
        ) : null}

        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">
            {t.review.candidates}
          </p>
          {item.candidates.length === 0 ? (
            <p className="text-sm text-stone-400">{t.review.noCandidates}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {item.candidates.map((c) => (
                <form key={c.studentId} action={action}>
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
          )}
        </div>

        {/* Re-assign by a different student ID */}
        <form action={action} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="submissionId" value={item.id} />
          <input
            name="studentId"
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            placeholder={t.review.otherIdPlaceholder}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-bronze"
          />
          <button
            type="submit"
            disabled={pending || !otherId.trim()}
            className="rounded-lg bg-stone-800 text-white px-3 py-1.5 text-sm hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? t.review.approving : t.review.matchById}
          </button>
        </form>

        {state.error ? (
          <p className="text-sm text-red-600 mt-2">{state.error}</p>
        ) : null}
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
