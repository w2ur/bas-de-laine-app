import { Skeleton } from "@/components/ui/skeleton";

export default function PoolsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-24 mt-1" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>

      {/* Pool rows */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"
          >
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>

      {/* Total footer */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div className="space-y-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  );
}
