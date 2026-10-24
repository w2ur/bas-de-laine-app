"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_MONEY_CENTS,
  centsFromInput,
  clampCents,
  formatCentsDisplay,
  hiddenValue,
  moneyInputAttributes,
  parsePastedAmount,
  useCentsInput,
} from "@/hooks/use-cents-input";
import { cn } from "@/lib/utils";

interface MoneyInputCommonProps {
  /** Form field name; the hidden input submits `(cents / 100).toFixed(2)`. */
  name: string;
  /** Accessible label text. */
  label: string;
  /** Ceiling in cents. Defaults to the schemas' MAX_MONEY (999_999_999_999 cents). */
  maxCents?: number;
  /** Visually hides the label (still readable by screen readers). */
  srOnly?: boolean;
  size?: "default" | "lg";
  autoFocus?: boolean;
  required?: boolean;
  id?: string;
}

interface ControlledMoneyInputProps extends MoneyInputCommonProps {
  /** Controlled mode: the parent owns the cents value (e.g. shortcut chips). */
  cents: number;
  onCentsChange: (cents: number) => void;
  defaultCents?: never;
}

interface UncontrolledMoneyInputProps extends MoneyInputCommonProps {
  defaultCents?: number;
  cents?: never;
  onCentsChange?: never;
}

type MoneyInputProps = ControlledMoneyInputProps | UncontrolledMoneyInputProps;

function isControlledMoneyInput(props: MoneyInputProps): props is ControlledMoneyInputProps {
  return props.onCentsChange !== undefined;
}

/**
 * Card-machine style money input: digits shift right-to-left as they are
 * typed (e.g. "9", "9", "5" -> 0,09 -> 0,99 -> 9,95). Submits a hidden
 * dot-decimal string so server schemas keep using z.coerce.number().
 */
export function MoneyInput(props: MoneyInputProps) {
  const {
    name,
    label,
    maxCents = MAX_MONEY_CENTS,
    srOnly = false,
    size = "default",
    autoFocus = false,
    required = false,
    id,
  } = props;

  const generatedId = useId();
  const inputId = id ?? `${name}-${generatedId}`;
  const controlled = isControlledMoneyInput(props);
  const seedCents = controlled ? 0 : (props.defaultCents ?? 0);
  const [touched, setTouched] = useState(false);

  // Always called (rules of hooks) — its state is simply unused in controlled mode.
  const internal = useCentsInput(seedCents, maxCents);

  // Uncontrolled mode only seeds `cents` from defaultCents on mount. Re-seed
  // whenever the caller passes a new defaultCents — e.g. a single edit
  // Dialog switching from one record to another without unmounting — so the
  // field doesn't keep showing the previous record's amount.
  useEffect(() => {
    if (controlled) return;
    internal.setCents(clampCents(seedCents, maxCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedCents]);

  const cents = controlled ? props.cents : internal.cents;
  const displayAmount = formatCentsDisplay(cents);
  const isEmptyRequired = required && cents === 0;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    const next = centsFromInput(e.target.value, maxCents);
    if (controlled) {
      props.onCentsChange(next);
    } else {
      internal.setCents(next);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setTouched(true);
    const parsed = parsePastedAmount(e.clipboardData.getData("text"), maxCents);
    if (parsed === null) return;
    if (controlled) {
      props.onCentsChange(parsed);
    } else {
      internal.setCents(parsed);
    }
  };

  const onBlur = () => setTouched(true);

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className={cn(srOnly && "sr-only")}>
        {label}
      </Label>
      <div className="relative">
        <input
          type="hidden"
          name={name}
          value={hiddenValue(cents, required)}
          required={required}
        />
        <Input
          id={inputId}
          {...moneyInputAttributes()}
          value={isEmptyRequired ? "" : displayAmount}
          onChange={onChange}
          onPaste={onPaste}
          onBlur={onBlur}
          autoFocus={autoFocus}
          required={required}
          aria-required={required || undefined}
          aria-invalid={(touched && isEmptyRequired) || undefined}
          className={cn(
            "pr-10",
            size === "lg" && "h-14 text-center font-display text-3xl md:text-3xl"
          )}
        />
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            size === "lg" ? "right-4 font-display text-xl" : "right-3 text-sm"
          )}
        >
          €
        </span>
      </div>
    </div>
  );
}
