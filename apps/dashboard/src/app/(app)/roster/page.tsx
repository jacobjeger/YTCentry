import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import RosterUpload from "./RosterUpload";

export default async function RosterPage() {
  await requireUser();
  const t = getDictionary(await getLocale());
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">{t.roster.title}</h1>
      <p className="text-stone-500 mt-1 mb-6">{t.roster.subtitle}</p>
      <RosterUpload />
    </div>
  );
}
