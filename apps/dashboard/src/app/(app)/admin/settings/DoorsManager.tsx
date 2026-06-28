"use client";

import { useActionState, useRef, useEffect } from "react";
import {
  addDoor,
  deleteDoor,
  toggleDoorActive,
  type DoorRow,
  type DoorActionState,
} from "./doors-actions";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

export default function DoorsManager({ doors }: { doors: DoorRow[] }) {
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
              <th className="px-4 py-3 text-start font-medium">Door</th>
              <th className="px-4 py-3 text-start font-medium">URL</th>
              <th className="px-4 py-3 text-start font-medium">Email</th>
              <th className="px-4 py-3 text-start font-medium">Snapshots</th>
              <th className="px-4 py-3 text-start font-medium">Status</th>
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
                <td className="px-4 py-3">{d.allowEmail ? "Yes" : "—"}</td>
                <td className="px-4 py-3">{d.pollSnapshots ? "Yes" : "—"}</td>
                <td className="px-4 py-3">
                  {d.active ? (
                    <span className="text-green-700">Active</span>
                  ) : (
                    <span className="text-stone-400">Off</span>
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex gap-3 justify-end">
                    <form action={toggleDoorActive}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="active" value={(!d.active).toString()} />
                      <button className="text-xs text-bronze-dark hover:underline">
                        {d.active ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form
                      action={deleteDoor}
                      onSubmit={(e) => {
                        if (!confirm(`Remove the door "${d.name}"? (Doesn't delete anyone from the device.)`))
                          e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={d.id} />
                      <button className="text-xs text-red-600 hover:underline">Remove</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {doors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-stone-400">
                  No doors yet — add one below.
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
        <h3 className="font-semibold">Add a door</h3>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">Name</span>
          <input name="name" required placeholder="Kitchen Back Door" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">Tunnel URL</span>
          <input
            name="baseUrl"
            required
            placeholder="https://kitchen-back.example.org"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">Web password</span>
          <input name="webPassword" type="text" required className={input} />
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowEmail" className="accent-bronze" /> Receives emailed photos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pollSnapshots" className="accent-bronze" /> Pull denied scans
          </label>
        </div>
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-green-700">{state.ok}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-bronze px-4 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60 w-fit"
        >
          {pending ? "Testing connection…" : "Add door"}
        </button>
      </form>
    </div>
  );
}
