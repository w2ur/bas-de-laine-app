interface FillShortcutInput {
  effectiveMonthlyBudget: number;
  weeklyIndicator: number;
  balance: number;
  filled: number;
}

interface FillShortcut {
  label: string;
  cents: number;
}

const fmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

function toCents(value: number): number {
  return Math.round(value * 100);
}

export function computeFillShortcuts(input: FillShortcutInput): FillShortcut[] {
  const { effectiveMonthlyBudget, weeklyIndicator, balance, filled } = input;

  if (effectiveMonthlyBudget <= 0) return [];

  const topUpToWeekly = Math.max(0, weeklyIndicator - balance);
  const monthRemainder = Math.max(0, effectiveMonthlyBudget - filled);

  const candidates: (FillShortcut | null)[] = [
    {
      label: `+${fmt.format(weeklyIndicator)}/sem`,
      cents: toCents(weeklyIndicator),
    },
    topUpToWeekly > 0
      ? {
          label: `=${fmt.format(weeklyIndicator)}/sem`,
          cents: toCents(topUpToWeekly),
        }
      : null,
    monthRemainder > 0
      ? {
          label: `Reste\u00A0: ${fmt.format(monthRemainder)}`,
          cents: toCents(monthRemainder),
        }
      : null,
    {
      label: `+${fmt.format(effectiveMonthlyBudget)}/mois`,
      cents: toCents(effectiveMonthlyBudget),
    },
  ];

  return candidates.filter((c): c is FillShortcut => c !== null);
}
