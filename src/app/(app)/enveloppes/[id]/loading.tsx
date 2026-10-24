import { Skeleton } from "@/components/ui/skeleton";

export default function EnvelopeDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-4">
        <Skeleton className="size-9 rounded-md" />
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-28 mt-1" />
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Progress bar card */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Weekly breakdown card */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <Skeleton className="h-6 w-44" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
