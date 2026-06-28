"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  enrollAction,
  listEnrollDoors,
  listGroups,
  type EnrollState,
  type EnrollDoor,
} from "./actions";
import { useT } from "@/components/LocaleProvider";
import { fmt } from "@/lib/i18n";

const input =
  "rounded-lg border border-stone-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-bronze";

type Mode = "upload" | "webcam";

export default function EnrollForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<EnrollState, FormData>(
    enrollAction,
    {},
  );
  const [mode, setMode] = useState<Mode>("upload");
  const [doors, setDoors] = useState<EnrollDoor[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);

  useEffect(() => {
    listEnrollDoors().then(setDoors);
    listGroups().then(setGroups);
  }, []);
  const [preview, setPreview] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null); // hidden, name="photo"
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Sync the chosen/captured File into the hidden form input.
  useEffect(() => {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    if (photo) dt.items.add(photo);
    fileInputRef.current.files = dt.files;
  }, [photo]);

  // Build / revoke the preview URL.
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCam = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCamError(t.enroll.camError);
    }
  }, [t]);

  useEffect(() => {
    if (mode === "webcam") startCam();
    else stopCam();
    return () => stopCam();
  }, [mode, startCam, stopCam]);

  // stop camera once we have a successful enrollment
  useEffect(() => {
    if (state.ok) stopCam();
  }, [state.ok, stopCam]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPhoto(
            new File([blob], `capture-${Date.now()}.jpg`, {
              type: "image/jpeg",
            }),
          );
        }
      },
      "image/jpeg",
      0.92,
    );
  }, []);

  function reset() {
    setPhoto(null);
    setPreview(null);
    setMode("upload");
    formRef.current?.reset();
    // useActionState has no reset; remounting via key is simplest:
    window.location.reload();
  }

  if (state.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-800">
          {fmt(t.enroll.queuedTitle, { name: state.ok.name })}
        </h2>
        <p className="text-sm text-green-700 mt-1">
          {fmt(t.enroll.queuedBody, { userId: state.ok.userId })}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-bronze px-4 py-2 text-white font-medium hover:bg-bronze-dark"
        >
          {t.enroll.addAnother}
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-5 rounded-xl border border-stone-200 bg-white p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-stone-700">
            {t.enroll.name} *
          </span>
          <input name="displayName" required className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">
            {t.enroll.groupLabel}
          </span>
          <select name="groupName" defaultValue="" className={input}>
            <option value="">{t.enroll.groupNone}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-stone-700">
            {t.enroll.pinLabel}
          </span>
          <input name="pin" inputMode="numeric" className={input} />
        </label>
      </div>

      {/* Which doors */}
      {doors.length > 1 ? (
        <div>
          <span className="text-sm font-medium text-stone-700">
            {t.enroll.doorsLabel}
          </span>
          <div className="flex flex-wrap gap-3 mt-2">
            {doors.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  name="deviceIds"
                  value={d.id}
                  defaultChecked
                  className="accent-bronze"
                />
                <span className="text-sm">{d.name}</span>
              </label>
            ))}
          </div>
        </div>
      ) : doors.length === 1 ? (
        <input type="hidden" name="deviceIds" value={doors[0]!.id} />
      ) : null}

      {/* Photo source */}
      <div>
        <div className="flex gap-2 mb-3">
          <TabBtn active={mode === "upload"} onClick={() => setMode("upload")}>
            {t.enroll.uploadPhoto}
          </TabBtn>
          <TabBtn active={mode === "webcam"} onClick={() => setMode("webcam")}>
            {t.enroll.useWebcam}
          </TabBtn>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 items-start">
          <div className="rounded-lg border border-dashed border-stone-300 p-4 min-h-[220px] flex flex-col items-center justify-center gap-3">
            {mode === "upload" ? (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full rounded-md bg-black aspect-[4/3] object-cover"
                />
                {camError ? (
                  <p className="text-sm text-red-600">{camError}</p>
                ) : (
                  <button
                    type="button"
                    onClick={capture}
                    className="rounded-lg bg-stone-800 text-white px-4 py-2 text-sm font-medium hover:bg-stone-700"
                  >
                    {t.enroll.capture}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="rounded-lg border border-stone-200 p-3 min-h-[220px] flex items-center justify-center bg-stone-50">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="preview"
                className="max-h-[280px] rounded-md object-contain"
              />
            ) : (
              <span className="text-sm text-stone-400">{t.enroll.preview}</span>
            )}
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" name="photo" className="hidden" />

      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !photo}
          className="rounded-lg bg-bronze px-6 py-3 text-white font-semibold hover:bg-bronze-dark disabled:opacity-50"
        >
          {pending ? t.enroll.enrolling : t.enroll.enroll}
        </button>
        {!photo ? (
          <span className="text-sm text-stone-400">{t.enroll.needPhoto}</span>
        ) : null}
      </div>
    </form>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        active
          ? "bg-bronze text-white"
          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
      }`}
    >
      {children}
    </button>
  );
}
