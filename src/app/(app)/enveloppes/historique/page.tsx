export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getRecentTransactions } from "@/lib/queries/envelopes";
import { capitalizeFirst, getCurrentFinancialMonth, getMonthLabel } from "@/lib/format";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TransactionList } from "@/components/envelopes/transaction-row";

export default async function HistoriquePage() {
  const { householdId } = await getHousehold();
  const month = getCurrentFinancialMonth();
  const transactions = await getRecentTransactions(householdId, month);

  // Group transactions by date
  const grouped = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const key = new Date(tx.date).toDateString();
    const group = grouped.get(key);
    if (group) {
      group.push(tx);
    } else {
      grouped.set(key, [tx]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] leading-tight">Historique</h1>
        <p className="text-muted-foreground mt-1">{capitalizeFirst(getMonthLabel(month))}</p>
      </div>

      {transactions.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          Aucune transaction ce mois-ci
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateKey, txs]) => (
            <section key={dateKey} className="space-y-2 empty:hidden">
              <TransactionList
                showDate={false}
                heading={
                  <h2 className="font-display text-lg">
                    {capitalizeFirst(format(new Date(dateKey), "EEEE d MMMM", { locale: fr }))}
                  </h2>
                }
                transactions={txs.map((tx) => ({
                  id: tx.id,
                  type: tx.type,
                  amount: tx.amount,
                  date: tx.date,
                  description: tx.description,
                  envelope: { name: tx.envelope.name, icon: tx.envelope.icon },
                  counterpart: tx.counterpart,
                  linkedTransactionId: tx.linkedTransactionId,
                }))}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
