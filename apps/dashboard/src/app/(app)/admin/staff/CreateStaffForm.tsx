"use client";

import { useActionState, useRef, useEffect } from "react";
import { createStaff, type StaffActionState } from "./actions";
import { useT } from "@/components/LocaleProvider";

const input =
  "rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze";

export default function CreateStaffForm() {
  const t = useT();
  const [state, action, pending] = useActionState<StaffActionState, FormData>(
    createStaff,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.staff.name}</span>
        <input name="name" required className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.staff.email}</span>
        <input name="email" type="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">
          {t.staff.tempPassword}
        </span>
        <input
          name="password"
          type="text"
          required
          minLength={8}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">{t.staff.role}</span>
        <select name="role" defaultValue="STAFF" className={input}>
          <option value="STAFF">{t.staff.roleStaff}</option>
          <option value="ADMIN">{t.staff.roleAdmin}</option>
        </select>
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-green-700">{state.ok}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-bronze px-4 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60"
      >
        {pending ? t.staff.creating : t.staff.create}
      </button>
    </form>
  );
}
