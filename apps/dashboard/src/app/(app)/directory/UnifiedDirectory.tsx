"use client";

import { useEffect, useState } from "react";
import {
  loadFullDirectory,
  refreshDirectory,
  listDoors,
  deleteFromDoor,
  repushEnrollee,
  replacePhoto,
  type DirRow,
  type DirState,
  type DoorOption,
} from "./actions";
import EditPersonModal from "./EditPersonModal";
import Spinner from "@/components/Spinner";
import { useActionState, useRef } from "react";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n";

const PAGE_SIZE = 50;

function timeAgo(iso: string | null, t: Dict): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t.directory.justNow;
  if (mins < 60) return fmt(t.directory.minsAgo, { n: mins });
  const hrs = Math.round(mins / 60);
  return hrs < 24
    ? fmt(t.directory.hrsAgo, { n: hrs })
    : fmt(t.directory.daysAgo, { n: Math.round(hrs / 24) });
}

export default function UnifiedDirectory() {
  const t = useT();
  const [rows, setRows] = useState<DirRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "az" | "za">("newest");
  const [doors, setDoors] = useState<DoorOption[]>([]);
  const [door, setDoor] = useState<string>("");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function reload() {
    setRows(null);
    setError(null);
    const res = await loadFullDirectory(door || undefined);
    if (res.error) setError(res.error);
    else {
      setRows(res.rows ?? []);
      setSyncedAt(res.syncedAt ?? null);
    }
  }

  async function doRefresh() {
    setRefreshing(true);
    await refreshDirectory(door || undefined);
    await reload();
    setRefreshing(false);
  }

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
      else {
        setRows(res.rows ?? []);
        setSyncedAt(res.syncedAt ?? null);
      }
    });
    return () => {
      alive = false;
    };
  }, [door]);

  // Reset to page 1 when the filter/sort/search changes.
  useEffect(() => {
    setPage(0);
  }, [q, sort, door, groupFilter]);

  const groupOptions = Array.from(
    new Set((rows ?? []).map((r) => (r.group ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const filtered = (rows ?? [])
    .filter((r) => {
      const s = q.trim().toLowerCase();
      const matchesText = !s || r.name.toLowerCase().includes(s) || r.userID.includes(s);
      const matchesGroup = !groupFilter || (r.group ?? "").trim() === groupFilter;
      return matchesText && matchesGroup;
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.directory.title}</h1>
      <p className="text-stone-500 mt-1 mb-4">{t.directory.deviceSubtitle}</p>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      ) : rows === null ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8">
          <Spinner label={t.directory.loadingDevice} />
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
            {groupOptions.length > 0 ? (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-sm max-w-[160px]"
              >
                <option value="">{t.directory.allGroups}</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            ) : null}
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
            <button
              onClick={doRefresh}
              disabled={refreshing}
              className="text-sm text-bronze-dark hover:underline disabled:opacity-50"
            >
              {refreshing ? t.directory.syncing : t.directory.refresh}
            </button>
            {syncedAt ? (
              <span className="text-xs text-stone-400">{timeAgo(syncedAt, t)}</span>
            ) : null}
          </div>

          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.name}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.doorId}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.group}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.pin}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.face}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.directory.status}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {paged.map((r) => (
                    <Row
                      key={r.userID}
                      r={r}
                      deviceId={door}
                      onEdit={() => setEditing(r.userID)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 ? (
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100 text-sm">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="rounded-lg px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40"
                >
                  ←
                </button>
                <span className="text-stone-500">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="rounded-lg px-3 py-1.5 hover:bg-stone-100 disabled:opacity-40"
                >
                  →
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {editing ? (
        <EditPersonModal
          userID={editing}
          deviceId={door}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function Row({
  r,
  deviceId,
  onEdit,
}: {
  r: DirRow;
  deviceId: string;
  onEdit: () => void;
}) {
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
      <td className="px-4 py-2.5 text-stone-600">{r.group ?? ""}</td>
      <td className="px-4 py-2.5 font-mono text-stone-500">{r.pin || ""}</td>
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
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-bronze-dark hover:underline"
          >
            {t.directory.edit}
          </button>
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
