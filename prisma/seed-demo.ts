/**
 * Demo seed: about three months of an obviously fictional French household, ending
 * on the day it runs, so the public demo always looks current after the nightly
 * reset (scripts/demo-reset.ts, the only caller that writes it).
 *
 * `buildDemoData` is pure and deterministic for a given day (a fixed-seed PRNG);
 * `writeDemoData` inserts its rows into an empty database.
 *
 * Fictional by construction: no real person, shop or brand, only generic places
 * ("Marché", "Pizzeria"). Same rule as prisma/seed.ts — never real financial data.
 */
import type { Prisma } from "@prisma/client";
import { DEMO_HOUSEHOLD_ID, DEMO_USER } from "../src/lib/demo/mode";
import { getMondaysInFinancialMonth } from "../src/lib/format";
import { roundToCents } from "../src/lib/money";
import { computeWeeklyIndicator } from "../src/lib/budget-math";

type Cadence = "WEEKLY" | "MONTHLY";
type TxType = "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT";

interface SpendProfile {
  /**
   * WEEKLY envelopes: spends per week, an inclusive range. MONTHLY envelopes: the
   * chance of one spend in a given week. Only the count and the labels come from
   * here: the amounts are sized so each balance lands on its target (see below).
   */
  perWeek: [number, number] | { chance: number };
  /** Label, and the typical range used to pick the label that fits an amount. */
  items: [description: string, min: number, max: number][];
}

interface BudgetSpec {
  key: string;
  name: string;
  icon: string;
  monthlyBudget: number;
  fillCadence: Cadence;
  spends: SpendProfile;
}

interface GoalSpec {
  key: string;
  name: string;
  icon: string;
  targetAmount: number;
  /** Months from today, or null for a goal without a date. */
  targetInMonths: number | null;
  openingBalance: number;
  monthlyDeposit: number;
}

const BUDGETS: BudgetSpec[] = [
  {
    key: "courses", name: "Courses", icon: "🛒", monthlyBudget: 950, fillCadence: "WEEKLY",
    spends: { perWeek: [3, 4], items: [["Supermarché", 60, 120], ["Marché", 18, 45], ["Boulangerie", 4, 12], ["Primeur", 12, 30]] },
  },
  {
    key: "restos", name: "Restos & cafés", icon: "☕", monthlyBudget: 230, fillCadence: "WEEKLY",
    spends: { perWeek: [1, 2], items: [["Pizzeria", 28, 48], ["Café en terrasse", 6, 14], ["Crêperie", 25, 42], ["Traiteur", 12, 24]] },
  },
  {
    key: "loisirs", name: "Loisirs", icon: "🎭", monthlyBudget: 200, fillCadence: "WEEKLY",
    spends: { perWeek: [0, 2], items: [["Cinéma", 19, 27], ["Librairie", 12, 35], ["Piscine", 7, 12], ["Concert", 30, 55]] },
  },
  {
    key: "transport", name: "Transport", icon: "🚲", monthlyBudget: 150, fillCadence: "WEEKLY",
    spends: { perWeek: [0, 1], items: [["Carburant", 40, 65], ["Parking", 4, 12], ["Vélo en libre-service", 3, 8]] },
  },
  {
    key: "enfants", name: "Activités enfants", icon: "🧸", monthlyBudget: 180, fillCadence: "MONTHLY",
    spends: { perWeek: { chance: 0.8 }, items: [["Cours de musique", 30, 45], ["Sortie scolaire", 8, 15], ["Fournitures", 6, 22]] },
  },
  {
    key: "maison", name: "Maison", icon: "🏠", monthlyBudget: 150, fillCadence: "MONTHLY",
    spends: { perWeek: { chance: 0.8 }, items: [["Quincaillerie", 9, 40], ["Produits ménagers", 12, 25], ["Plantes", 10, 30]] },
  },
  {
    key: "sante", name: "Santé", icon: "💊", monthlyBudget: 90, fillCadence: "MONTHLY",
    spends: { perWeek: { chance: 0.6 }, items: [["Pharmacie", 8, 24], ["Médecin", 8, 12]] },
  },
  {
    key: "cadeaux", name: "Cadeaux", icon: "🎁", monthlyBudget: 125, fillCadence: "MONTHLY",
    spends: { perWeek: { chance: 0.3 }, items: [["Anniversaire", 25, 50], ["Fleurs", 18, 30]] },
  },
];

