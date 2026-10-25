import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/budgets", () => ({ createEnvelope: vi.fn(), updateEnvelope: vi.fn(), archiveEnvelope: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { EnvelopeManager } = await import("./envelope-manager");

const envelopes = [
  { id: "e1", name: "Courses", monthlyBudget: 900, icon: null, color: null, isArchived: false, fillCadence: "WEEKLY" as const },
];

describe("EnvelopeManager budget/pool warning", () => {
  // Regression: the mismatch warning was terracotta (destructive), a colour DESIGN.md
  // reserves for money leaving an envelope.
  it("is a neutral note, never terracotta", () => {
    const html = renderToStaticMarkup(<EnvelopeManager envelopes={envelopes} pool={2075} totalBudgets={900} />);
    const note = html.match(/<div role="note"[^>]*>[^<]*ne correspond pas/)?.[0];

    expect(note).toBeDefined();
    expect(note).toContain("bg-muted");
    expect(note).not.toMatch(/destructive|spend/);
  });

  it("is absent when the budgets match the pool", () => {
    const html = renderToStaticMarkup(<EnvelopeManager envelopes={envelopes} pool={900} totalBudgets={900} />);
    expect(html).not.toContain("ne correspond pas");
  });
});
