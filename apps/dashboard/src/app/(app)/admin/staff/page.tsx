import { prisma } from "@ytc/core";
import { requireAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { setActive } from "./actions";
import CreateStaffForm from "./CreateStaffForm";
import ResetPasswordCell from "./ResetPasswordCell";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const admin = await requireAdmin();
  const t = getDictionary(await getLocale());
  const users = await prisma.staffUser.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.staff.title}</h1>
        <p className="text-stone-500">{t.staff.subtitle}</p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-stone-50 text-stone-500 text-start">
            <tr>
              <th className="px-4 py-3 font-medium text-start">{t.staff.name}</th>
              <th className="px-4 py-3 font-medium text-start">{t.staff.email}</th>
              <th className="px-4 py-3 font-medium text-start">{t.staff.role}</th>
              <th className="px-4 py-3 font-medium text-start">
                {t.staff.status}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-stone-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="text-xs rounded-full bg-stone-100 px-2 py-0.5">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="text-green-700">{t.staff.active}</span>
                  ) : (
                    <span className="text-stone-400">{t.staff.disabled}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-4 justify-end flex-wrap">
                    <ResetPasswordCell id={u.id} />
                    {u.id === admin.id ? (
                      <span className="text-xs text-stone-400">{t.staff.you}</span>
                    ) : (
                      <form action={setActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={(!u.active).toString()}
                        />
                        <button
                          type="submit"
                          className="text-xs text-bronze-dark hover:underline"
                        >
                          {u.active ? t.staff.disable : t.staff.enable}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 max-w-md">
        <h2 className="font-semibold mb-4">{t.staff.createTitle}</h2>
        <CreateStaffForm />
      </div>
    </div>
  );
}
