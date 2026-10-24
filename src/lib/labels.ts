/**
 * User-facing labels kept in one place so a mismatch between a label and
 * what it actually describes is a one-line diff, not a hunt through JSX.
 */

/**
 * The summary strip's top figure is the sum of every BUDGET envelope's
 * all-time balance — cumulative by design (overspending an
 * envelope is allowed by design; the balance may go negative), not a
 * week-scoped figure. The label must not claim otherwise.
 */
export const AVAILABLE_BALANCE_LABEL = "Disponible";

/**
 * Toast copy for a fillWeek submission that dropped one or more rows.
 *
 * A drop only means "the window sum no longer matches what this client
 * saw" — it can be a fill added elsewhere, a fill *deleted* elsewhere, or a
 * second tab on the same device (d4b6f80). The previous
 * copy ("Déjà rempli entre-temps sur un autre appareil") asserted both a
 * cause (a fill) and a source (another device) the server never
 * established. This names only what the server did establish — the
 * envelope's state changed since the page loaded — and invites a refresh.
 */
export function fillWeekChangedNotice(droppedCount: number): string {
  const subject = droppedCount === 1 ? "1 enveloppe a changé" : `${droppedCount} enveloppes ont changé`;
  return `${subject} depuis le chargement de la page (remplissage ou suppression). Rafraîchissez et réessayez.`;
}

/**
 * Toast for a `fillWeek` rejected because the sheet's plan is not this
 * week's (`stale: true`). The sheet has already closed and refreshed the
 * plan, so the copy asks for a reopen, not a retry of the same stale plan.
 */
export function fillWeekStaleNotice(error: string): string {
  return `${error}. Le plan a été actualisé : rouvrez le remplissage de la semaine.`;
}
