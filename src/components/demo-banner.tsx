import { DEMO_BANNER_TEXT } from "@/lib/demo/mode";

/**
 * Shown on every (app) screen in DEMO_MODE, full width above the sidebar and the page.
 * Neutral on purpose (DESIGN.md): not terracotta, which means money out, and not sage,
 * which is the screen's one action. text-balance keeps a word from wrapping alone.
 */
export function DemoBanner() {
  return (
    <p
      role="note"
      className="border-b bg-muted px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 text-center text-sm text-balance text-foreground"
    >
      {DEMO_BANNER_TEXT}
    </p>
  );
}
