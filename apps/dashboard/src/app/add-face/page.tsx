import { requirePagePerm } from "@/lib/access";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import AddFaceForm from "./AddFaceForm";

// the portal's type (same stacks as C:\ytc-portal\public\style.css)
const SERIF = '"Frank Ruhl Libre", "David", "Times New Roman", serif';
const SANS = '"IBM Plex Sans Hebrew", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

/**
 * Add a face: name + photo → the front door. A page of its own, outside the
 * dashboard's header and menu, dressed like the YTC portal it's opened from
 * (the portal shows it as its own item, manifest tile `add_face`, own: true).
 */
export default async function AddFacePage() {
  await requirePagePerm("enroll", "page.addFace");
  const t = getDictionary(await getLocale());
  return (
    <main className="flex-1 w-full bg-[#f5f0e4] text-[#1a2230]" style={{ fontFamily: SANS }}>
      <div className="mx-auto w-full max-w-[520px] px-4 py-8 sm:py-12">
        <h1 className="text-[2rem] font-bold leading-tight border-b-2 border-[#1a2230] pb-3" style={{ fontFamily: SERIF }}>
          {t.addFace.title}
        </h1>
        <p className="mt-3 mb-6 text-[#3a4554]">{t.addFace.subtitle}</p>
        <AddFaceForm />
      </div>
    </main>
  );
}
