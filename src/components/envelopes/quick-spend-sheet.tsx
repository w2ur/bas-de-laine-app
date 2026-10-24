"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MAX_CENTS, useCentsInput } from "@/hooks/use-cents-input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ArrowRightLeft, CalendarIcon, Loader2 } from "lucide-react";
import { releaseKeyboardProxy, useQuickSpend } from "./quick-spend-context";
import { useTransfer } from "./transfer-context";
import { fillEnvelope, spendFromEnvelope } from "@/actions/envelopes";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { format as formatDate } from "date-fns";
import { cn } from "@/lib/utils";
import { computeFillShortcuts } from "@/lib/fill-shortcuts";
import { LAST_SPEND_ENVELOPE_KEY, pickDefaultEnvelope } from "@/lib/quick-spend-logic";

interface Envelope {
  id: string;
  name: string;
  icon: string | null;
  type: "BUDGET" | "GOAL";
  balance: number;
  effectiveMonthlyBudget: number;
  weeklyIndicator: number;
  filled: number;
  targetAmount?: number;
}

interface QuickSpendSheetProps {
  envelopes: Envelope[];
  suggestions: Record<string, string[]>;
}

const AMOUNT_INPUT_ID = "quick-spend-amount";
/** Suggestion chips shown; the rest stay reachable through the field's datalist. */
const MAX_SUGGESTION_CHIPS = 4;

/** A choice chip: 44 px tall, 8 px radius (DESIGN.md), sage outline when chosen. */
function chipClass(active: boolean) {
  return cn(
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-100",
    active
      ? "border-primary bg-primary/10 text-foreground font-medium"
      : "border-border text-muted-foreground hover:border-primary/50",
  );
}

function readStoredEnvelope(): string | null {
  try {
    return window.localStorage.getItem(LAST_SPEND_ENVELOPE_KEY);
  } catch {
    return null;
  }
}

function storeEnvelope(id: string) {
  try {
    window.localStorage.setItem(LAST_SPEND_ENVELOPE_KEY, id);
  } catch {
    // Private mode or blocked storage: the sheet simply opens without a default.
  }
}

