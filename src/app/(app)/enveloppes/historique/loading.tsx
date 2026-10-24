import { Skeleton } from "@/components/ui/skeleton";

export default function HistoriqueLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-5 w-28 mt-1" />
      </div>

      {/* Transaction groups */}
      {Array.from({ length: 2 }).map((_, g) => (
        <section key={g} className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                <Skeleton className="size-6 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
