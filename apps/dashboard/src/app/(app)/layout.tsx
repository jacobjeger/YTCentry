import { requireAccess } from "@/lib/access";
import { PERMS, hasPerm } from "@/lib/portal-core";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const a = await requireAccess();
  return (
    <AppShell
      email={a.user.email}
      isAdmin={a.isAdmin}
      perms={PERMS.filter((p) => hasPerm(a, p))}
      portal={a.via === "portal"}
    >
      {children}
    </AppShell>
  );
}
