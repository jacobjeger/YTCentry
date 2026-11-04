import { requirePagePerm } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import EnrollForm from "./EnrollForm";

export default async function EnrollPage() {
  await requirePagePerm("enroll", "page.enroll");
  const t = getDictionary(await getLocale());
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{t.enroll.title}</h1>
      <p className="text-stone-500 mt-1 mb-6">{t.enroll.subtitle}</p>
      <EnrollForm />
    </div>
  );
}
