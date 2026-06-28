import { prisma } from "@ytc/core";
import { requireAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { listAllDoors } from "./doors-actions";
import DoorsManager from "./DoorsManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const t = getDictionary(await getLocale());

  const queueConfigured = !!process.env.AGENT_BEARER_TOKEN;
  const doors = await listAllDoors();
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
        <p className="text-stone-500">{t.settings.subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard label={t.settings.pushTransport} value={t.settings.tunnelMode} />
        <InfoCard label={t.settings.scheduleDefault} value="1001-1" mono />
        <InfoCard
          label="Agent queue"
          value={queueConfigured ? t.settings.configured : t.settings.notConfigured}
          good={queueConfigured}
        />
      </div>

      <div>
        <h2 className="font-semibold mb-3">Doors</h2>
        <DoorsManager doors={doors} />
      </div>

      <div>
        <h2 className="font-semibold mb-3">{t.settings.auditTitle}</h2>
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-stone-500">{t.settings.auditEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t.settings.when}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.settings.actor}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.settings.action}</th>
                    <th className="px-4 py-3 text-start font-medium">{t.settings.target}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap">
                        {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-stone-600">
                        {l.actor?.email ?? t.settings.system}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs">{l.action}</span>
                      </td>
                      <td className="px-4 py-2.5 text-stone-500 font-mono text-xs">
                        {l.targetType}:{l.targetId.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  mono,
  good,
}: {
  label: string;
  value: string;
  mono?: boolean;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-stone-400">{label}</div>
      <div
        className={`mt-1 ${mono ? "font-mono" : ""} ${
          good ? "text-green-700" : "text-stone-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
