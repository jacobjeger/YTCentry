import { requireUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <AppShell email={user.email} role={user.role}>
      {children}
    </AppShell>
  );
}
