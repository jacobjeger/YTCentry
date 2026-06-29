"use client";

import { useActionState, useEffect, useState } from "react";
import {
  listSchedulesUI,
  createScheduleAction,
  deleteScheduleAction,
  type ScheduleRow,
  type SchedState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";
const BUILTIN = new Set([1001, 1002]);

export default function SchedulesManager() {
  const t = useT();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [days, setDays] = useState<Set<number>>(new Set());
  const [state, action, pending] = useActionState<SchedState, FormData>(createScheduleAction, {});
  const letters = t.temp.dayLetters.split(",");

  async function reload() {
    setRows(await listSchedulesUI());
  }
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (state.ok) {
      setDays(new Set());
      reload();
    }
  }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (i: number) =>
    setDays((p) => {
      const n = new Set(p);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.schedules.title}</h1>
        <p className="text-stone-500 mt-1">{t.schedules.subtitle}</p>
      </div>

      {/* Create */}
      <form action={action} className="rounded-xl border border-stone-200 bg-white p-6 flex flex-col gap-3">
        <h2 className="font-semibold">{t.schedules.createTitle}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">{t.schedules.name}</span>
          <input name="name" required placeholder={t.schedules.namePlaceholder} className={input} />
        </label>
        <div>
          <span className="text-sm font-medium text-stone-700">{t.schedules.days}</span>
          <div className="flex gap-1.5 mt-1">
            {letters.map((ltr, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={`w-9 h-9 rounded-full text-sm font-medium border ${
                  days.has(i) ? "border-bronze bg-bronze text-white" : "border-stone-300 text-stone-600 hover:bg-stone-50"
                }`}>
                {ltr}
              </button>
            ))}
            {[...days].map((d) => <input key={d} type="hidden" name="days" value={d} />)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">{t.schedules.timeFrom}</span>
            <input name="timeFrom" type="time" lang="en-GB" defaultValue="07:00" className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">{t.schedules.timeTo}</span>
            <input name="timeTo" type="time" lang="en-GB" defaultValue="09:00" className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">{t.schedules.until}</span>
            <input name="until" type="date" lang="en-GB" className={input} />
          </label>
        </div>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-green-700">{fmt(t.schedules.created, { name: state.ok })}</p> : null}
        <button type="submit" disabled={pending}
          className="rounded-lg bg-bronze px-5 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60 w-fit">
          {pending ? t.schedules.creating : t.schedules.create}
        </button>
      </form>

      {/* List */}
      <div>
        <h2 className="font-semibold mb-3">{t.schedules.listTitle}</h2>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-500">{t.schedules.none}</div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden divide-y divide-stone-100">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
                <div className="flex-1">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-stone-400 ms-2">#{s.scheduleID}</span>
                </div>
                {BUILTIN.has(s.scheduleID) ? (
                  <span className="text-xs text-stone-400">{t.schedules.builtin}</span>
                ) : (
                  <form action={deleteScheduleAction} onSubmit={(e) => { if (!confirm(t.schedules.confirmRemove)) e.preventDefault(); else setTimeout(reload, 400); }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="scheduleID" value={s.scheduleID} />
                    <button className="text-xs text-red-600 hover:underline">{t.schedules.remove}</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
