import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const { detail } = vi.hoisted(() => ({
  detail: {
    id: "env-1",
    name: "Courses",
    icon: null,
    color: null,
    type: "BUDGET",
    fillCadence: "WEEKLY",
    balance: 120,
    effectiveMonthlyBudget: 878.4,
    totalFilled: 658.8,
    totalSpent: 538.8,
    weeklyIndicator: 219.6,
    weeklyBreakdown: [
      { week: 1, start: new Date(2026, 9, 5), end: new Date(2026, 9, 11), spent: 150, budget: 219.6, transactions: [] },
    ],
  },
}));

vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h1" }) }));
vi.mock("@/lib/queries/envelopes", () => ({ getEnvelopeDetail: async () => detail }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
vi.mock("@/components/envelopes/envelope-detail-actions", () => ({ EnvelopeDetailActions: () => null }));
vi.mock("@/components/envelopes/goal-detail-actions", () => ({ GoalDetailActions: () => null }));
vi.mock("@/components/envelopes/transaction-row", () => ({ TransactionList: () => null }));

const { default: EnvelopeDetailPage } = await import("./page");

describe("envelope detail, WEEKLY", () => {
  // Regression: a « N € par semaine » line under the figures wrapped at 375 px and
  // repeated what every week's row already says (« X € sur N € »).
  it("states the weekly amount once, in the week rows, not under the figures", async () => {
    const html = renderToStaticMarkup((await EnvelopeDetailPage({ params: Promise.resolve({ id: "env-1" }) })) as ReactElement);

    expect(html).not.toContain("par semaine");
    expect(html.replace(/<[^>]+>/g, "")).toMatch(/sur 219,60/);
  });
});
