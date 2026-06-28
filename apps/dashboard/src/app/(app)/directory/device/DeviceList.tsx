"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadDeviceDirectory, type DeviceRow } from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

export default function DeviceList() {
  const t = useT();
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    loadDeviceDirectory().then((res) => {
      if (!alive) return;
      if (res.error) setError(res.error);
      else setRows(res.rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = (rows ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    return !s || r.name.toLowerCase().includes(s) || r.userID.includes(s);
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.directory.deviceTitle}</h1>
          <p className="text-stone-500 mt-1">{t.directory.deviceSubtitle}</p>
        </div>
        <Link href="/directory" className="text-sm text-bronze-dark hover:underline">
          {t.directory.back}
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      ) : rows === null ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.directory.loadingDevice}
        </div>
      ) : (
        <>
          <div className="mt-5 mb-4 flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.directory.searchDevice}
              className="w-full max-w-sm rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze"
            />
            <span className="text-sm text-stone-500 whitespace-nowrap">
              {fmt(t.directory.totalOnDoor, { n: rows.length })}
            </span>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.doorId}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.name}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.face}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filtered.map((r) => (
                    <tr key={r.userID}>
                      <td className="px-4 py-2.5 font-mono text-stone-500">{r.userID}</td>
                      <td className="px-4 py-2.5">{r.name}</td>
                      <td className="px-4 py-2.5">
                        {r.hasFace ? (
                          <span className="text-green-700">{t.directory.yes}</span>
                        ) : (
                          <span className="text-stone-400">{t.directory.no}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.managed ? (
                          <span className="text-xs rounded-full bg-bronze/10 text-bronze-dark px-2 py-0.5">
                            {t.directory.managedHere}
                          </span>
                        ) : (
                          <span className="text-xs rounded-full bg-stone-100 text-stone-500 px-2 py-0.5">
                            {t.directory.legacy}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
