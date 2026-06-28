"use client";

import { useActionState, useEffect, useState } from "react";
import {
  listTempPinsUI,
  listTempDoors,
  createTempPinAction,
  extendTempPinAction,
  revokeTempPinAction,
  type TempPinRow,
  type TempState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** A Date as a local `YYYY-MM-DDTHH:mm` for datetime-local inputs. */
function localDT(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function defaultEnd(): string {
  return localDT(new Date(Date.now() + 12 * 3600000));
}
/** Local 24-hour "DD/MM HH:mm" for showing a start time. */
function fmtStart(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TempPinsManager() {
  const t = useT();
  const [pins, setPins] = useState<TempPinRow[]>([]);
  const [doors, setDoors] = useState<{ id: string; name: string }[]>([]);
  const [, tick] = useState(0);
  const [mode, setMode] = useState<"once" | "repeat">("once");
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState(defaultEnd());
  const [days, setDays] = useState<Set<number>>(new Set());
  const dayLetters = t.temp.dayLetters.split(",");
  const toggleDay = (i: number) =>
    setDays((p) => {
      const n = new Set(p);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  const [state, action, pending] = useActionState<TempState, FormData>(
    createTempPinAction,
    {},
  );

  async function reload() {
    setPins(await listTempPinsUI());
  }
  useEffect(() => {
    listTempDoors().then(setDoors);
    reload();
  }, []);
  useEffect(() => {
    if (state.ok) reload();
  }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  // live countdown
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.temp.title}</h1>
        <p className="text-stone-500 mt-1">{t.temp.subtitle}</p>
      </div>

      {/* Create */}
      <form
        action={action}
        className="rounded-xl border border-stone-200 bg-white p-6 flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">{t.temp.label}</span>
            <input name="label" required placeholder={t.temp.labelPlaceholder} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">{t.temp.door}</span>
            <select name="deviceId" defaultValue={doors[0]?.id ?? ""} className={input}>
              {doors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input type="hidden" name="mode" value={mode} />
        {/* Mode toggle */}
        <div className="flex gap-2">
          {(["once", "repeat"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium border ${
                mode === m
                  ? "border-bronze bg-bronze/10 text-bronze-dark"
                  : "border-stone-300 text-stone-600 hover:bg-stone-50"
              }`}
            >
              {m === "once" ? t.temp.once : t.temp.repeat}
            </button>
          ))}
        </div>

        {mode === "once" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">{t.temp.starts}</span>
                {/* lang=en-GB forces 24-hour time (the scanner uses 24h) */}
                <input
                  name="startsAt"
                  type="datetime-local"
                  lang="en-GB"
                  value={startVal}
                  onChange={(e) => setStartVal(e.target.value)}
                  className={input}
                />
                <span className="text-xs text-stone-400">{t.temp.startsHint}</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">{t.temp.ends}</span>
                <input
                  name="endsAt"
                  type="datetime-local"
                  lang="en-GB"
                  value={endVal}
                  onChange={(e) => setEndVal(e.target.value)}
                  className={input}
                />
              </label>
            </div>
            {/* Quick shortcuts */}
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => setStartVal("")}
                className="rounded-full border border-stone-300 px-3 py-1 hover:bg-stone-50">
                {t.temp.startNow}
              </button>
              {([["+2h", 2 / 24], ["+4h", 4 / 24], ["+1d", 1], ["+1w", 7]] as const).map(
                ([lbl, d]) => (
                  <button key={lbl} type="button"
                    onClick={() => { setStartVal(""); setEndVal(localDT(new Date(Date.now() + d * 86400000))); }}
                    className="rounded-full border border-stone-300 px-3 py-1 hover:bg-stone-50">
                    {lbl}
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-sm font-medium text-stone-700">{t.temp.days}</span>
              <div className="flex gap-1.5 mt-1">
                {dayLetters.map((ltr, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-full text-sm font-medium border ${
                      days.has(i)
                        ? "border-bronze bg-bronze text-white"
                        : "border-stone-300 text-stone-600 hover:bg-stone-50"
                    }`}>
                    {ltr}
                  </button>
                ))}
                {[...days].map((d) => (
                  <input key={d} type="hidden" name="days" value={d} />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">{t.temp.timeFrom}</span>
                <input name="timeFrom" type="time" lang="en-GB" defaultValue="07:00" className={input} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">{t.temp.timeTo}</span>
                <input name="timeTo" type="time" lang="en-GB" defaultValue="09:00" className={input} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-stone-700">{t.temp.until}</span>
                <input name="until" type="date" lang="en-GB"
                  defaultValue={localDate(new Date(Date.now() + 365 * 86400000))} className={input} />
              </label>
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 max-w-xs">
          <span className="text-sm font-medium text-stone-700">{t.temp.customPin}</span>
          <input
            name="pin"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="••••"
            className={input}
          />
          <span className="text-xs text-stone-400">{t.temp.customPinHint}</span>
        </label>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.ok ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-green-700">{state.ok.label}</div>
              <div className="text-3xl font-mono font-bold tracking-widest text-green-800">
                {state.ok.pin}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(state.ok!.pin)}
              className="rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-green-800 hover:bg-green-100"
            >
              {t.temp.copy}
            </button>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-bronze px-5 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60 w-fit"
        >
          {pending ? t.temp.creating : t.temp.create}
        </button>
      </form>

      {/* Active list */}
      <div>
        <h2 className="font-semibold mb-3">{t.temp.active}</h2>
        {pins.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-500">
            {t.temp.none}
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden divide-y divide-stone-100">
            {pins.map((p) => {
              const left = countdown(p.expiresAt);
              return (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-stone-400">
                      {p.deviceName} · #{p.userId}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(p.pin)}
                    title={t.temp.copy}
                    className="font-mono text-lg tracking-wider hover:text-bronze-dark cursor-pointer"
                  >
                    {p.pin}
                  </button>
                  <div className="text-sm w-36 text-end">
                    {p.weekly ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        {fmt(t.temp.recurringBadge, {
                          days: p.weekly.split("").map((d) => t.temp.dayLetters.split(",")[Number(d)]).join(""),
                          from: p.timeBegin ?? "",
                          to: p.timeEnd ?? "",
                        })}
                      </span>
                    ) : !p.active && p.startsAt ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {fmt(t.temp.startsAtLabel, { t: fmtStart(p.startsAt) })}
                      </span>
                    ) : left ? (
                      <span className="text-stone-500">{fmt(t.temp.expiresIn, { t: left })}</span>
                    ) : (
                      <span className="text-stone-500">{t.temp.expired}</span>
                    )}
                  </div>
                  <form action={extendTempPinAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="hours" value="12" />
                    <button className="text-xs text-bronze-dark hover:underline">
                      {t.temp.addTime}
                    </button>
                  </form>
                  <form action={revokeTempPinAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-xs text-red-600 hover:underline">
                      {t.temp.revoke}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
