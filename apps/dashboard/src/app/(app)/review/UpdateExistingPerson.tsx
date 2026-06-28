"use client";

import { useActionState, useState } from "react";
import {
  searchExistingPeople,
  updatePersonPhoto,
  type PersonHit,
  type ReviewState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

export default function UpdateExistingPerson({ submissionId }: { submissionId: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [state, action, pending] = useActionState<ReviewState, FormData>(updatePersonPhoto, {});

  async function onSearch(v: string) {
    setQ(v);
    setHits(v.trim().length >= 2 ? await searchExistingPeople(v) : []);
  }

  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-stone-400 mb-1">{t.review.updateExisting}</p>
      <input
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t.review.updateSearch}
        className="w-full max-w-xs rounded-lg border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bronze"
      />
      {hits.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          {hits.map((h) => (
            <form key={h.userID} action={action}>
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="userID" value={h.userID} />
              <button
                disabled={pending}
                className="w-full text-start rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span>
                  {h.name} <span className="text-stone-400">#{h.userID}</span>
                </span>
                <span className="text-xs text-bronze-dark">{t.review.updateBtn} →</span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-red-600 mt-1">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700 mt-1">{fmt(t.review.updatedMsg, { id: state.ok })}</p> : null}
    </div>
  );
}
