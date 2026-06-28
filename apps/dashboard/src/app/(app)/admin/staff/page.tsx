import { prisma } from "@ytc/core";
import { requireAdmin } from "@/lib/auth";
import { setActive } from "./actions";
import CreateStaffForm from "./CreateStaffForm";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const admin = await requireAdmin();
  const users = await prisma.staffUser.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Staff logins</h1>
        <p className="text-stone-500">
          Create and disable logins. Passwords are set here and handed out — there
          is no email sign-up or reset.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                    <span className="text-green-700">Active</span>
                  ) : (
                    <span className="text-stone-400">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id === admin.id ? (
                    <span className="text-xs text-stone-400">you</span>
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
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 max-w-md">
        <h2 className="font-semibold mb-4">Create a login</h2>
        <CreateStaffForm />
      </div>
    </div>
  );
}
