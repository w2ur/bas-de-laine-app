import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/actions/budgets", () => ({ createEnvelope: vi.fn(), updateEnvelope: vi.fn(), archiveEnvelope: vi.fn() }));
vi.mock("@/actions/goals", () => ({ createGoalEnvelope: vi.fn(), updateGoalEnvelope: vi.fn() }));
vi.mock("@/actions/backup", () => ({ exportHouseholdData: vi.fn(), importHouseholdData: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const [{ EnvelopeManager }, { GoalManager }, { BackupSection }] = await Promise.all([
  import("./envelope-manager"),
  import("./goal-manager"),
  import("./backup-section"),
]);

/** The data-variant of the button whose text ends with `label`. */
function variantOf(html: string, label: string): string | undefined {
  const buttons = html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
  const button = buttons.find((b) => b.replace(/<[^>]+>/g, "").trim().endsWith(label));
  return button?.match(/data-variant="([^"]+)"/)?.[1];
}

// Regression: Configuration carried four filled buttons; DESIGN.md allows one filled
// action per screen, and there it is « Enregistrer » (the income form).
describe("Configuration's secondary actions are outlined", () => {
  it("« Ajouter » an envelope", () => {
    expect(variantOf(renderToStaticMarkup(<EnvelopeManager envelopes={[]} pool={0} totalBudgets={0} />), "Ajouter")).toBe("outline");
  });

  it("« Ajouter » a goal", () => {
    expect(variantOf(renderToStaticMarkup(<GoalManager goals={[]} />), "Ajouter")).toBe("outline");
  });

  it("« Exporter »", () => {
    expect(variantOf(renderToStaticMarkup(<BackupSection />), "Exporter")).toBe("outline");
  });
});
