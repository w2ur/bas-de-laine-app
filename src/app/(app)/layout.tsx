import { DesktopNav } from "@/components/navigation/desktop-nav";
import { BottomTabBar } from "@/components/navigation/bottom-tab-bar";
import { QuickSpendProvider } from "@/components/envelopes/quick-spend-context";
import { QuickSpendSheet } from "@/components/envelopes/quick-spend-sheet";
import { TransferProvider } from "@/components/envelopes/transfer-context";
import { TransferSheet } from "@/components/envelopes/transfer-sheet";
import { PendingDeleteProvider } from "@/components/envelopes/pending-delete-context";
import type { TransferEnvelope } from "@/components/envelopes/transfer-sheet";
import { getHousehold } from "@/lib/auth/server";
import { getEnvelopes } from "@/lib/queries/envelopes";
import { getDescriptionSuggestions } from "@/lib/queries/descriptions";
import { getCurrentFinancialMonth } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { householdId } = await getHousehold();
  const month = getCurrentFinancialMonth();

  const [envelopes, suggestions] = await Promise.all([
    getEnvelopes(householdId, month),
    getDescriptionSuggestions(householdId),
  ]);

  const sheetEnvelopes = envelopes.map((e) => {
    const isBudget = e.type === "BUDGET";
    return {
      id: e.id,
      name: e.name,
      icon: e.icon,
      type: e.type,
      balance: e.balance,
      effectiveMonthlyBudget: isBudget && "effectiveMonthlyBudget" in e ? (e.effectiveMonthlyBudget as number) : 0,
      weeklyIndicator: isBudget && "weeklyIndicator" in e ? (e.weeklyIndicator as number) : 0,
      filled: isBudget && "filled" in e ? (e.filled as number) : 0,
      targetAmount: !isBudget && "targetAmount" in e ? (e.targetAmount as number) : undefined,
    };
  });

  const transferEnvelopes: TransferEnvelope[] = envelopes.map((e) => {
    const base = { id: e.id, name: e.name, icon: e.icon, type: e.type, balance: e.balance };
    if (e.type === "GOAL") {
      return { ...base, type: "GOAL" as const, targetAmount: e.targetAmount };
    }
    return { ...base, type: "BUDGET" as const };
  });

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <QuickSpendProvider>
        <DesktopNav />
        <PendingDeleteProvider>
          <TransferProvider>
            <main className="flex-1 pt-[env(safe-area-inset-top)] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 overflow-x-hidden">
              <div className="mx-auto w-full max-w-[880px] p-4 md:p-6">
                {children}
              </div>
            </main>
            <BottomTabBar />
            <QuickSpendSheet envelopes={sheetEnvelopes} suggestions={suggestions} />
            <TransferSheet envelopes={transferEnvelopes} />
          </TransferProvider>
        </PendingDeleteProvider>
      </QuickSpendProvider>
    </div>
  );
}
