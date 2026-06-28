import Image from "next/image";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/toras-chaim-logo.png"
            alt="Toras Chaim"
            width={72}
            height={67}
            priority
          />
          <h1 className="mt-4 text-xl font-semibold text-bronze-dark">
            YTC Entry
          </h1>
          <p className="text-sm text-stone-500">Face enrollment dashboard</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-stone-400">
          Logins are issued by IT. Contact the office admin for access.
        </p>
      </div>
    </div>
  );
}
