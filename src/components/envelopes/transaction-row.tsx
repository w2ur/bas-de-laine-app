"use client";

import { useState } from "react";
import { LedgerRow } from "@/components/ui/ledger-row";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDayShort } from "@/lib/format";
import { transactionDisplay, type TransactionType } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";
import { usePendingDelete } from "./pending-delete-context";

export interface TransactionRowData {
  id: string;
  type: TransactionType;
  amount: number;
  /** A calendar date (UTC midnight), serialised. */
  date: Date | string;
  description: string | null;
  /** The envelope the row belongs to — shown where the list mixes envelopes. */
  envelope?: { name: string; icon: string | null };
  /** The other side of a transfer. */
  counterpart?: { name: string; icon: string | null } | null;
  /** A transfer's other leg: deleted with this row by the server. */
  linkedTransactionId?: string | null;
}

function envelopeLabel(e: { name: string; icon: string | null }) {
  return `${e.icon ? `${e.icon} ` : ""}${e.name}`;
}

/**
 * The one transaction row (DESIGN.md, "Transaction row"): description or
 * envelope over its date, the signed amount in the serif column. Pressing it
 * opens its sheet, where « Supprimer » hides the row at once and deletes it
 * after the undo window.
 */
export function TransactionRow({
  tx,
  showDate = true,
}: {
  tx: TransactionRowData;
  /** Off where the list is already grouped under day headings. */
  showDate?: boolean;
}) {
  const { scheduleDelete, isHidden } = usePendingDelete();
  const [open, setOpen] = useState(false);
  if (isHidden(tx.id)) return null;

  const display = transactionDisplay(tx.type);
  const amount = `${display.sign}${formatCurrency(tx.amount)}`;
  const amountClass = display.direction === "out" ? "text-spend" : "text-fill-action";
  const label = tx.description || (tx.envelope ? envelopeLabel(tx.envelope) : display.kind);

  const metaParts: string[] = showDate ? [formatDayShort(tx.date)] : [];
  if (tx.envelope && tx.description) metaParts.push(envelopeLabel(tx.envelope));
  if (tx.counterpart) {
    metaParts.push(`${tx.type === "TRANSFER_OUT" ? "vers" : "depuis"} ${envelopeLabel(tx.counterpart)}`);
  }

  return (
    <>
      <LedgerRow
        label={label}
        meta={metaParts.length > 0 ? metaParts.join(" · ") : undefined}
        amount={amount}
        amountClassName={cn("text-lg", amountClass)}
        onPress={() => setOpen(true)}
      />
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={label === display.kind ? undefined : display.kind}
      >
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Montant</dt>
            <dd className={cn("font-display text-2xl tabular-nums", amountClass)}>{amount}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDayShort(tx.date)}</dd>
          </div>
          {tx.envelope && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Enveloppe</dt>
              <dd>{envelopeLabel(tx.envelope)}</dd>
            </div>
          )}
          {tx.counterpart && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{tx.type === "TRANSFER_OUT" ? "Vers" : "Depuis"}</dt>
              <dd>{envelopeLabel(tx.counterpart)}</dd>
            </div>
          )}
        </dl>
        {(tx.type === "TRANSFER_IN" || tx.type === "TRANSFER_OUT") && (
          <p className="mt-4 text-xs text-muted-foreground">
            Supprimer un transfert supprime ses deux côtés.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="mt-6 h-12 w-full text-base"
          onClick={() => {
            setOpen(false);
            scheduleDelete(tx.id, tx.linkedTransactionId);
          }}
        >
          Supprimer
        </Button>
      </BottomSheet>
    </>
  );
}

/**
 * A ruled list of transactions that disappears with its last visible row, so
 * a pending delete never leaves an empty card (or, with `heading`, a day
 * heading over nothing) on screen.
 */
export function TransactionList({
  transactions,
  showDate = true,
  heading,
  empty,
}: {
  transactions: TransactionRowData[];
  showDate?: boolean;
  heading?: React.ReactNode;
  /** Shown instead when no row is visible; nothing by default. */
  empty?: React.ReactNode;
}) {
  const { isHidden } = usePendingDelete();
  const visible = transactions.filter((tx) => !isHidden(tx.id));
  if (visible.length === 0) return empty ?? null;
  return (
    <>
      {heading}
      <div className="rounded-xl border bg-card px-4">
        {visible.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} showDate={showDate} />
        ))}
      </div>
    </>
  );
}
