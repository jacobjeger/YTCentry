"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addFaceAction, type AddFaceState } from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

const input =
  "rounded-lg border border-stone-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-bronze";

export default function AddFaceForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<AddFaceState, FormData>(addFaceAction, {});
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // the one the form sends, name="photo"

  // The taken/chosen photo goes into the form's own file input.
  useEffect(() => {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    if (photo) dt.items.add(photo);
    fileInputRef.current.files = dt.files;
  }, [photo]);

  // Choosing a photo also makes its preview (and lets the previous one go).
  const pick = (file: File | null) => {
    setPhoto(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  // useActionState has no reset; a reload is the simplest clean form.
  const again = () => window.location.reload();

  if (state.queued) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-800">{fmt(t.enroll.queuedOfflineTitle, { name: state.queued.name })}</h2>
        <p className="text-sm text-amber-700 mt-1">{t.enroll.queuedOfflineBody}</p>
        <button onClick={again} className="mt-4 rounded-lg bg-bronze px-4 py-2 text-white font-medium hover:bg-bronze-dark">
          {t.enroll.addAnother}
        </button>
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-800">{fmt(t.addFace.doneTitle, { name: state.ok.name })}</h2>
        <p className="text-sm text-green-700 mt-1">{t.addFace.doneBody}</p>
        <button onClick={again} className="mt-4 rounded-lg bg-bronze px-4 py-2 text-white font-medium hover:bg-bronze-dark">
          {t.enroll.addAnother}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-stone-200 bg-white p-6">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.enroll.name} *</span>
        <input name="displayName" required dir="ltr" autoComplete="off" className={input} />
        <span className="text-xs text-stone-500">{t.addFace.nameHint}</span>
      </label>

      <div>
        <p className="text-sm text-stone-500 mb-2">{t.addFace.photoTips}</p>
        {/* Plain visible file inputs, as on Add Person: on a phone the first opens the camera. */}
        <div className="rounded-lg border border-dashed border-stone-300 p-4 flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5 text-stone-600">
            <span className="font-medium">{t.enroll.takePhoto}</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
          <div className="border-t border-stone-100" />
          <label className="flex flex-col gap-1.5 text-stone-600">
            <span className="font-medium">{t.enroll.chooseGallery}</span>
            <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="mt-3 rounded-lg border border-stone-200 p-3 min-h-[200px] flex items-center justify-center bg-stone-50">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={t.enroll.previewAlt} className="max-h-[260px] rounded-md object-contain" />
          ) : (
            <span className="text-sm text-stone-400">{t.enroll.preview}</span>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" name="photo" className="hidden" />

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !photo}
          className="rounded-lg bg-bronze px-6 py-3 text-white font-semibold hover:bg-bronze-dark disabled:opacity-50"
        >
          {pending ? t.addFace.adding : t.addFace.add}
        </button>
        {!photo ? <span className="text-sm text-stone-400">{t.enroll.needPhoto}</span> : null}
      </div>
    </form>
  );
}
