import { describe, it, expect } from "vitest";
import { AVAILABLE_BALANCE_LABEL, fillWeekChangedNotice, fillWeekStaleNotice } from "./labels";

describe("AVAILABLE_BALANCE_LABEL", () => {
  // Regression: bb5cafb — the summary strip showed the sum of
  // every BUDGET envelope's all-time balance (cumulative by design;
  // overspending an envelope is allowed by design) under a
  // label ("Disponible cette semaine") that claimed it was scoped to the
  // current week. The figure includes every past month's carried-over
  // balance and, in week 1, a MONTHLY envelope's whole month of fills — a
  // week-scoped claim overstates what the number actually promises.
  it("does not claim to be scoped to the current week", () => {
    expect(AVAILABLE_BALANCE_LABEL.toLowerCase()).not.toContain("semaine");
  });
});

describe("fillWeekChangedNotice", () => {
  // Regression: d4b6f80 — a dropped fill only means "the
  // window sum no longer matches what this client saw", which can happen
  // because a fill was added *or deleted* elsewhere, or because a second
  // tab on the very same device already submitted. The previous copy
  // ("Déjà rempli entre-temps sur un autre appareil" / "N déjà à jour sur un
  // autre appareil") asserted both a cause (a fill) and a source (another
  // device) the server never established — see the review's scenario: a
  // manual fill added on the phone made the laptop's top-up drop, and the
  // toast wrongly said the envelope was "déjà rempli" when 118,46 € was
  // still owed. The new copy names the fact the server did establish (the
  // envelope's state changed since the page loaded) without guessing why or
  // where, and tells the user what to do about it.
  it("names that the envelope changed since the page loaded, not a guessed cause or device", () => {
    const singular = fillWeekChangedNotice(1);
    expect(singular).not.toContain("déjà rempli");
    expect(singular).not.toContain("autre appareil");
    expect(singular.toLowerCase()).toContain("changé");
    expect(singular.toLowerCase()).toContain("chargement de la page");
  });

  it("invites a refresh", () => {
    expect(fillWeekChangedNotice(1).toLowerCase()).toContain("rafraîch");
  });

  it("agrees in number for one envelope vs. several", () => {
    expect(fillWeekChangedNotice(1)).toContain("1 enveloppe a changé");
    expect(fillWeekChangedNotice(3)).toContain("3 enveloppes ont changé");
  });
});

describe("fillWeekStaleNotice", () => {
  // Regression: ca44d67 — the stale-week rejection toasted the
  // server's error alone, with nothing telling the user the sheet had to be
  // reloaded. The sheet now closes and refreshes the plan itself, and the
  // notice says so, so the user knows to reopen it rather than retry.
  it("keeps the server's reason and says the plan was reloaded", () => {
    const notice = fillWeekStaleNotice("La date doit être le lundi de la semaine en cours");
    expect(notice).toContain("La date doit être le lundi de la semaine en cours");
    expect(notice.toLowerCase()).toContain("rouvrez");
  });
});
