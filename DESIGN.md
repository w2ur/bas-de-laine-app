# DESIGN.md — Bas de Laine

This file is the project's documented identity; `design-tells` and
`design-critique` treat what it names as sanctioned. Direction chosen
2026-10-10: **« Le carnet »**, ledger-first.

## Read

Reading this as: a private household budget app used one-handed on a phone
several times a week by two adults, with a quiet account-book language.

## Domain

- The envelope: money set aside for one purpose, opened when spent from.
- The account book (carnet de comptes): ruled lines, one entry per line,
  amounts in a right-hand column, a double rule under the total.
- The Monday ritual: filling the week's envelopes from the month's income.
- The spend: a receipt in hand at the till, typed in before it is forgotten.
- The sock (bas de laine): savings kept apart, goal envelopes.
- The month that runs on weeks: a week belongs to the month of its Monday.

## Colour world

Found in the subject:

- Unbleached paper: the page of a carnet de comptes.
- Sage-green cloth: a ledger's binding, the colour of money set aside.
- Terracotta: the red ink of a debit column.
- Brown-black ink: the entries themselves.
- Pencil grey: ruled lines and the margin notes.
- Blue-black fountain ink: the credit entry, money coming in.

Tokens (a deliberate identity of this app), defined in `src/app/globals.css`
as oklch; hex below is the conversion:

| token | role | light | dark |
|---|---|---|---|
| `--background` | page ground (warm paper, a named choice: G1 sanctioned) | `#f9f6f3` | `#1a1512` |
| `--card` | surfaces: the ledger sheet, sheets | `#ffffff` | `#26201d` |
| `--foreground` | body text and every figure | `#1f1916` | `#f9f6f3` |
| `--muted-foreground` | secondary text, full strength | `#68625e` | `#9e9793` |
| `--border` | rules between ledger lines | `#e3e1de` | `#3f3936` |
| `--primary` / `--success` | sage: the one primary action per screen, and money kept | `#357153` | `#52a27a` |
| `--spend` / `--destructive` | terracotta: **money out, and nothing else** | `#aa5830` | `#dc855d` |
| `--fill-action` | blue: money in (a fill, a transfer received) | `#4f84ba` | `#5e93ca` |

Colour rules:

- Terracotta means money leaving an envelope: a spend amount, an overspent
  balance, the « Dépenser » button. It is never a warning about something else
  (staleness, validation) and never a delete affordance; a delete is a text
  action in the row's own sheet, in `--foreground`.
- Sage is the primary action and the « reste » that is still available. One
  filled sage button per screen.
- A balance's colour says its sign only: ink when positive, terracotta when
  negative. No green for "healthy".

Light and dark both ship (`next-themes`, class strategy, system default). The
dark ground is the same warm hue taken to oklch 0.20: the app is opened in the
evening as often as at the till, so neither is the lesser scheme.

## Type

| role | family | why it fits the Read |
|---|---|---|
| figures and titles | Instrument Serif | the hand-written column of an account book; every amount and every screen title, never body text |
| body, labels, inputs | Plus Jakarta Sans | a legible humanist sans at small sizes on a phone |
| data | Instrument Serif with `tabular-nums` (set on `body`) | amounts align down the right-hand column |

Scale (px): 12 meta (dates, cadence), 14 labels and row text, 16 inputs
(never below, or iOS zooms), 20 row amounts, 28 screen title, 40 the screen's
one lead figure.

Tracking: the fonts' defaults. No tracked-out capitals anywhere.

Formats: always `formatCurrency` (fr-FR, `1 066,14 €`) and French percentages
(`62 %`, via `Intl.NumberFormat` `style: "percent"`), never `toFixed`.

## Space & shape

Spacing scale (px): 4 inside a figure group, 8 between a row's lines, 12 row
padding, 16 page gutter and between blocks inside a section, 24 between
sections.

| role | radius |
|---|---|
| controls (buttons, inputs) | 8 |
| surfaces (the ledger sheet, cards) | 12 |
| bottom sheet top corners | 16 |

Tap targets: 44 px minimum, every row and every control.

## Layout

- **One lead figure per screen**, in the serif at 40 px. Every other figure on
  that screen is 20 px or smaller and sits on one line under it or in a row.
