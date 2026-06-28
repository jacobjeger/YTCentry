import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  await requireUser();
  const t = getDictionary(await getLocale());
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{t.account.title}</h1>
      <p className="text-stone-500 mt-1 mb-6">{t.account.subtitle}</p>
      <ChangePasswordForm />
    </div>
  );
}
