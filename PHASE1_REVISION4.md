# Deal Screener — Phase 1 Revision 4

**Prepared for Claude Code | Created: 2026-06-03**
**Build from this file only. Read CLAUDE.md and MASTER_TRACKER.md first.**

---

## CRITICAL INSTRUCTION

Every task has a **Verify** block. Run every verify step and confirm it passes before marking that task complete. Do not self-report based on intent — verify actual running behavior in the browser.

---

## DO NOT BREAK — Regression Check

Before calling anything done, confirm all of these still work:

- All four nav tabs load without error
- Fix & Flip analysis runs and produces verdict + metrics
- STR analysis runs and produces verdict + metrics
- Saving a deal adds it to Pipeline
- Pipeline expand/collapse, delete confirmation, and share modal all work
- Market slots show on both Fix & Flip and Rentals tabs
- Locked slots 3–6 open upgrade modal on tap
- Onboarding fires on fresh localStorage (clear and reload to test)
- Guide tab loads all sections

---

## Task 1 — Replace markets.js with Updated Market Data

**What this is:**
The file `Market Data/markets_data.js` (in the project root, NOT inside `public/`) has been fully updated with 134 FLIP markets, 73 STR markets, 149 LTR markets, and 204 ALL_MARKETS entries — covering all US regions. The live app's `public/src/js/markets.js` is stale and must be replaced.

**Fix:**
Copy the full contents of `Market Data/markets_data.js` into `public/src/js/markets.js`. This is a complete file replacement — do not merge or patch. The source file path is:

```
Market Data/markets_data.js
```

The destination file path is:

```
public/src/js/markets.js
```

Do not modify any content during the copy. The file already has correct ES module `export const` syntax, getter functions, and helper functions (`r50`, `holdLow`, `holdHigh`).

**Verify:**
1. Open browser console on the app
2. Run: `import('/src/js/markets.js').then(m => console.log(Object.keys(m.FLIP_MARKETS).length))` — must return `134`
3. Run: `import('/src/js/markets.js').then(m => console.log(Object.keys(m.STR_MARKETS).length))` — must return `73`
4. Run: `import('/src/js/markets.js').then(m => console.log(m.ALL_MARKETS.length))` — must return `204`
5. Run: `import('/src/js/markets.js').then(m => console.log(m.FLIP_MARKETS['houston-tx']?.name))` — must return `"Houston TX"`
6. No console errors on any tab after replacement

---

## Task 2 — Market Picker: Populate States and Markets from ALL_MARKETS

**Problem:**
The 2-step market picker (State → Market) currently uses a hardcoded or limited market list. It must be rebuilt to pull dynamically from `ALL_MARKETS` imported from `markets.js`.

**The picker should only show markets that have Fix & Flip or STR data** — filter `ALL_MARKETS` to entries where `types.includes('flip') || types.includes('str')`. LTR-only markets are Phase 2 and should not appear in the picker yet.

**Fix — State list derivation:**

Derive state from the market's `name` field — the last word is always the 2-letter state code:

```js
import { ALL_MARKETS } from './markets.js';

// Filter to flip+str only
const PICKER_MARKETS = ALL_MARKETS.filter(m =>
  m.types.includes('flip') || m.types.includes('str')
);

// Build state → markets map
const stateMap = {};
for (const market of PICKER_MARKETS) {
  const state = market.name.split(' ').pop(); // "NC" from "Charlotte NC"
  if (!stateMap[state]) stateMap[state] = [];
  stateMap[state].push(market);
}

// Sort markets within each state alphabetically by name
for (const state of Object.keys(stateMap)) {
  stateMap[state].sort((a, b) => a.name.localeCompare(b.name));
}

// Sorted state list (alphabetical by state code)
const sortedStates = Object.keys(stateMap).sort();
```

**Fix — Screen 1 (State list):**
- Render each state as a button showing: `State Code (N markets)` — e.g., `NC (12)`
- Only show states that have at least one market in `stateMap`
- States sorted alphabetically

**Fix — Screen 2 (Market list):**
- Show all markets for the selected state, sorted alphabetically
- Each market shows its display name (e.g., `Charlotte NC`)
- Tapping a market stores `market.id` (the slug) as the value

**Fix — Search behavior (no change from existing logic, just wire to new data):**
- Typing filters stateMap in real time:
  - If search matches a market name directly → skip state screen, show matching markets flat
  - If search matches a state code → show that state's markets
  - Otherwise → filter state list to only states with matching markets
- Search is case-insensitive

**Fix — Slug stored on selection:**
When user taps a market, store `market.id` (the slug, e.g. `"houston-tx"`) — not the display name.

**Verify:**
1. Open market picker (clear localStorage, reload → onboarding opens)
2. State screen shows a list of states — run in console: `document.querySelectorAll('.picker-state-btn').length` → must be greater than 30 (there are 35+ states with data)
3. Type "TX" in search → shows Texas markets directly or filters to TX
4. Type "Sedona" in search → jumps directly to Sedona AZ without state selection step
5. Select "TX" → market list includes "Houston TX", "Fort Worth TX", "Dallas TX" etc.
6. Select "Houston TX" → `localStorage.getItem('primaryMarket')` returns `"houston-tx"`
7. Type "broken bow" in search → shows "Broken Bow OK"
8. Select it → `localStorage.getItem('primaryMarket')` returns `"broken-bow-ok"`

---

## Task 3 — Market Data Lookup: Use Full Market Slug for Benchmarks

