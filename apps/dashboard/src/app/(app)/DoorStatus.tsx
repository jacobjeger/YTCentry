/**
 * Live door-connection panel for the dashboard.
 *
 * Probed on render, not read from a stored flag — "currently connected" is only
 * meaningful as of now. Rendered inside <Suspense> by the page so a door that is
 * down (and therefore only fails after the probe timeout) never delays the rest
 * of the dashboard.
 */
import { getDoorHealth, countWaitingToSync, type DoorHealth } from "@ytc/core";
import { getLocale } from "@/lib/locale";
import { getDictionary, fmt } from "@/lib/i18n";

export function DoorStatusSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="text-sm font-medium text-stone-400">{label}</div>
      <div className="mt-3 h-5 w-40 animate-pulse rounded bg-stone-100" />
    </div>
  );
}

export default async function DoorStatus() {
  const t = getDictionary(await getLocale());
  const [doors, waiting] = await Promise.all([getDoorHealth(), countWaitingToSync()]);

  if (doors.length === 0) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <div className="text-sm font-medium text-amber-900">{t.home.doorStatus}</div>
        <p className="mt-1 text-sm text-amber-800">{t.home.noDoors}</p>
      </div>
    );
  }

  const anyDown = doors.some((d) => d.state !== "online");
  const anyProblem = doors.some((d) => d.state === "problem");

  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-stone-100">
        <h2 className="text-sm font-medium uppercase tracking-wide text-stone-400">
          {t.home.doorStatus}
        </h2>
        {waiting > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
            {fmt(t.home.waitingToSync, { n: waiting })}
          </span>
        ) : null}
      </div>

      <ul className="divide-y divide-stone-100">
        {doors.map((d) => (
          <DoorRow key={d.id} door={d} t={t} />
        ))}
      </ul>

      {/* A "problem" door will still be broken in an hour, so it must never get
          the reassuring auto-sync message that an offline door gets. */}
      {anyProblem ? (
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          {t.home.doorProblemHelp}
        </p>
      ) : anyDown ? (
        <p className="border-t border-stone-100 bg-stone-50 px-5 py-3 text-sm text-stone-600">
          {waiting > 0 ? t.home.offlineQueued : t.home.offlineSafe}
        </p>
      ) : null}
    </div>
  );
}

function DoorRow({
  door,
  t,
}: {
  door: DoorHealth;
  t: ReturnType<typeof getDictionary>;
}) {
  const state =
    door.state === "online"
      ? { dot: "bg-green-500", text: t.home.doorOnline, cls: "text-green-700" }
      : door.state === "problem"
        ? { dot: "bg-amber-500", text: t.home.doorProblem, cls: "text-amber-700" }
        : { dot: "bg-red-500", text: t.home.doorOffline, cls: "text-red-700" };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.dot}`} aria-hidden />
      <span className="font-medium text-stone-800">{door.name}</span>
      <span className={`text-sm font-medium ${state.cls}`}>{state.text}</span>
      {door.state === "online" ? (
        <span className="text-xs text-stone-400">{door.ms} ms</span>
      ) : (
        <span className="w-full text-xs text-stone-500 sm:w-auto" title={door.error ?? ""}>
          {truncate(door.error ?? "", 80)}
        </span>
      )}
      {door.waiting > 0 ? (
        <span className="ms-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
          {fmt(t.home.doorWaiting, { n: door.waiting })}
        </span>
      ) : null}
    </li>
  );
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
