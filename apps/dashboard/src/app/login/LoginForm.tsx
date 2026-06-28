"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze"
        />
      </label>
      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-bronze px-4 py-2.5 font-medium text-white hover:bg-bronze-dark disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
