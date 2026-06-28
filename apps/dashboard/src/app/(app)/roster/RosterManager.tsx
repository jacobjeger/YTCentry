"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  listRoster,
  addRosterEntry,
  deleteRosterEntry,
  type RosterRow,
  type AddRosterState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

export default function RosterManager() {
  const t = useT();
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [addState, addAction, adding] = useActionState<AddRosterState, FormData>(
    addRosterEntry,
    {},
  );

  async function reload() {
    setRows(await listRoster());
  }
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => {
    if (addState.ok) reload();
  }, [addState.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? rows.filter(
          (r) => r.fullName.toLowerCase().includes(s) || r.studentId.toLowerCase().includes(s),
        )
      : rows;
  }, [rows, q]);

  const withPhotos = filtered.filter((r) => r.hasPhoto);
  const allPhotosSelected = withPhotos.length > 0 && withPhotos.every((r) => sel.has(r.id));

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAllPhotos() {
    setSel(allPhotosSelected ? new Set() : new Set(withPhotos.map((r) => r.id)));
  }
  function download() {
    const ids = [...sel].filter((id) => rows.find((r) => r.id === id)?.hasPhoto);
    if (ids.length) window.location.href = `/api/roster/photos?ids=${ids.join(",")}`;
  }

  const statusLabel = (s: string) =>
    s === "ENROLLED" ? t.roster.statusEnrolled : s === "MATCHED" ? t.roster.statusMatched : t.roster.statusAwaiting;
  const statusClass = (s: string) =>
    s === "ENROLLED"
      ? "bg-green-100 text-green-700"
      : s === "MATCHED"
        ? "bg-blue-100 text-blue-700"
        : "bg-amber-100 text-amber-700";

  return (
    <div className="flex flex-col gap-6">
      {/* Manual add */}
      <form action={addAction} className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold mb-3">{t.roster.manualTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input name="fullName" required placeholder={t.roster.colName} className={input} />
          <input name="studentId" placeholder={t.roster.mId} className={input} />
          <input name="shiur" placeholder={t.roster.mShiur} className={input} />
          <input name="phone" placeholder={t.roster.mPhone} className={input} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-bronze px-4 py-2 text-sm font-medium text-white hover:bg-bronze-dark disabled:opacity-60"
          >
            {adding ? t.roster.adding : t.roster.add}
          </button>
          {addState.error ? <span className="text-sm text-red-600">{addState.error}</span> : null}
          {addState.ok ? (
            <span className="text-sm text-green-700">{fmt(t.roster.addedMsg, { name: addState.ok })}</span>
          ) : null}
        </div>
      </form>

      {/* List + download */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-stone-100">
          <h2 className="font-semibold">{t.roster.listTitle}</h2>
          <span className="text-sm text-stone-400">{rows.length}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.roster.search}
            className={`${input} flex-1 min-w-[160px]`}
          />
          <button
            onClick={download}
            disabled={[...sel].filter((id) => rows.find((r) => r.id === id)?.hasPhoto).length === 0}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {fmt(t.roster.downloadSelected, {
              n: [...sel].filter((id) => rows.find((r) => r.id === id)?.hasPhoto).length,
            })}
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="p-6 text-center text-stone-500">{t.roster.listEmpty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-stone-500 border-b border-stone-100">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPhotosSelected}
                    onChange={toggleAllPhotos}
                    title={t.roster.photo}
                  />
                </th>
                <th className="p-3 text-start font-medium">{t.roster.colName}</th>
                <th className="p-3 text-start font-medium">{t.roster.colStudentId}</th>
                <th className="p-3 text-start font-medium">{t.roster.colShiur}</th>
                <th className="p-3 text-start font-medium">{t.roster.photo}</th>
                <th className="p-3 text-start font-medium"></th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      disabled={!r.hasPhoto}
                      checked={sel.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="p-3 font-medium">{r.fullName}</td>
                  <td className="p-3 text-stone-500">{r.studentId.startsWith("M-") ? "—" : r.studentId}</td>
                  <td className="p-3 text-stone-500">{r.shiur ?? ""}</td>
                  <td className="p-3">
                    {r.hasPhoto ? (
                      <span className="text-green-600">✓ {t.roster.photo}</span>
                    ) : (
                      <span className="text-stone-400">{t.roster.noPhoto}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="p-3 text-end">
                    <form action={deleteRosterEntry} onSubmit={() => setTimeout(reload, 300)}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-red-600 hover:underline">{t.roster.remove}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
