"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReviewCard, { type ReviewItem } from "./ReviewCard";
import { listGroups } from "../enroll/actions";
import { rejectManySubmissions } from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  const t = useT();
  const router = useRouter();
  const [groups, setGroups] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    listGroups().then(setGroups);
  }, []);

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const allOnPage = items.length > 0 && items.every((i) => sel.has(i.id));
  const toggleAll = () => setSel(allOnPage ? new Set() : new Set(items.map((i) => i.id)));

  const rejectSelected = () =>
    start(async () => {
      await rejectManySubmissions([...sel]);
      setSel(new Set());
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 px-1">
        <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
          <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-bronze" />
          {t.review.selectAll}
        </label>
        {sel.size > 0 ? (
          <button
            onClick={rejectSelected}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {fmt(t.review.rejectSelected, { n: sel.size })}
          </button>
        ) : null}
      </div>
      {items.map((item) => (
        <ReviewCard
          key={item.id}
          item={item}
          groups={groups}
          selected={sel.has(item.id)}
          onToggle={() => toggle(item.id)}
        />
      ))}
    </div>
  );
}
