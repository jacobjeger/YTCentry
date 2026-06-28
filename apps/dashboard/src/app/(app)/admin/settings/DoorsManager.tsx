"use client";

import { useActionState, useRef, useEffect } from "react";
import {
  addDoor,
  deleteDoor,
  toggleDoorActive,
  type DoorRow,
  type DoorActionState,
} from "./doors-actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

export default function DoorsManager({ doors }: { doors: DoorRow[] }) {
  const t = useT();
  const [state, action, pending] = useActionState<DoorActionState, FormData>(
    addDoor,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-start">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t.doors.colDoor}</th>
              <th className="px-4 py-3 text-start font-medium">{t.doors.colUrl}</th>
              <th className="px-4 py-3 text-start font-medium">{t.doors.colEmail}</th>
              <th className="px-4 py-3 text-start font-medium">{t.doors.colSnapshots}</th>
              <th className="px-4 py-3 text-start font-medium">{t.doors.colStatus}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {doors.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3 text-stone-500 font-mono text-xs truncate max-w-[220px]">
                  {d.baseUrl}
                </td>
                <td className="px-4 py-3">{d.allowEmail ? t.doors.yes : "—"}</td>
                <td className="px-4 py-3">{d.pollSnapshots ? t.doors.yes : "—"}</td>
                <td className="px-4 py-3">
                  {d.active ? (
                    <span className="text-green-700">{t.doors.active}</span>
                  ) : (
                    <span className="text-stone-400">{t.doors.off}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex gap-3 justify-end">
                    <form action={toggleDoorActive}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="active" value={(!d.active).toString()} />
                      <button className="text-xs text-bronze-dark hover:underline">
                        {d.active ? t.doors.disable : t.doors.enable}
                      </button>
                    </form>
                    <form
                      action={deleteDoor}
                      onSubmit={(e) => {
                        if (!confirm(fmt(t.doors.confirmRemove, { name: d.name })))
                          e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={d.id} />
                      <button className="text-xs text-red-600 hover:underline">{t.doors.remove}</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {doors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-stone-400">
                  {t.doors.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form
        ref={formRef}
        action={action}
        className="rounded-xl border border-stone-200 bg-white p-6 max-w-lg flex flex-col gap-3"
      >
        <h3 className="font-semibold">{t.doors.addTitle}</h3>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">{t.doors.name}</span>
          <input name="name" required placeholder={t.doors.namePlaceholder} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">{t.doors.urlLabel}</span>
          <input
            name="baseUrl"
            required
            placeholder={t.doors.urlPlaceholder}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">{t.doors.webPassword}</span>
          <input name="webPassword" type="text" required className={input} />
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowEmail" className="accent-bronze" /> {t.doors.receivesEmail}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pollSnapshots" className="accent-bronze" /> {t.doors.pullDenied}
          </label>
        </div>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-green-700">{state.ok}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-bronze px-4 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60 w-fit"
        >
          {pending ? t.doors.testing : t.doors.addDoor}
        </button>
      </form>
    </div>
  );
}