export function QuickSpendSheet({ envelopes, suggestions }: QuickSpendSheetProps) {
  const { isOpen, envelopeId, mode, close, setMode, select } = useQuickSpend();
  const transfer = useTransfer();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { cents, setCents, reset: resetCents } = useCentsInput();
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const descriptionSuggestionsId = useId();

  // Opened without an envelope (the + button): preselect this device's last one.
  useEffect(() => {
    if (!isOpen || envelopeId) return;
    const picked = pickDefaultEnvelope(null, readStoredEnvelope(), envelopes, mode);
    if (picked) select(picked, mode);
    // Only when the sheet opens; later changes are the household's own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = selectedDate.toDateString() === today.toDateString();
  const isYesterday = selectedDate.toDateString() === yesterday.toDateString();
  const isCustomDate = !isToday && !isYesterday;

  const selected = envelopes.find((e) => e.id === envelopeId);
  const isGoal = selected?.type === "GOAL";

  const shortcuts = selected
    ? computeFillShortcuts({
        effectiveMonthlyBudget: selected.effectiveMonthlyBudget,
        weeklyIndicator: selected.weeklyIndicator,
        balance: selected.balance,
        filled: selected.filled,
      })
    : [];

  const goalShortcuts: { label: string; cents: number }[] = [];
  if (isGoal && selected?.targetAmount) {
    const remaining = selected.targetAmount - selected.balance;
    if (remaining > 0) {
      goalShortcuts.push({
        label: `Reste : ${formatCurrency(remaining)}`,
        cents: Math.round(remaining * 100),
      });
    }
  }

  const activeShortcuts = isGoal ? goalShortcuts : shortcuts;

  const descriptionSuggestions =
    mode === "SPEND" && selected ? suggestions[selected.id] ?? [] : [];

  const choosableEnvelopes =
    mode === "SPEND" ? envelopes.filter((e) => e.type === "BUDGET") : envelopes;

  function resetForm() {
    formRef.current?.reset();
    resetCents();
    setDescription("");
    setSelectedDate(new Date());
  }

  function handleOpenChange(open: boolean) {
    if (open) return;
    close();
    resetForm();
  }

  async function handleSubmit(formData: FormData) {
    if (!envelopeId) {
      toast.error("Veuillez choisir une enveloppe");
      return;
    }
    formData.set("envelopeId", envelopeId);

    if (cents === 0) {
      toast.error("Veuillez saisir un montant");
      return;
    }

    startTransition(async () => {
      const result = mode === "FILL"
        ? await fillEnvelope(formData)
        : await spendFromEnvelope(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (mode === "SPEND") storeEnvelope(envelopeId);
      toast.success(mode === "FILL" ? "Enveloppe remplie" : "Dépense enregistrée");
      resetForm();
      close();
    });
  }

  const title = selected ? `${selected.icon ?? ""} ${selected.name}`.trim() : mode === "SPEND" ? "Dépenser" : "Remplir";
  const description_ = selected
    ? isGoal && selected.targetAmount
      ? `Solde : ${formatCurrency(selected.balance)} sur ${formatCurrency(selected.targetAmount)}`
      : `Solde : ${formatCurrency(selected.balance)}`
    : "Choisissez une enveloppe";

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={handleOpenChange}
      title={title}
      description={description_}
      dirty={cents > 0 || description !== ""}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        document.getElementById(AMOUNT_INPUT_ID)?.focus();
        releaseKeyboardProxy();
      }}
    >
      <form ref={formRef} action={handleSubmit} className="space-y-4">
        {/* Mode: a segmented control, not a second filled button */}
        {!isGoal && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Opération">
            {(["SPEND", "FILL"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "min-h-10 rounded-md text-sm font-medium transition-colors duration-100",
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {m === "SPEND" ? "Dépenser" : "Remplir"}
              </button>
            ))}
          </div>
        )}

        {/* Amount first — card-machine style auto-decimal */}
        <MoneyInput
          id={AMOUNT_INPUT_ID}
          name="amount"
          label="Montant"
          srOnly
          size="lg"
          maxCents={MAX_CENTS}
          cents={cents}
          onCentsChange={setCents}
        />

        {mode === "FILL" && activeShortcuts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeShortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setCents(s.cents)}
                className={chipClass(cents === s.cents)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Envelope */}
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted-foreground">Enveloppe</legend>
          <div className="flex flex-wrap gap-2">
            {choosableEnvelopes.map((env) => (
              <button
                key={env.id}
                type="button"
                aria-pressed={env.id === envelopeId}
                onClick={() => select(env.id, env.type === "GOAL" ? "FILL" : mode)}
                className={chipClass(env.id === envelopeId)}
              >
                {env.icon} {env.name}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Date */}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelectedDate(new Date())} className={chipClass(isToday)}>
            Aujourd&apos;hui
          </button>
          <button type="button" onClick={() => setSelectedDate(yesterday)} className={chipClass(isYesterday)}>
            Hier
          </button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={chipClass(isCustomDate)}>
                <CalendarIcon className="size-4" aria-hidden="true" />
                {isCustomDate
                  ? selectedDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                  : "Autre date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(day) => {
                  if (day) {
                    setSelectedDate(day);
                    setCalendarOpen(false);
                  }
                }}
                disabled={{ after: new Date() }}
                defaultMonth={selectedDate}
              />
            </PopoverContent>
          </Popover>
        </div>
        <input type="hidden" name="date" value={formatDate(selectedDate, "yyyy-MM-dd")} />

        {/* Description */}
        {descriptionSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {descriptionSuggestions.slice(0, MAX_SUGGESTION_CHIPS).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                aria-pressed={description === suggestion}
                onClick={() => setDescription(suggestion)}
                className={chipClass(description === suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <Input
          name="description"
          placeholder="Description (optionnel)"
          className="h-11 text-base md:text-sm"
          list={descriptionSuggestionsId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <datalist id={descriptionSuggestionsId}>
          {descriptionSuggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>

        <Button
          type="submit"
          disabled={isPending}
          className={cn(
            "w-full h-12 text-base font-medium",
            mode === "SPEND"
              ? "bg-spend hover:bg-spend/90 text-white dark:text-background"
              : "bg-primary hover:bg-primary/90 text-primary-foreground",
          )}
        >
          {isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : mode === "SPEND" ? (
            "Dépenser"
          ) : (
            "Remplir"
          )}
        </Button>

        {selected && (
          <button
            type="button"
            onClick={() => {
              const from = selected.id;
              close();
              resetForm();
              transfer.open(from);
            }}
            className="mx-auto flex min-h-11 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            Transférer vers une autre enveloppe
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
