"use client";

import { useActionState, useRef } from "react";
import { repushEnrollee, removeEnrollee, replacePhoto, type DirState } from "./actions";
import { useT } from "@/components/LocaleProvider";

export interface DirItem {
  id: string;
  displayName: string;
  studentId: string | null;
  shiur: string | null;
  akuvoxUserId: number;
  status: "DRAFT" | "PENDING_PUSH" | "PUSHED" | "PUSH_FAILED" | "REMOVED";
  lastError: string | null;
}

export default function DirectoryTable({ items }: { items: DirItem[] }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t.directory.name}</th>
              <th className="px-4 py-3 text-start font-medium">{t.directory.studentId}</th>
              <th className="px-4 py-3 text-start font-medium">{t.directory.shiur}</th>
              <th className="px-4 py-3 text-start font-medium">{t.directory.doorId}</th>
              <th className="px-4 py-3 text-start font-medium">{t.directory.status}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((it) => (
              <Row key={it.id} it={it} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(t: ReturnType<typeof useT>, s: DirItem["status"]) {
  switch (s) {
    case "DRAFT":
      return { text: t.directory.statusDraft, cls: "text-stone-500" };
    case "PENDING_PUSH":
      return { text: t.directory.statusPending, cls: "text-amber-700" };
    case "PUSHED":
      return { text: t.directory.statusPushed, cls: "text-green-700" };
    case "PUSH_FAILED":
      return { text: t.directory.statusFailed, cls: "text-red-600" };
    case "REMOVED":
      return { text: t.directory.statusRemoved, cls: "text-stone-400" };
  }
}

function Row({ it }: { it: DirItem }) {
  const t = useT();
  const st = statusLabel(t, it.status);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, replaceAction, replacing] = useActionState<DirState, FormData>(
    replacePhoto,
    {},
  );
  const replaceFormRef = useRef<HTMLFormElement>(null);

  return (
    <tr className={it.status === "REMOVED" ? "opacity-50" : ""}>
      <td className="px-4 py-3 font-medium">{it.displayName}</td>
      <td className="px-4 py-3 text-stone-600">{it.studentId ?? "—"}</td>
      <td className="px-4 py-3 text-stone-600">{it.shiur ?? "—"}</td>
      <td className="px-4 py-3 font-mono text-stone-500">{it.akuvoxUserId}</td>
      <td className="px-4 py-3">
        <span className={st.cls}>{st.text}</span>
        {it.lastError ? (
          <div className="text-xs text-red-400 max-w-[200px] truncate" title={it.lastError}>
            {it.lastError}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 justify-end whitespace-nowrap">
          <a
            href={`/api/enrollee/${it.id}/photo?download=1`}
            className="text-xs text-stone-600 hover:underline"
          >
            {t.directory.download}
          </a>

          {it.status === "PUSH_FAILED" ? (
            <form action={repushEnrollee}>
              <input type="hidden" name="id" value={it.id} />
              <button className="text-xs text-bronze-dark hover:underline">
                {t.directory.repush}
              </button>
            </form>
          ) : null}

          <form ref={replaceFormRef} action={replaceAction}>
            <input type="hidden" name="id" value={it.id} />
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

          {it.status !== "REMOVED" ? (
            <form
              action={removeEnrollee}
              onSubmit={(e) => {
                if (!confirm(t.directory.confirmRemove)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={it.id} />
              <button className="text-xs text-red-600 hover:underline">
                {t.directory.remove}
              </button>
            </form>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
