import { prisma, ID_BAND_START, type Prisma } from "@ytc/core";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import DirectoryTable, { type DirItem } from "./DirectoryTable";

export const dynamic = "force-dynamic";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const t = getDictionary(await getLocale());
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const where: Prisma.EnrolleeWhereInput = {
    akuvoxUserId: { gte: ID_BAND_START },
    ...(query
      ? {
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { studentId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const enrollees = await prisma.enrollee.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items: DirItem[] = enrollees.map((e) => ({
    id: e.id,
    displayName: e.displayName,
    studentId: e.studentId,
    shiur: e.shiur,
    akuvoxUserId: e.akuvoxUserId,
    status: e.status,
    lastError: e.lastError,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t.directory.title}</h1>
      <p className="text-stone-500 mt-1 mb-6">{t.directory.subtitle}</p>

      <form method="get" className="mb-5">
        <input
          name="q"
          defaultValue={query}
          placeholder={t.directory.searchPlaceholder}
          className="w-full max-w-sm rounded-lg border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze"
        />
      </form>

      {items.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
          {t.directory.empty}
        </div>
      ) : (
        <DirectoryTable items={items} />
      )}
    </div>
  );
}
