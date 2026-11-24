# DealFit design system

The rules every DealFit screen follows. The tokens live at the top of `docs/src/css/styles.css` (`:root`);
the component layer sits at the end of the same file. `tests/designsystem.test.mjs` pins the structure.

Standard: the craftsmanship of the best native iOS apps, delivered by the web app first and by the Capacitor shell
later (feasibility record §9). Dark theme, one accent, Syne for interface text, DM Mono for numbers.

## Compliance (applies to every component)

- Clear Path Capital is a **broker, not a lender**. No component may say or imply lending, approval, qualification,
  licensure or guaranteed terms.
- Every loan or return figure is an estimate and carries **"(est.)"** where the screen shows it.
- Paid plans buy **app features only** (more market regions, market data, saves, exports). Upsell copy never mentions
  funding, loan access, rates, terms or priority. Every tier keeps "Get Funding" on qualifying deals.
- Lender-facing copy never says "DealFit" or "Deal Screener".

## Colour

The palette is unchanged by this wave: `--bg`, `--surface`, `--surface2`, `--surface3`, `--border`, `--border-strong`,
`--text`, `--accent` (green), `--verdict-hot`, `--warn`, `--danger`, `--info`, each with a `-dim` fill.

Text roles added in this wave:

| Token | Value | Use |
|---|---|---|
| `--text` | `#f0ede8` | primary text and **entered values** |
| `--text-2` | `#9a9a9a` | secondary text, field labels, hints (≥ 4.5:1 on `--bg` and `--surface`) |
| `--placeholder` | `#8a8a8a` | example placeholders (5.3:1 on `--surface`) |
| `--muted` | `#6b6b6b` | legacy decorative text only — not for new body copy |

## Type scale

Eight steps. Syne for interface text; DM Mono for values, money and percentages.

| Token | Size | Role |
|---|---|---|
| `--fs-eyebrow` | 10px | **Section eyebrows — the only uppercase role** (`.slabel`, card titles, metric captions) |
| `--fs-caption` | 11px | hints, footnotes, tab-bar labels |
| `--fs-footnote` | 12px | secondary copy, chips |
| `--fs-label` | 13px | field labels, secondary buttons |
| `--fs-body` | 14px | body copy, values, primary buttons |
| `--fs-callout` | 16px | phone inputs (never below 16px: iOS zooms), the Analyze button |
| `--fs-title3` | 18px | sheet titles |
| `--fs-title2` | 22px | page titles |
| `--fs-title1` | 26px | verdict headline |

Weights `--fw-regular` 400 … `--fw-heavy` 800. Line heights `--lh-tight` 1.15 (titles), `--lh-snug` 1.35 (labels,
buttons), `--lh-body` 1.5 (copy).

**Case.** Field labels, buttons, tabs and body copy are written in sentence case and rendered as written ("Asking price",
"Min profit target"). Acronyms stay in capitals (ARV, DSCR, HOA, LTV). Uppercase with tracking (`--tr-eyebrow`) is
reserved for section eyebrows and metric captions.

## Spacing

