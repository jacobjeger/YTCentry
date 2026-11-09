"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addFaceAction, type AddFaceState } from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

// The YTC portal's look: paper, ink, navy binding, brass.
const card =
  "rounded-[6px] border border-[#d9cfb9] bg-[#fcfaf5] p-6 shadow-[0_1px_0_rgba(26,34,48,.04),0_10px_24px_-14px_rgba(26,34,48,.35)]";
const field =
  "w-full rounded-[5px] border border-[#d9cfb9] bg-white px-3 py-2.5 text-base text-[#1a2230] focus:outline-none focus:border-[#b08a34] focus:ring-[3px] focus:ring-[rgba(176,138,52,.22)]";
const primary =
  "inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-[#13243b] px-5 py-3.5 text-base font-medium text-[#efe7d4] shadow-[inset_0_-2px_0_#b08a34] hover:bg-[#23406a] disabled:opacity-50 disabled:hover:bg-[#13243b]";
const ghost =
  "inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[5px] border border-[#d9cfb9] bg-white px-4 py-3 text-[15px] font-medium text-[#1a2230] hover:border-[#b08a34] focus-within:border-[#b08a34] focus-within:ring-[3px] focus-within:ring-[rgba(176,138,52,.22)]";

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
);
const CAMERA = '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>';
const IMAGE = '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>';
const FACE = '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>';

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

  if (state.ok || state.queued) {
    const name = (state.ok ?? state.queued)!.name;
    return (
      <div className={card} role="status">
        <p className={`text-lg font-semibold ${state.ok ? "text-[#2f6b3b]" : "text-[#7a5a00]"}`}>
          {state.ok ? fmt(t.addFace.doneTitle, { name }) : fmt(t.enroll.queuedOfflineTitle, { name })}
        </p>
        <p className="mt-1 text-[#3a4554]">{state.ok ? t.addFace.doneBody : t.enroll.queuedOfflineBody}</p>
        <button onClick={again} className={`${primary} mt-6`}>
          {t.enroll.addAnother}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className={`${card} flex flex-col gap-6`}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t.enroll.name}</span>
        <input name="displayName" required dir="ltr" autoComplete="off" className={field} />
        <span className="text-[13px] text-[#776f60]">{t.addFace.nameHint}</span>
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[5px] border border-dashed border-[#d9cfb9] bg-white">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={t.enroll.previewAlt} className="h-full w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-[#9a9282]">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden dangerouslySetInnerHTML={{ __html: FACE }} />
              <span className="text-sm">{t.enroll.preview}</span>
            </span>
          )}
        </div>
        {/* The inputs sit inside their buttons, visually hidden (not display:none, which
            some phones ignore clicks on). The first opens the camera, the second the photos. */}
        <div className="flex gap-3">
          <label className={ghost}>
            <Icon d={CAMERA} />
            {t.enroll.takePhoto}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
          <label className={ghost}>
            <Icon d={IMAGE} />
            {t.enroll.chooseGallery}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <p className="text-[13px] text-[#776f60]">{t.addFace.photoTips}</p>
      </div>

      <input ref={fileInputRef} type="file" name="photo" className="hidden" />

      {state.error ? (
        <p role="alert" className="rounded-[5px] border border-[#9b2c1f] bg-[#fbefec] px-3 py-2.5 text-sm font-medium text-[#9b2c1f]">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending || !photo} className={primary}>
        {pending ? t.addFace.adding : t.addFace.add}
      </button>
    </form>
  );
}
