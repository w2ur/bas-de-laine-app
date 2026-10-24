import { Skeleton } from "@/components/ui/skeleton";

export default function ConfigurationLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-44" />

      {/* Income card */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Charges card */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-5" />
        </div>
        <Skeleton className="h-4 w-52" />
      </div>

      {/* Envelope section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Backup card */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
