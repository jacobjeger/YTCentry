import Link from "next/link";
import { requireAccess } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export default async function NoAccessPage() {
  await requireAccess();
  const t = getDictionary(await getLocale());
  return (
    <div className="max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-6">
      <h1 className="text-xl font-semibold text-amber-900">{t.portal.noAccessTitle}</h1>
      <p className="mt-2 text-amber-900">{t.portal.noAccessBody}</p>
      <Link
        href="/"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-bronze px-4 text-white hover:bg-bronze-dark"
      >
        {t.nav.home}
      </Link>
    </div>
  );
}
