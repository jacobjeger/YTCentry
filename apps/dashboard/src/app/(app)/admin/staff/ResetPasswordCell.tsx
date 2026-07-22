"use client";

import { useActionState, useState } from "react";
import { resetStaffPassword, type StaffActionState } from "./actions";
import { useT } from "@/components/LocaleProvider";

/** Inline "Reset password" control for one staff row (admin recovery). */
export default function ResetPasswordCell({ id }: { id: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<StaffActionState, FormData>(
    resetStaffPassword,
    {},
  );

  if (state.ok) {
    return <span className="text-xs text-green-700">{state.ok}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-bronze-dark hover:underline"
      >
        {t.staff.resetPw}
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2 justify-end">
      <input type="hidden" name="id" value={id} />
      <input
        name="password"
        type="text"
        autoComplete="off"
        minLength={8}
        required
        placeholder={t.staff.newPasswordPh}
        className="rounded-lg border border-stone-300 px-2 py-1 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-bronze"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-bronze px-3 py-1 text-xs font-medium text-white hover:bg-bronze-dark disabled:opacity-50"
      >
        {pending ? t.staff.creating : t.staff.resetSave}
      </button>
      {state.error ? (
        <span className="text-xs text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}