const GOALS: GoalSpec[] = [
  { key: "vacances", name: "Vacances d'été", icon: "🏖️", targetAmount: 2400, targetInMonths: 8, openingBalance: 900, monthlyDeposit: 250 },
  { key: "urgence", name: "Fonds d'urgence", icon: "🛟", targetAmount: 5000, targetInMonths: null, openingBalance: 2600, monthlyDeposit: 150 },
  { key: "velo", name: "Vélo cargo", icon: "🚴", targetAmount: 1800, targetInMonths: 5, openingBalance: 300, monthlyDeposit: 100 },
];

const CHARGES: { name: string; amount: number; dayOfMonth: number; active: boolean }[] = [
  { name: "Loyer", amount: 1180, dayOfMonth: 5, active: true },
  { name: "Crèche", amount: 380, dayOfMonth: 3, active: true },
  { name: "Électricité", amount: 74.64, dayOfMonth: 10, active: true },
  { name: "Assurance habitation", amount: 21.5, dayOfMonth: 8, active: true },
  { name: "Assurance auto", amount: 46, dayOfMonth: 12, active: true },
  { name: "Box internet", amount: 29.99, dayOfMonth: 4, active: true },
  { name: "Forfaits mobiles", amount: 24.98, dayOfMonth: 20, active: true },
  { name: "Mutuelle", amount: 68, dayOfMonth: 1, active: true },
  { name: "Abonnement transports", amount: 86.4, dayOfMonth: 1, active: true },
  { name: "Abonnement vidéo", amount: 13.49, dayOfMonth: 15, active: true },
  { name: "Salle de sport", amount: 39, dayOfMonth: 1, active: false },
];

const POOLS: { name: string; availability: "IMMEDIATE" | "SHORT" | "LONG"; amount: number }[] = [
  { name: "Compte joint", availability: "IMMEDIATE", amount: 2860 },
  { name: "Livret A", availability: "SHORT", amount: 11450 },
  { name: "LDDS", availability: "SHORT", amount: 4200 },
  { name: "Assurance-vie", availability: "LONG", amount: 8900 },
];

// The budgets share out exactly the pool (income minus active charges: 4 000 - 1 925),
// so Configuration opens without the budget/pool mismatch warning.
const INCOME = 4000;

/**
 * Where each balance ends, as a share of its reference (the weekly indicator, or
 * the month's effective budget for MONTHLY): inside 30–110 % so the bars read as a
 * real week, except one envelope slightly overspent so the terracotta state shows.
 */
const TARGET_SHARE: [number, number] = [0.4, 1.0];
const OVERSPENT_KEY = "restos";
const OVERSPENT_SHARE: [number, number] = [-0.3, -0.1];
/** Completed weeks of history before the current one (13 weeks: about three months). */
export const DEMO_HISTORY_WEEKS = 13;

const DAY_MS = 86_400_000;

/** mulberry32: a small seeded PRNG, so the same day always yields the same demo. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Mondays (weeks) in the financial month of a UTC-midnight Monday. Mid-month, so the
 * local-time helper reads the right month in any TZ at or east of UTC. */
const mondaysOf = (monday: Date) =>
  getMondaysInFinancialMonth(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), 15)));

/** The first Monday of a financial month falls on day 1 to 7. */
const isFirstMondayOfMonth = (monday: Date) => monday.getUTCDate() <= 7;

export interface DemoData {
  household: Prisma.HouseholdCreateManyInput;
  user: Prisma.UserCreateManyInput;
  envelopes: Prisma.EnvelopeCreateManyInput[];
  transactions: Prisma.EnvelopeTransactionCreateManyInput[];
  /** Transfer legs, each pointing at the other (written after both rows exist). */
  transferLinks: { id: string; linkedTransactionId: string }[];
  recurringCharges: Prisma.RecurringChargeCreateManyInput[];
  treasury: Prisma.TreasuryCreateManyInput;
  adjustments: Prisma.TreasuryAdjustmentCreateManyInput[];
  pools: Prisma.TreasuryPoolCreateManyInput[];
}

/**
 * The demo household as rows, for the calendar day `today` (any time that day, read
 * as UTC; calendar dates in this app are UTC midnight).
 *
 * The current week is left unfilled on purpose, so a visitor can try the Monday ritual.
 */
