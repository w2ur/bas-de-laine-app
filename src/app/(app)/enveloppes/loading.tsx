import { Skeleton } from "@/components/ui/skeleton";

export default function EnveloppesLoading() {
  return (
    <div className="space-y-5">
      {/* Header: week label + month subline */}
      <div className="space-y-1.5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Summary: available card + two small cards */}
      <div className="space-y-2">
        <Skeleton className="h-[4.5rem] rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Ritual button */}
      <Skeleton className="h-10 rounded-md" />

      {/* Envelope grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>

      {/* Goal section: heading row + one card */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <div className="px-4 pt-3 pb-2 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="border-t border-border/40 px-3.5 py-3">
            <Skeleton className="h-6 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}
