import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBanner } from "./demo-banner";
import { DEMO_BANNER_TEXT } from "@/lib/demo/mode";

describe("DemoBanner", () => {
  // Regression: this commit — the role="note" paragraph sat outside every landmark
  it("renders the note inside a header (banner) landmark", () => {
    const html = renderToStaticMarkup(<DemoBanner />);
    expect(html).toMatch(/^<header><p role="note"/);
    expect(html).toContain(DEMO_BANNER_TEXT);
    expect(html.endsWith("</p></header>")).toBe(true);
  });
});
