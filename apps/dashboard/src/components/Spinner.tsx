/** A small inline loading spinner (no dependency). */
export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-stone-500">
      <span
        className="inline-block h-5 w-5 rounded-full border-2 border-stone-300 border-t-bronze animate-spin"
        aria-hidden
      />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
