import { requirePagePerm } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import AddFaceForm from "./AddFaceForm";

export default async function AddFacePage() {
  await requirePagePerm("enroll", "page.addFace");
  const t = getDictionary(await getLocale());
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold">{t.addFace.title}</h1>
      <p className="text-stone-500 mt-1 mb-6">{t.addFace.subtitle}</p>
      <AddFaceForm />
    </div>
  );
}
