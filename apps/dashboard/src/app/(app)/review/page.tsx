import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";

export default async function Page() {
  const t = getDictionary(await getLocale());
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-8">
      <h1 className="text-xl font-semibold">{t.nav.review}</h1>
      <p className="text-stone-500 mt-2">{t.common.comingSoon}</p>
    </div>
  );
}