A 4px grid: `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 · `--sp-10` 40 ·
`--sp-12` 48. Page side padding is `--gutter` (20px). Related controls sit 8–12px apart; sections 20–24px.

## Shape, touch and layers

- Radii: `--r-xs` 6 · `--r-sm` 8 (inputs, slots) · `--r-md` 10 (cards, buttons) · `--r-lg` 14 (dialogs) · `--r-xl` 20
  (sheet top corners) · `--r-pill` (chips, toasts).
- Touch: every interactive control offers at least `--tap` (44px). Inputs and secondary buttons are `--control-h` (44px);
  the primary task button is `--control-h-lg` (52px).
- Layers: app bar 20 · tab bar 30 · sheets 100 · toast 200.

## Navigation

- **App bar** (`.appbar`): one 52px row — the Clear Path Capital mark and the DealFit name, then the account chip, Share
  and Get the App. Sticky at `top:0`, first element in `<body>`, opaque; the status-bar safe area is padding inside it,
  never an offset. Below 360px the name yields to the mark.
- **Tab bar** (`.tabbar`): the four primary destinations (Fix & Flip, Rentals, Pipeline, Guide) at the bottom, each with
  an icon and a label; the current tab has `aria-current="page"`. Fixed inside the 500px app column with the home-indicator
  safe area inside it. On a touch device it steps aside while the on-screen keyboard is up (detected from the visual
  viewport, so it returns when the keyboard is hidden without leaving the field) and leaves the focus order meanwhile.
- **Page title row** (`.header`): the large page title, then the plan badge and the Guide switch.
- **Segmented controls** (`.sub-tabs`) switch views inside a page and do not create History entries.
- **History** (`viewstack.js`): every tab switch and every sheet is a History entry, so Back (browser button, iOS edge
  swipe, Android back) closes the top sheet first, then returns to the previous tab at the scroll position it was left
  at. Escape closes the top sheet. A required sheet (`data-required`) is not dismissed by Back or Escape from inside the
  app (a browser may still skip an entry pushed without a user gesture — e.g. Chrome's back-button intervention for a
  sheet opened at load; not verified on a device). Closing a sheet that sits under another, or moving Forward into a
  sheet that is closed, never leaves a Back press that does nothing. The URL never changes.

## Buttons

One hierarchy. New markup uses `.btn` plus one role; legacy classes are mapped onto the same roles.

| Role | Class | Look | Legacy classes on this role |
|---|---|---|---|
| Primary — the screen's one task | `.btn--primary` | accent fill, heavy weight | `.btn-analyze`, `.btn-get-funding`, `.btn-confirm.accent`, `.btn-upgrade-pro`, `.locked-upgrade-btn`, `.btn-action.primary` |
| Secondary — supporting actions | `.btn--secondary` | `--surface2` fill, strong border | `.btn-secondary`, `.btn-cancel`, `.btn-save`, `.btn-action`, `.btn-upgrade-investor`, `.fl-open` |
| Tertiary — inline or text actions | `.btn--tertiary` | accent text, no fill | `.use-estimate`, `.picker-back`, `.rep-action`, `.hint-link`, `.slot-more` (quiet) |
| Destructive | `.btn-confirm` | danger fill | — |

Modifiers: `.btn--block` (full width), `.btn--lg` (52px). A button's label wraps inside its column; it never overflows.
Press feedback is a 2% scale (`--dur-instant`); focus is a 2px accent ring.

`.btn-redeem` (sign-in sheet) keeps its own geometry this wave; the sign-in redesign adopts the system.

## Inputs

- Height `--control-h`, radius `--r-sm`, `--surface` fill, `--border`; focus = accent border + a 3px `--accent-dim` ring.
- **Values** render in DM Mono at `--text`. On phones every analyzer input renders at 16px (no iOS zoom).
- **Placeholders** are examples, never values: the markup prefixes a pure example with "e.g." (`e.g. 185,000`,
  `e.g. Charlotte`), and analyzer placeholders render in Syne, regular weight, at `--placeholder`. A field whose
  placeholder repeats its default value (`value="5" placeholder="5"`) is a default, not an example, and has no "e.g.".
- **Labels** sit above the field: `--fs-label`, semibold, `--text-2`, sentence case. Qualifiers ("(optional)",
  "(annual)") are regular weight at `--placeholder`.
- **Keyboard**: an analyzer field gets `enterkeyhint="next"` when focused (`"done"` on the last one); Enter moves to the
  next field and the last one dismisses the keyboard. The focused field is kept clear of the keyboard, the app bar and
  the tab bar (scroll padding, plus one re-centre when the keyboard comes up — never on ordinary scrolling).

## Cards

`--surface` fill, `--border`, radius `--r-md`, 14–16px padding: metric tiles (`.metric`), the breakdown, deal cards,
collapsible "Refine" sections (`.more-section`), the preliminary read (`.firstlook`), the repair estimator and the
ground-up note. A card title is an eyebrow. Cards never nest inside a sheet as decoration.

## Chips

Market slots, presets, pipeline filters and market chips: `--chip-h` (34px), pill radius (slots use `--r-sm` to read
as a grid), `--fs-footnote`. Selected = accent-dim fill with accent border and text.

Plans show **only the market slots they unlock**. After the visitor's first analysis, one quiet line — "More regions
with Investor" (or Pro) — opens the region plans. There are no locked tiles.

## Sheets

On a phone (≤ 600px) every modal presents as a **bottom sheet**: full width, `--r-xl` top corners, a grabber, the
home-indicator safe area inside it, height = content up to 92% of the visible viewport (`dvh`), and it slides up on
`--ease-sheet` over `--dur-sheet`. The grabber marks a dismissible sheet (Back, Escape, the backdrop or its own
button); a required sheet shows none. Drag-to-dismiss is not implemented yet (banked). The page behind is locked; the sheet is the one scrolling surface; a sticky action row
stays reachable. On wider screens the same modal is a centered dialog that fades and scales in.

Exception this wave: the sign-in / plans sheet (`#modal-upgrade`) keeps its centered presentation — sign-in is being
redesigned separately and will adopt the sheet.

## States

One component (`states.js` → `.state`) for every empty, loading and error surface:

- **Empty**: decorative icon, a title, one line of body, and at most one primary action.
- **Loading**: a skeleton (`skeletonHtml`) — placeholder cards with a shimmer, announced once to screen readers. An
  unloaded list is never shown as an empty one.
- **Error**: announced (`role="status"`), says what failed and that nothing changed, and offers Retry as a secondary
  action.

## Motion

| Token | Duration | Use |
|---|---|---|
| `--dur-instant` | 90ms | press feedback |
| `--dur-fast` | 150ms | colour, border, opacity, backdrop fade |
| `--dur-base` | 220ms | a page's content fading in, the tab bar stepping aside |
| `--dur-sheet` | 340ms | sheet presentation |

Curves: `--ease-standard` for everything, `--ease-sheet` (the iOS sheet curve) for sheets, `--ease-exit` for leaving.
Rules: motion follows the user's action and never runs on its own; nothing loops except the loading shimmer; financial
results never animate their numbers. Under `prefers-reduced-motion` every duration collapses to about zero and the
shimmer stops.

## Native shell groundwork (Capacitor, later)

- Back: wire `@capacitor/app` `backButton` to `history.back()`; enable WKWebView back/forward swipe gestures. The view
  stack already turns Back into "close the top sheet, then the previous tab".
- Haptics: `viewstack.js` `haptic()` is a no-op on the web; with `@capacitor/haptics` it gives a selection tick on tab
  switches — never on a financial result.
- Keyboard: `@capacitor/keyboard` resize mode `body`; the tab bar and focus handling above already respond to the
  visual viewport.
