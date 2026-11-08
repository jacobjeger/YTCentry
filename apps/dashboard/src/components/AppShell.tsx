"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "./LocaleProvider";
import LanguageSwitcher from "./LanguageSwitcher";

export default function AppShell({
  email,
  isAdmin,
  perms,
  portal,
  children,
}: {
  email: string;
  isAdmin: boolean;
  /** Permissions the signed-in person holds (display only — the server enforces). */
  perms: string[];
  /** Signed in through the YTC portal: the portal owns logout and the user menu. */
  portal: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const has = (p: string) => isAdmin || perms.includes(p);
  const items: { href: string; label: string; perm?: string; adminOnly?: boolean }[] = [
    { href: "/", label: t.nav.home },
    { href: "/enroll", label: t.nav.enroll, perm: "enroll" },
    { href: "/add-face", label: t.nav.addFace, perm: "enroll" },
    { href: "/review", label: t.nav.review, perm: "review" },
    { href: "/roster", label: t.nav.roster, perm: "roster" },
    { href: "/directory", label: t.nav.directory, perm: "view" },
    { href: "/temp-pins", label: t.nav.tempPins, perm: "temp_pins" },
    { href: "/logs", label: t.nav.logs, perm: "logs" },
    { href: "/admin/schedules", label: t.nav.schedules, adminOnly: true },
    { href: "/admin/staff", label: t.nav.staff, adminOnly: true },
    { href: "/admin/settings", label: t.nav.settings, adminOnly: true },
  ].filter((n) => (n.adminOnly ? isAdmin : !n.perm || has(n.perm)));

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClass = (href: string) =>
    `px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
      isActive(href)
        ? "bg-bronze text-white"
        : "text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-stone-200 shadow-sm">
        <div className="mx-auto max-w-6xl px-4">
          {/* Brand row */}
          <div className="flex items-center gap-3 h-16">
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
            <div className="flex-1" />
            <div className="flex items-center gap-3 shrink-0">
              <LanguageSwitcher />
              {portal ? null : (
              <Link
                href="/account"
                className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:border-bronze hover:text-bronze-dark hover:bg-bronze/5 transition-colors"
                title={t.account.title}
              >
                <span aria-hidden>👤</span>
                <span className="max-w-[160px] truncate">{email}</span>
              </Link>
              )}
              {portal ? null : (
              <form action="/logout" method="post" className="hidden sm:block">
                <button
                  type="submit"
                  className="min-h-11 px-1 text-sm text-stone-600 hover:text-bronze-dark underline-offset-2 hover:underline"
                >
                  {t.nav.signOut}
                </button>
              </form>
              )}
              {/* Hamburger — small screens only */}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={t.nav.menu}
                aria-expanded={open}
                className="sm:hidden inline-flex h-11 w-11 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {open ? (
                    <>
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="6" y1="18" x2="18" y2="6" />
                    </>
                  ) : (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Desktop nav row — wraps so every tab is always reachable */}
          <nav className="hidden sm:flex flex-wrap items-center gap-1 pb-2">
            {items.map((n) => (
              <Link key={n.href} href={n.href} className={linkClass(n.href)}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile dropdown menu */}
        {open ? (
          <nav className="sm:hidden border-t border-stone-200 bg-white px-4 py-2 flex flex-col gap-1">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-3 rounded-md text-base font-medium ${
                  isActive(n.href) ? "bg-bronze text-white" : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {n.label}
              </Link>
            ))}
            {portal ? null : (
              <>
                <div className="border-t border-stone-100 my-1" />
                <Link
                  href="/account"
                  className="px-3 py-3 rounded-md text-base font-medium text-stone-700 hover:bg-stone-100 truncate"
                >
                  👤 {email}
                </Link>
                <form action="/logout" method="post">
                  <button
                    type="submit"
                    className="w-full text-start px-3 py-3 rounded-md text-base font-medium text-stone-700 hover:bg-stone-100"
                  >
                    {t.nav.signOut}
                  </button>
                </form>
              </>
            )}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl w-full min-w-0 px-4 py-6 sm:py-8 flex-1">{children}</main>
    </div>
  );
}
