"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getPersonDetail,
  savePersonEdit,
  type PersonDetail,
  type DirState,
} from "./actions";
import { useT } from "@/components/LocaleProvider";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

export default function EditPersonModal({
  userID,
  deviceId,
  onClose,
  onSaved,
}: {
  userID: string;
  deviceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [state, action, pending] = useActionState<DirState, FormData>(
    savePersonEdit,
    {},
  );

  useEffect(() => {
    getPersonDetail(userID, deviceId).then(setDetail);
  }, [userID, deviceId]);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      onClose();
    }
  }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">{t.directory.editTitle}</h2>
        {detail === null ? (
          <p className="text-stone-500 text-sm">{t.directory.loadingDevice}</p>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="userID" value={userID} />
            <input type="hidden" name="deviceId" value={deviceId} />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-stone-700">{t.directory.name}</span>
              <input name="name" defaultValue={detail.name} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-stone-700">{t.enroll.pinLabel}</span>
              <input name="pin" defaultValue={detail.pin} inputMode="numeric" className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-stone-700">{t.enroll.groupLabel}</span>
              <select name="group" defaultValue={detail.group} className={input}>
                <option value="">{t.enroll.groupNone}</option>
                {[detail.group, ...detail.groups]
                  .filter((g, i, a) => g && a.indexOf(g) === i)
                  .map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
              </select>
            </label>
            {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            <div className="flex gap-2 mt-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-bronze px-4 py-2 text-white text-sm font-medium hover:bg-bronze-dark disabled:opacity-60"
              >
                {pending ? t.directory.saving : t.directory.save}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
              >
                ✕
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
