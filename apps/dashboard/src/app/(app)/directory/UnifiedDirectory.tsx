"use client";

import { useEffect, useState } from "react";
import {
  loadFullDirectory,
  listDoors,
  deleteFromDoor,
  repushEnrollee,
  replacePhoto,
  type DirRow,
  type DirState,
  type DoorOption,
} from "./actions";
import { useActionState, useRef } from "react";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

export default function UnifiedDirectory() {
  const t = useT();
  const [rows, setRows] = useState<DirRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "az" | "za">("newest");
  const [doors, setDoors] = useState<DoorOption[]>([]);
  const [door, setDoor] = useState<string>("");

  useEffect(() => {
    listDoors().then((ds) => {
      setDoors(ds);
      if (ds[0]) setDoor(ds[0].id);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    loadFullDirectory(door || undefined).then((res) => {
      if (!alive) return;
      if (res.error) setError(res.error);
      else setRows(res.rows ?? []);
    });
    return () => {
      alive = false;
    };
  }, [door]);

  const filtered = (rows ?? [])
    .filter((r) => {
      const s = q.trim().toLowerCase();
      return !s || r.name.toLowerCase().includes(s) || r.userID.includes(s);
    })
    .sort((a, b) => {
      switch (sort) {
        case "newest":
          return Number(b.userID) - Number(a.userID);
        case "oldest":
          return Number(a.userID) - Number(b.userID);
        case "az":
          return a.name.localeCompare(b.name);
        case "za":
          return b.name.localeCompare(a.name);
      }
    });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.directory.title}</h1>
      <p className="text-stone-500 mt-1 mb-4">{t.directory.deviceSubtitle}</p>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      ) : rows === null ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.directory.loadingDevice}
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            {doors.length > 1 ? (
              <select
                value={door}
                onChange={(e) => setDoor(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 bg-white"
              >
                {doors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.directory.searchDevice}
              className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-sm"
            >
              <option value="newest">{t.directory.sortNewest}</option>
              <option value="oldest">{t.directory.sortOldest}</option>
              <option value="az">{t.directory.sortNameAz}</option>
              <option value="za">{t.directory.sortNameZa}</option>
            </select>
            <span className="text-sm text-stone-500 whitespace-nowrap">
              {fmt(t.directory.totalOnDoor, { n: rows.length })}
            </span>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="overflow-x-auto max-h-[72vh]">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.name}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.doorId}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.face}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.status}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filtered.map((r) => (
                    <Row key={r.userID} r={r} deviceId={door} />
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

function Row({ r, deviceId }: { r: DirRow; deviceId: string }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFormRef = useRef<HTMLFormElement>(null);
  const [, replaceAction, replacing] = useActionState<DirState, FormData>(
    replacePhoto,
    {},
  );

  return (
    <tr>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          {r.managed && r.enrolleeId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/enrollee/${r.enrolleeId}/photo`}
              alt=""
              className="w-9 h-9 rounded-full object-cover bg-stone-200 shrink-0"
            />
          ) : (
            <span className="w-9 h-9 rounded-full bg-stone-100 shrink-0" />
          )}
          <span className="font-medium">{r.name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-stone-500">{r.userID}</td>
      <td className="px-4 py-2.5">
        {r.hasFaceOnDevice ? (
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
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3 justify-end whitespace-nowrap">
          {r.managed && r.enrolleeId ? (
            <>
              <a
                href={`/api/enrollee/${r.enrolleeId}/photo?download=1`}
                className="text-xs text-stone-600 hover:underline"
              >
                {t.directory.download}
              </a>
              {r.status === "PUSH_FAILED" ? (
                <form action={repushEnrollee}>
                  <input type="hidden" name="id" value={r.enrolleeId} />
                  <button className="text-xs text-bronze-dark hover:underline">
                    {t.directory.repush}
                  </button>
                </form>
              ) : null}
              <form ref={replaceFormRef} action={replaceAction}>
                <input type="hidden" name="id" value={r.enrolleeId} />
                <input
                  ref={fileRef}
                  type="file"
                  name="photo"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={() => replaceFormRef.current?.requestSubmit()}
                />
                <button
                  type="button"
                  disabled={replacing}
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-stone-600 hover:underline disabled:opacity-50"
                >
                  {t.directory.replacePhoto}
                </button>
              </form>
            </>
          ) : null}

          <form
            action={deleteFromDoor}
            onSubmit={(e) => {
              const msg = r.legacy
                ? t.directory.confirmRemoveLegacy
                : t.directory.confirmRemove;
              if (!confirm(msg)) e.preventDefault();
            }}
          >
            <input type="hidden" name="userID" value={r.userID} />
            <input type="hidden" name="deviceId" value={deviceId} />
            <button className="text-xs text-red-600 hover:underline">
              {t.directory.remove}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