**Problem:**
The flip and STR analyzers look up benchmark data using the active market slug. With 134 FLIP markets now available, the lookup must correctly fall back when a market slug exists in `ALL_MARKETS` but has no FLIP data (STR-only destination markets like `broken-bow-ok`).

**Fix — Flip analyzer (`flip.js`):**

When loading market benchmarks, look up `FLIP_MARKETS[slug]`. If not found, use a regional default based on `ALL_MARKETS` region field:

```js
import { FLIP_MARKETS, ALL_MARKETS } from './markets.js';

function getFlipMarket(slug) {
  if (FLIP_MARKETS[slug]) return FLIP_MARKETS[slug];
  // Fallback: find region from ALL_MARKETS, use regional average
  const entry = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  // Return a safe fallback using region-appropriate defaults
  return getRegionalFlipDefault(region);
}
```

Regional defaults (use these values — do not invent different ones):

| Region | medianArv | arvRuleLow | arvRuleHigh | repairLow | repairHigh |
|---|---|---|---|---|---|
| Southeast | 310000 | 0.65 | 0.69 | 38 | 82 |
| South Central | 285000 | 0.65 | 0.69 | 38 | 82 |
| Midwest | 240000 | 0.67 | 0.71 | 33 | 75 |
| Mountain West | 380000 | 0.64 | 0.68 | 40 | 88 |
| Pacific | 550000 | 0.61 | 0.65 | 52 | 115 |
| Northeast | 310000 | 0.64 | 0.68 | 42 | 90 |

**Fix — STR analyzer (`rental.js`):**

Same pattern — look up `STR_MARKETS[slug]`. If not found, use a regional default:

```js
import { STR_MARKETS, ALL_MARKETS } from './markets.js';

function getStrMarket(slug) {
  if (STR_MARKETS[slug]) return STR_MARKETS[slug];
  const entry = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  return getRegionalStrDefault(region);
}
```

Regional STR defaults:

| Region | revLow | revHigh | occLow | occHigh | adrLow | adrHigh |
|---|---|---|---|---|---|---|
| Southeast | 28000 | 48000 | 0.42 | 0.60 | 220 | 360 |
| South Central | 26000 | 46000 | 0.40 | 0.58 | 200 | 340 |
| Midwest | 22000 | 38000 | 0.35 | 0.52 | 180 | 300 |
| Mountain West | 38000 | 68000 | 0.46 | 0.64 | 280 | 460 |
| Pacific | 42000 | 78000 | 0.46 | 0.64 | 310 | 510 |
| Northeast | 32000 | 58000 | 0.38 | 0.55 | 260 | 420 |

**Verify:**
1. Set primary market to `"houston-tx"` → run Fix & Flip → benchmarks load (Max Offer, hold costs use Houston data)
2. Run in console: `import('./src/js/markets.js').then(m => console.log(m.FLIP_MARKETS['houston-tx'].medianArv))` → must return `345000`
3. Set primary market to `"broken-bow-ok"` (STR-only) → run Fix & Flip → analysis runs with a regional fallback (South Central defaults), does NOT crash or show NaN
4. Set primary market to `"broken-bow-ok"` → run STR → benchmarks load using Broken Bow STR data (revLow: 52000)
5. Run in console: `import('./src/js/markets.js').then(m => console.log(m.STR_MARKETS['broken-bow-ok']?.revLow))` → must return `52000`

---

## Task 4 — Market Slot Labels: Show City Name Only (No State Repeat)

**Problem:**
Market slot labels currently show full display name like `"Charlotte NC"`. With the expanded market list including multi-word cities like `"West Palm Beach FL"` and `"South Padre Island TX"`, the slots may overflow on mobile at 3+3 grid layout.

**Fix:**
In the slot label rendering, strip the trailing state code for display inside the slot button itself. Show only the city name portion. The full name can still show in a tooltip or aria-label.

Examples:
- `"Charlotte NC"` → slot shows `"Charlotte"`
- `"West Palm Beach FL"` → slot shows `"West Palm Beach"`
- `"South Padre Island TX"` → slot shows `"South Padre Island"`

Implementation: remove the last word (state code) from the display name:
```js
function slotDisplayName(fullName) {
  const parts = fullName.split(' ');
  return parts.slice(0, -1).join(' ');
}
```

Apply this only to the slot button label text — the toast message ("Switched to X") should still use the full name.

**Verify:**
1. Set primary market to `"west-palm-beach-fl"` → slot shows `"West Palm Beach"` not `"West Palm Beach FL"`
2. Set primary market to `"charlotte-nc"` → slot shows `"Charlotte"` not `"Charlotte NC"`
3. All 6 slots visible in 3+3 grid without overflow at 430px viewport
4. Toast on slot switch shows full name: `"Switched to West Palm Beach FL"`

---

## Final Regression Check

After all 4 tasks complete:

1. `localStorage.clear(); location.reload()` → onboarding picker opens, state list shows 35+ states
2. Type "Houston" → jumps to Houston TX → select → stored as `"houston-tx"`
3. Fix & Flip: analyze deal → benchmarks are Houston-specific (medianArv ~$345K in benchmark guidance)
4. STR: analyze deal → runs without error
5. Slot label shows `"Houston"` (no state repeat)
6. Set market to `"broken-bow-ok"` → both analyzers run without NaN or crash
7. All 4 tabs load, Pipeline works, Guide loads
8. Run: `import('./src/js/markets.js').then(m => { console.log('FLIP:', Object.keys(m.FLIP_MARKETS).length, 'STR:', Object.keys(m.STR_MARKETS).length, 'ALL:', m.ALL_MARKETS.length) })` → `FLIP: 134 STR: 73 ALL: 204`
