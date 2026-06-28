"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { useT } from "./LocaleProvider";
import LanguageSwitcher from "./LanguageSwitcher";

export default function AppShell({
  email,
  role,
  children,
}: {
  email: string;
  role: "ADMIN" | "STAFF";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();

  const items: { href: string; label: string; adminOnly?: boolean }[] = [
    { href: "/", label: t.nav.home },
    { href: "/enroll", label: t.nav.enroll },
    { href: "/review", label: t.nav.review },
    { href: "/roster", label: t.nav.roster },
    { href: "/directory", label: t.nav.directory },
    { href: "/admin/staff", label: t.nav.staff, adminOnly: true },
    { href: "/admin/settings", label: t.nav.settings, adminOnly: true },
  ].filter((n) => !n.adminOnly || role === "ADMIN");

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-stone-200 shadow-sm">
        <div className="mx-auto max-w-6xl px-4 flex items-center gap-3 h-16">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/toras-chaim-logo.png"
              alt="Toras Chaim"
              width={36}
              height={34}
              priority
            />
            <span className="font-semibold text-bronze-dark hidden sm:block">
              {t.brand}
            </span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto flex-1">
            {items.map((n) => {
              const active =
                n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-bronze text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <LanguageSwitcher />
            <span className="text-xs text-stone-500 hidden md:block">
              {email}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-stone-600 hover:text-bronze-dark underline-offset-2 hover:underline"
              >
                {t.nav.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl w-full px-4 py-8 flex-1">{children}</main>
    </div>
  );
}
