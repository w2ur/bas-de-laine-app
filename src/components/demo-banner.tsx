import { DEMO_BANNER_TEXT } from "@/lib/demo/mode";

/**
 * Shown on every (app) screen in DEMO_MODE, full width above the sidebar and the page.
 * Neutral on purpose (DESIGN.md): not terracotta, which means money out, and not sage,
 * which is the screen's one action. text-balance keeps a word from wrapping alone.
 *
 * The <header> makes it the page's banner landmark, so the note is not left outside
 * every landmark region; it adds no box of its own beyond the block the <p> had.
 */
export function DemoBanner() {
  return (
    <header>
      <p
        role="note"
        className="border-b bg-muted px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 text-center text-sm text-balance text-foreground"
      >
        {DEMO_BANNER_TEXT}
      </p>
    </header>
  );
}
