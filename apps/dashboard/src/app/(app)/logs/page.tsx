/**
 * Activity log — every change and sign-in, with who / when / IP / what.
 * Gated by the `logs` permission (admins always). Read-only.
 */
import { prisma } from "@ytc/core";
import { requirePagePerm } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Meta = Record<string, unknown>;

/** A short, readable "what" from the row's meta (never secrets — none are logged). */
function summary(meta: Meta): string {
  const keys = ["name", "fullName", "label", "door", "deviceId", "perm", "reason", "email", "count", "granted", "active", "akuvoxUserId"];
  return keys
    .filter((k) => meta[k] !== undefined && meta[k] !== null && meta[k] !== "")
    .map((k) => `${k}: ${typeof meta[k] === "object" ? JSON.stringify(meta[k]) : String(meta[k])}`)
    .join(" · ");
}

export default async function LogsPage() {
  await requirePagePerm("logs", "page.logs");
  const t = getDictionary(await getLocale());
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { actor: { select: { email: true, name: true, portalName: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t.portal.logsTitle}</h1>
        <p className="text-stone-500">{t.portal.logsSubtitle}</p>
      </div>
      {logs.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-500">
          {t.portal.empty}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {logs.map((l) => {
            const meta = (l.meta ?? {}) as Meta;
            const who =
              (meta.actorName as string | undefined) ??
              l.actor?.portalName ??
              l.actor?.name ??
              t.portal.system;
            const email = (meta.actorEmail as string | undefined) ?? l.actor?.email;
            const denied = l.action === "auth.denied" || l.action === "auth.failed";
            return (
              <li key={l.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-stone-500 whitespace-nowrap" dir="ltr">
                    {l.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC
                  </span>
                  <span
                    className={`font-mono text-xs rounded px-1.5 py-0.5 ${
                      denied ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-700"
                    }`}
                  >
                    {l.action}
                  </span>
                  {meta.via === "portal" ? (
                    <span className="text-xs text-bronze-dark">portal</span>
                  ) : null}
                </div>
                <div className="mt-1 break-words">
                  <span className="font-medium">{who}</span>
                  {email && email !== who ? <span className="text-stone-500"> ({email})</span> : null}
                  {typeof meta.ip === "string" ? (
                    <span className="text-stone-400" dir="ltr">
                      {" "}
                      · {t.portal.ip} {meta.ip}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 break-words text-stone-500" dir="auto">
                  {l.targetType}:{l.targetId.slice(0, 40)}
                  {summary(meta) ? ` — ${summary(meta)}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
