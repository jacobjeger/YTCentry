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

export default function TempPinsManager() {
  const t = useT();
  const [pins, setPins] = useState<TempPinRow[]>([]);
  const [doors, setDoors] = useState<{ id: string; name: string }[]>([]);
  const [, tick] = useState(0);
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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 sm:col-span-1">
            <span className="text-sm font-medium text-stone-700">{t.temp.label}</span>
            <input name="label" required placeholder={t.temp.labelPlaceholder} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">{t.temp.duration}</span>
            <select name="hours" defaultValue="12" className={input}>
              <option value="1">1h</option>
              <option value="4">4h</option>
              <option value="12">12h</option>
              <option value="24">24h</option>
              <option value="72">3d</option>
              <option value="168">7d</option>
            </select>
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
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.ok ? (
          <p className="text-sm text-green-700">
            {fmt(t.temp.createdPin, { label: state.ok.label, pin: state.ok.pin })}
          </p>
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
                  <div className="font-mono text-lg tracking-wider">{p.pin}</div>
                  <div className="text-sm text-stone-500 w-28 text-end">
                    {left ? fmt(t.temp.expiresIn, { t: left }) : t.temp.expired}
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
