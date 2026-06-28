"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type PwState } from "./actions";
import { useT } from "@/components/LocaleProvider";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze";

export default function ChangePasswordForm() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<PwState, FormData>(changePassword, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-stone-200 bg-white p-6 flex flex-col gap-3 max-w-sm"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.account.current}</span>
        <input name="current" type="password" required autoComplete="current-password" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.account.newPass}</span>
        <input name="next" type="password" required autoComplete="new-password" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.account.confirm}</span>
        <input name="confirm" type="password" required autoComplete="new-password" className={input} />
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700">{t.account.changed}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-bronze px-5 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60 w-fit"
      >
        {pending ? t.account.changing : t.account.change}
      </button>
    </form>
  );
}