export function buildDemoData(today: Date): DemoData {
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const currentMonday = addDays(day, -((day.getUTCDay() + 6) % 7));
  const firstMonday = addDays(currentMonday, -7 * DEMO_HISTORY_WEEKS);
  const createdAt = addDays(firstMonday, -1);
  const random = prng(0xb4_5de1);
  const between = (min: number, max: number) => roundToCents(min + random() * (max - min));
  const intBetween = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

  const transactions: Prisma.EnvelopeTransactionCreateManyInput[] = [];
  let txCount = 0;
  const addTx = (envelopeId: string, date: Date, amount: number, type: TxType, description: string | null) => {
    const id = `demo-tx-${String(++txCount).padStart(4, "0")}`;
    transactions.push({ id, envelopeId, date, amount: roundToCents(amount), type, description, createdAt: date });
    return id;
  };

  const envelopes: Prisma.EnvelopeCreateManyInput[] = [
    ...BUDGETS.map((b, index) => ({
      id: `demo-env-${b.key}`,
      householdId: DEMO_HOUSEHOLD_ID,
      name: b.name,
      type: "BUDGET" as const,
      monthlyBudget: b.monthlyBudget,
      fillCadence: b.fillCadence,
      icon: b.icon,
      sortOrder: index + 1,
      createdAt,
    })),
    ...GOALS.map((g, index) => ({
      id: `demo-env-${g.key}`,
      householdId: DEMO_HOUSEHOLD_ID,
      name: g.name,
      type: "GOAL" as const,
      monthlyBudget: null,
      targetAmount: g.targetAmount,
      targetDate:
        g.targetInMonths === null
          ? null
          : new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + g.targetInMonths, 1)),
      icon: g.icon,
      sortOrder: BUDGETS.length + index + 1,
      createdAt,
    })),
  ];

  // Goals: what was saved before the window, then a deposit each financial month.
  for (const goal of GOALS) {
    addTx(`demo-env-${goal.key}`, createdAt, goal.openingBalance, "FILL", "Report");
  }

  // One transfer between envelopes, four weeks back.
  const transferDate = addDays(currentMonday, -26);
  const transfer = { from: "loisirs", to: "restos", amount: 35 };
  const outId = addTx(`demo-env-${transfer.from}`, transferDate, transfer.amount, "TRANSFER_OUT", "Dîner d'anniversaire");
  const inId = addTx(`demo-env-${transfer.to}`, transferDate, transfer.amount, "TRANSFER_IN", "Dîner d'anniversaire");

  // Goals: a deposit each financial month.
  for (let week = 0; week < DEMO_HISTORY_WEEKS; week++) {
    const monday = addDays(firstMonday, 7 * week);
    if (isFirstMondayOfMonth(monday)) {
      for (const goal of GOALS) addTx(`demo-env-${goal.key}`, monday, goal.monthlyDeposit, "FILL", null);
    }
  }

  const currentWeekCount = mondaysOf(currentMonday);
  const daysThisWeek = Math.round((day.getTime() - currentMonday.getTime()) / DAY_MS);
  const labelFor = (items: SpendProfile["items"], amount: number) =>
    (items.find(([, min, max]) => amount >= min && amount <= max) ??
      items.reduce((best, item) => (Math.abs(amount - item[2]) < Math.abs(amount - best[2]) ? item : best)))[0];
  const spendCount = ({ perWeek }: SpendProfile, atLeastOne: boolean) => {
    const count = Array.isArray(perWeek) ? intBetween(perWeek[0], perWeek[1]) : random() < perWeek.chance ? 1 : 0;
    return atLeastOne ? Math.max(count, 1) : count;
  };

  for (const budget of BUDGETS) {
    const envelopeId = `demo-env-${budget.key}`;
    // The app's own amounts: the Monday ritual fills the weekly indicator, or for a
    // MONTHLY envelope the whole effective month (indicator × Mondays) in week 1.
    const weekly = computeWeeklyIndicator(budget.monthlyBudget);
    let filled = 0;
    for (let week = 0; week < DEMO_HISTORY_WEEKS; week++) {
      const monday = addDays(firstMonday, 7 * week);
      let amount = 0;
      if (budget.fillCadence === "WEEKLY") amount = weekly;
      else if (isFirstMondayOfMonth(monday)) amount = weekly * mondaysOf(monday);
      // The window opens mid-month: fund the weeks of that month it covers.
      else if (week === 0) amount = weekly * (mondaysOf(monday) - Math.floor((monday.getUTCDate() - 1) / 7));
      if (amount > 0) {
        addTx(envelopeId, monday, amount, "FILL", null);
        filled += roundToCents(amount);
      }
    }
    if (transfer.to === budget.key) filled += transfer.amount;
    if (transfer.from === budget.key) filled -= transfer.amount;

    const reference = budget.fillCadence === "WEEKLY" ? weekly : roundToCents(weekly * currentWeekCount);
    const [low, high] = budget.key === OVERSPENT_KEY ? OVERSPENT_SHARE : TARGET_SHARE;
    const target = roundToCents(reference * (low + random() * (high - low)));

    // This week's spends (the week is not filled yet), from the typical ranges.
    let spentThisWeek = 0;
    const thisWeekCount = budget.fillCadence === "WEEKLY" ? spendCount(budget.spends, false) : 0;
    for (let i = 0; i < thisWeekCount; i++) {
      const [description, min, max] = budget.spends.items[intBetween(0, budget.spends.items.length - 1)];
      const amount = between(min, max);
      addTx(envelopeId, addDays(currentMonday, intBetween(0, daysThisWeek)), amount, "SPEND", description);
      spentThisWeek += amount;
    }

    // Past spends: exactly what takes the balance to its target, spread over the past
    // weeks (weighted at random), each week's share split into a few receipts.
    const pastTotal = roundToCents(filled - target - spentThisWeek);
    const weeks = Array.from({ length: DEMO_HISTORY_WEEKS }, (_, week) => ({
      week,
      count: spendCount(budget.spends, budget.fillCadence === "WEEKLY"),
      weight: 0.7 + random() * 0.6,
    })).filter((w) => w.count > 0);
    if (weeks.length === 0) weeks.push({ week: DEMO_HISTORY_WEEKS - 1, count: 1, weight: 1 });
    const totalWeight = weeks.reduce((sum, w) => sum + w.weight, 0);
    let left = pastTotal;
    weeks.forEach((w, index) => {
      const weekTotal = index === weeks.length - 1 ? left : roundToCents((pastTotal * w.weight) / totalWeight);
      left = roundToCents(left - weekTotal);
      const shares = Array.from({ length: w.count }, () => 0.5 + random());
      const shareTotal = shares.reduce((sum, share) => sum + share, 0);
      let weekLeft = weekTotal;
      shares.forEach((share, i) => {
        const amount = i === shares.length - 1 ? weekLeft : roundToCents((weekTotal * share) / shareTotal);
        weekLeft = roundToCents(weekLeft - amount);
        const date = addDays(firstMonday, 7 * w.week + intBetween(0, 6));
        addTx(envelopeId, date, amount, "SPEND", labelFor(budget.spends.items, amount));
      });
    });
  }

  const treasuryId = "demo-treasury";
  const poolsTotal = roundToCents(POOLS.reduce((sum, pool) => sum + pool.amount, 0));

  return {
    household: { id: DEMO_HOUSEHOLD_ID, income: INCOME, createdAt },
    user: { ...DEMO_USER, householdId: DEMO_HOUSEHOLD_ID, createdAt },
    envelopes,
    transactions,
    transferLinks: [
      { id: outId, linkedTransactionId: inId },
      { id: inId, linkedTransactionId: outId },
    ],
    recurringCharges: CHARGES.map((charge, index) => ({
      id: `demo-charge-${index + 1}`,
      householdId: DEMO_HOUSEHOLD_ID,
      ...charge,
      createdAt,
    })),
    treasury: { id: treasuryId, householdId: DEMO_HOUSEHOLD_ID, balance: poolsTotal, createdAt },
    adjustments: [
      { id: "demo-adj-1", treasuryId, amount: 26800, type: "SET", label: "Solde de départ", createdAt },
      { id: "demo-adj-2", treasuryId, amount: 640, type: "DEDUCT", label: "Réparation voiture", createdAt: addDays(currentMonday, -45) },
      { id: "demo-adj-3", treasuryId, amount: poolsTotal, type: "REFRESH", label: "Synchronisation avec les comptes", createdAt: addDays(currentMonday, -9) },
    ],
    pools: POOLS.map((pool, index) => ({ id: `demo-pool-${index + 1}`, treasuryId, ...pool, order: index, createdAt })),
  };
}

/** Inserts the demo rows into an empty database, in foreign-key order. */
export async function writeDemoData(tx: Prisma.TransactionClient, data: DemoData): Promise<void> {
  await tx.household.createMany({ data: [data.household] });
  await tx.user.createMany({ data: [data.user] });
  await tx.envelope.createMany({ data: data.envelopes });
  await tx.envelopeTransaction.createMany({ data: data.transactions });
  for (const link of data.transferLinks) {
    await tx.envelopeTransaction.update({ where: { id: link.id }, data: { linkedTransactionId: link.linkedTransactionId } });
  }
  await tx.recurringCharge.createMany({ data: data.recurringCharges });
  await tx.treasury.createMany({ data: [data.treasury] });
  await tx.treasuryAdjustment.createMany({ data: data.adjustments });
  await tx.treasuryPool.createMany({ data: data.pools });
}