- **The ledger row** is the one list item everywhere (envelopes, transactions,
  charges, pools): left, label over a muted meta line; right, the amount in the
  serif column. Rows are separated by a 1 px `--border` rule, not boxed.
- **Envelope row**: name on the left over its reference (« 27,69 € par semaine » or
  « 110,76 € par mois », or « dépassé de X € » when negative), a 4 px bar of
  balance over reference under it, the balance on the right. The balance is
  cumulative, so no label pairs it with a period (« sur », « cette semaine »);
  the home total keeps the label « Disponible » for the same reason. Tapping the row
  opens the spend sheet on that envelope; a chevron zone (44 px) opens the
  detail page.
- **Transaction row**: description (or envelope name) over date · envelope;
  signed amount on the right, terracotta for money out, blue for money in. No
  type badge: the sign and colour carry it. Tapping a row opens its sheet
  (details, « Supprimer »); a delete commits after an « Annuler » toast window,
  or at once when the app is hidden. Until it commits, the figures still
  include the row: that is expected, not a stale display.
- **Bottom sheets** for every quick task (spend, fill, transfer, the Monday
  ritual): grabber, drag down from the grabber strip to dismiss (never from
  the scrolling content), medium height, amount first. With an amount typed,
  the first dismiss gesture snaps back. No
  centred dialog on mobile except a destructive confirmation that cannot be
  undone.
- **Desktop** (≥ 768 px): the same ledger in a centred column capped at 880 px,
  with a « Dépenser » button in the side navigation.

## Motion

| motion | how often seen | duration | easing |
|---|---|---|---|
| bottom sheet in / out | every spend | 240 ms in, 180 ms out | `cubic-bezier(0.32, 0.72, 0, 1)` |
| row press | every tap | 100 ms | ease-out |
| bar width after a write | after a spend or fill | 200 ms | ease-out |
| list or figure entrance on load | every visit | none | — |

Reduced motion: sheets appear without sliding, bars without transition (the
global `prefers-reduced-motion` rule in `globals.css` already does this).

## Signature

The account-book total — a double rule under the lead figure of the home,
closing the « Disponible » line the way a carnet closes a column. Used once, on
the home (`/enveloppes`), because it is the page the household opens the book
to; every other screen uses a single rule.

## Refused defaults

- B4 — refused; figures are set still (the unused `AnimatedNumber` goes).
- B8 — refused; the envelope detail's four equal stat cards become one lead
  balance with « Budget · Rempli · Dépensé » on one line.
- A7 · B10 — refused; no staggered fade-in of envelope or goal cards on load.
- B9 — refused; the tab bar is a solid `--card` surface, not frosted glass.
- C16 — refused; one filled button per screen, terracotta for money out only.
- A3 — refused; section heads are sentence case in the serif, no eyebrows.
- C8 — refused for interface chrome; an envelope's emoji is the household's
  own data and stays.

## References

| site | taken | refused |
|---|---|---|
| developer.apple.com/design/human-interface-guidelines/sheets | a bottom sheet at medium height with a grabber and swipe to dismiss for a quick task | a full-screen modal for a two-field entry |
| vercel.com/design/guidelines | tabular figures, locale formats, `inputmode="decimal"` and 16 px inputs, undo over an always-visible delete, no autofocus on touch | nothing structural; it is a checklist, not a look |

## Differs from

| neighbour | its direction in one line | axis this one differs on |
|---|---|---|
| my-tsundoku | warm bookish landing and four-pile board, green accent | layout structure: a ruled ledger list, no board or tiles; signature |
| elenchus-web | a paste-and-read instrument with contour rings | ground (warm paper vs its own), signature |
| untilt | the front door of a reasoning-tool suite, contour rings | ground, layout structure |
| pogofish | ink on warm paper, vermilion accent, Instrument Serif display | layout structure and signature: the ledger and its double rule; accent (sage, not vermilion) |
| ecritoire | "Encre": warm paper, ink, oxblood accent, editorial, light-only | layout structure: an app ledger, not an editorial page; ships dark |
| belle-forme | cream ground, muted blue accent, gold for "earned" | layout structure and signature; accent (sage) |
| localhost | dark-primary theme | ground |

Several neighbours share a warm paper ground with this app. The ground predates
the convergence check and is kept on the owner's call; this design differs
from each of them on layout structure and signature instead.
