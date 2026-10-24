import Link from "next/link";
import { cn } from "@/lib/utils";

interface LedgerRowProps {
  label: React.ReactNode;
  meta?: React.ReactNode;
  amount: React.ReactNode;
  amountClassName?: string;
  /** A thin bar under the meta line; percent is clamped by the caller. */
  bar?: { percent: number; color: string };
  /** The row's main press target: a button when onPress, a link when href. */
  onPress?: () => void;
  href?: string;
  pressLabel?: string;
  /**
   * A second control (e.g. a chevron link). Rendered beside the press target,
   * never inside it: a link inside a button is invalid and breaks screen readers.
   */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * The one list item of the app (DESIGN.md, "The ledger row"): label over a
 * muted meta line on the left, the amount in the serif column on the right,
 * separated from the next row by a rule.
 */
export function LedgerRow({
  label,
  meta,
  amount,
  amountClassName,
  bar,
  onPress,
  href,
  pressLabel,
  trailing,
  className,
}: LedgerRowProps) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
        {bar && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${bar.percent}%`, backgroundColor: bar.color }}
            />
          </span>
        )}
      </span>
      <span className={cn("shrink-0 font-display text-xl tabular-nums", amountClassName)}>{amount}</span>
    </>
  );

  const pressClass =
    "flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-md";

  return (
    <div className={cn("flex items-center gap-1 border-b last:border-b-0", className)}>
      {href ? (
        <Link href={href} aria-label={pressLabel} className={cn(pressClass, "active:bg-muted/60 transition-colors duration-100")}>
          {body}
        </Link>
      ) : onPress ? (
        <button
          type="button"
          onClick={onPress}
          aria-label={pressLabel}
          className={cn(pressClass, "active:bg-muted/60 transition-colors duration-100")}
        >
          {body}
        </button>
      ) : (
        <div className={pressClass}>{body}</div>
      )}
      {trailing}
    </div>
  );
}
