# Deal Screener — Phase 1 Revision 2

**Prepared for Claude Code | Created: 2026-05-26**
**Supersedes nothing — this is additive to PHASE1_REVISION.md. Build from this file for remaining items only.**

Read `CLAUDE.md` and `MASTER_TRACKER.md` before starting.

---

## CRITICAL INSTRUCTION — HOW TO WORK THROUGH THIS FILE

Every task below has a **Verify** block. You MUST run each verify step and confirm it passes before marking that task complete. Do not self-report based on what you intended to write — verify actual running behavior. If a verify step fails, fix and re-verify.

---

## DO NOT BREAK — Regression Protection

Before declaring anything done, confirm these still work:

- All four nav tabs load without error
- Fix & Flip analysis runs and produces a verdict + metrics
- STR analysis runs and produces a verdict + metrics
- Saving a deal adds it to Pipeline
- Pipeline expand/collapse works
- Pipeline delete shows confirmation modal
- Market slots show on both Fix & Flip and Rentals tabs
- Locked slots (3–6) open the upgrade modal when tapped
- Long-Term · Phase 2 and BRRR · Phase 2 sub-tabs are non-tappable/muted
- Guide tab loads all sections

---

## Task 1 — Header Overlap Fix

**Problem:** The sticky `.nav` bar (44px, `top: 26px`) stays on screen when scrolling, but the `.page` content divs have `paddingTop: 0px`, so content scrolls under the nav.

**Fix:**
In `public/src/css/styles.css`, find the `.page` rule. Add `padding-top` equal to the nav height. The nav is 44px tall. If the nav's `top` offset varies, measure it dynamically on init — but a static `padding-top: 56px` on `.page` (44px nav + 12px breathing room) is acceptable and simpler.

Also verify: `scroll-padding-top` on `html` or `body` should match so anchor jumps don't land under the nav.

**Verify:**
1. Open the app in a narrow viewport (430px wide)
2. Scroll down on Fix & Flip tab — the first form field should be fully visible and not hidden under the nav
3. Run: `window.getComputedStyle(document.querySelector('.page')).paddingTop` — must be ≥ 44px

---

## Task 2 — Market Slot System Rewrite

**Problem:** The onboarding stores `marketSlots: ["charlotte-nc","lake-murray-sc"]` (old 2-market array) and `primaryMarket: null`. The spec requires:
- Onboarding picks exactly 1 market → stored as `primaryMarket: "charlotte-nc"`
- Region 2 is a separate empty slot, shown as `[Region 2]`, added later by tapping
- Regions 3–6 are locked

**Current broken state (confirmed via console):**
```
localStorage.primaryMarket = null
localStorage.marketSlots = ["charlotte-nc","lake-murray-sc"]
```

**Fix — Storage migration:**
On app init, if `primaryMarket` is null and `marketSlots` is set, read `marketSlots[0]` as the primary market and write it to `primaryMarket`. Clear the old `marketSlots` key. Write `market_2` only if `marketSlots[1]` was set — but per spec, Region 2 should start empty (the user adds it themselves). Do NOT auto-populate Region 2 from the old data.

**Fix — Onboarding:**
The first-launch modal (triggered when `hasSelectedMarkets` is not set) must:
- Present the 3-step drill-down (Major Region → State → Local Market)
- Allow selection of exactly ONE market
- On confirm, write `primaryMarket: "<slug>"` and `marketSelectedDate: <ISO string>`
- Set `hasSelectedMarkets: "1"`
- Do NOT write `marketSlots` — that key is retired

**Fix — Slot rendering:**
Both Fix & Flip and Rentals tabs render 6 slots:
```
[primaryMarket label]  [Region 2 or "Region 2"]  [🔒 Region 3]  [🔒 Region 4]  [🔒 Region 5]  [🔒 Region 6]
```

- Slot 1 reads from `primaryMarket`
- Slot 2 reads from `market_2` (if set) or shows `"Region 2"` as placeholder text
- Slot 2 is tappable and opens the 3-step market picker with no confirmation popup (first add)
- Slot 2, when already populated and tapped again, shows the change-cooldown confirmation popup
- Slots 3–6 show `🔒 Region 3` through `🔒 Region 6` and open upgrade modal on tap
- Market labels: use display name + state abbreviation. Example: `Charlotte, NC` not just `Charlotte`

**Fix — Unified markets:**
Fix & Flip and Rentals share the same slot state. Tapping a slot on either tab uses the same picker and stores to the same keys.

**Verify:**
1. Clear localStorage completely: `localStorage.clear(); location.reload()`
2. The 3-step onboarding fires immediately
3. Select one market (e.g., Charlotte NC) — confirm modal closes
4. Run: `localStorage.getItem('primaryMarket')` → should return `"charlotte-nc"` (or correct slug)
5. Run: `localStorage.getItem('marketSlots')` → should return `null`
6. Fix & Flip tab shows: `[Charlotte, NC]  [Region 2]  [🔒 Region 3] ...`
7. Rentals tab shows identical slot layout
8. Tapping Region 2 opens 3-step picker with NO confirmation popup
9. Select a second market → verify `localStorage.getItem('market_2')` is set and slot label updates
10. Tap the already-filled Region 2 slot → confirm popup fires with cooldown message

---

## Task 3 — Header Three-Tier Badge

**Problem:** Header badge shows only `"STARTER"` text. It must show the current tier label and allow switching in dev mode. The spec calls for the badge to be tappable and open the upgrade modal.

**Fix:**
The tier badge should read from `localStorage.getItem('tier')` (default: `'starter'`).
Display values: `starter` → `STARTER`, `investor` → `INVESTOR`, `pro` → `PRO`.

The dev mode `setTier()` function must write to `localStorage.tier` and re-render the badge.

Confirm in `public/src/js/main.js` (or wherever tier is managed):
- `setTier('starter')`, `setTier('investor')`, `setTier('pro')` all work via console
- Badge re-renders on tier change without page reload

**Verify:**
1. Open console, run `setTier('investor')` → badge shows `INVESTOR`
2. Run `setTier('pro')` → badge shows `PRO`
3. Run `setTier('starter')` → badge shows `STARTER`
4. Tap the badge → upgrade modal opens

---

## Task 4 — Interest Rate Field (Rentals Tab)

**Problem:** No interest rate field exists in the Rentals tab. Confirmed: searching the DOM for `#interest-rate`, `[id*="interest"]` returns nothing.

**Fix:**
Add a visible, editable **Interest Rate %** field to the Rentals tab under the Cost Assumptions section (or Annual Expenses — wherever debt service inputs live). 

- Field ID: `v-interest-rate`
- Default value: `6.75`
- Input type: number, step 0.01, inputmode="decimal"
- Label: **"Interest Rate %"**
- The debt service formula uses this field: `monthlyDebt = (loanAmount * (rate/12)) / (1 - (1 + rate/12)^(-360))`
  where `rate = interestRate / 100`

**Guide mode helper text** (visible when guide toggle is ON):
> *"Your rate significantly impacts cash flow. Conventional loans run 7–8%. Private money lenders can offer more flexible terms."*
> Followed by a tappable link: **"Check with Clear Path Capital"** → `https://clearpathcapfunding.com/` in new tab.

**Verify:**
1. Rentals tab renders an Interest Rate % field with default 6.75
2. Change the value — run STR analysis — debt service changes in the breakdown
3. Run: `document.getElementById('v-interest-rate').value` → returns current value
4. Turn guide toggle ON → helper text appears below field
5. "Check with Clear Path Capital" link is visible and tappable

---

## Task 5 — Property Manager Default (Rentals)

**Problem:** When "Hired Property Manager" toggle is OFF (meaning: they hired someone), the PM fee field shows 3% instead of the correct default of 8%.

**Fix:**
In the PM toggle change handler:
- Toggle OFF (hired): set field value to `8`, show hint *"Typical range: 8–12%"*
- Toggle ON (self-managing): set field value to `0`, lock/disable field

Also check the initial state on page load — if toggle is OFF on load, field should initialize to `8` not `3`.

**Verify:**
1. Rentals tab loads → PM toggle is OFF by default → `document.getElementById('v-mgmt').value` returns `"8"`
2. Toggle ON (self-managing) → field shows `0` and is disabled
3. Toggle OFF again → field resets to `8`

---

## Task 6 — Share Button Icon

**Problem:** Share button uses connected-dots network SVG. Spec requires iOS-style share icon (box with upward arrow). Confirmed via SVG path inspection.

**Fix:**
Replace the share button SVG in all tabs that have one. The iOS-style share icon path:
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
  <polyline points="16 6 12 2 8 6"/>
  <line x1="12" y1="2" x2="12" y2="15"/>
</svg>
```

Apply to every share button instance across all tabs.

**Verify:**
1. Each tab that has a share button visually shows a box with an upward arrow
2. Tapping the share button still opens the share modal (behavior unchanged)

---

## Task 7 — Get Funding Button Text Fix

**Problem:** Button label `Get Funding — Clear Path Capital` wraps to 2 lines inside the button.

**Fix:**
In `public/src/css/styles.css`, find the Get Funding button style. Add:
```css
white-space: nowrap;
```
If the button is too wide for the container at that point, reduce font-size slightly (try `0.8rem` or `0.75rem`) or reduce letter-spacing. The full label must fit on one line.

**Verify:**
1. Run Fix & Flip analysis with a passing deal → Get Funding button renders
2. Button label is on a single line
3. Run: `document.querySelector('.cpc-btn, [class*="funding"]').scrollWidth <= document.querySelector('.cpc-btn, [class*="funding"]').clientWidth` → true

---

## Task 8 — "Cap Rate" Typo Fix

**Problem:** Pipeline expanded view shows "Cop rate" instead of "Cap rate" in the Key Numbers section.

**Fix:**
Search all JS and HTML files for `"Cop rate"` or `Cop rate` and replace with `Cap rate`. Also search for `cop rate` (lowercase). Likely in `public/src/js/pipeline.js`.

**Verify:**
1. Expand a saved STR deal in Pipeline
2. Key Numbers section shows "Cap rate" not "Cop rate"
3. Run: `grep -ri "cop rate" public/` → returns no matches

---

## Task 9 — Self-Renovating Toggle Recalculates Analysis

**Problem:** The Self-Renovating toggle exists but does not trigger recalculation of the deal analysis. Net Profit, ROI, LTV, Max Offer, Cost Breakdown do not update when toggled.

**Fix:**
In `public/src/js/flip.js` (or wherever the self-reno toggle handler lives):

1. Track whether the repair cost field was auto-populated: `repairInput.dataset.userEdited = 'false'` on load or after "Use midpoint estimate" click. Set `dataset.userEdited = 'true'` on any manual keypress.

2. When toggle fires:
   - If `repairInput.dataset.userEdited === 'true'`: do nothing (user entered their own number)
   - If `userEdited === 'false'` (auto-filled from midpoint): recalculate midpoint using the correct range for the current scope and mode:

| Scope | Self-Perform | Hired Out |
|---|---|---|
| Light | $12–22/sf | $18–35/sf |
| Mid | $28–48/sf | $42–70/sf |
| Full Gut | $60–95/sf | $90–130/sf |

   Midpoint = (low + high) / 2. Write new value to repair cost field. Then re-run the full analysis (call the same analysis function that the Analyze button triggers).

**Verify:**
1. Select "Mid" scope, click "Use midpoint estimate" → repair cost populates (e.g., ~$38/sf × sqft)
2. Run analysis → note Net Profit
3. Toggle Self-Renovating ON → repair cost field updates to mid-range of self-perform rates → Net Profit increases
4. Toggle OFF → repair cost reverts to hired-out midpoint → Net Profit decreases
5. Manually type a repair cost → toggle → cost field does NOT change

---

## Task 10 — localStorage Key Cleanup (Guide Mode + Tier)

**Problem:** Two conflicting legacy keys exist: `guideMode: "pro"` and `beginner_mode: "1"`. No `tier` key exists. This means tier-gating logic reads inconsistent state.

**Fix:**
Standardize on two keys:
- `tier`: `"starter"` | `"investor"` | `"pro"` (default: `"starter"`)
- `guideMode`: `"on"` | `"off"` (default: `"off"`)

On app init, migrate legacy values:
- If `beginner_mode` exists and `guideMode` is not set: write `guideMode: "off"` (beginner mode meant guide was off)
- If `guideMode === "pro"` (old format): rewrite as `"off"` unless the guide toggle checkbox is checked
- Remove `beginner_mode` key after migration
- If `tier` is not set: default to `"starter"`

The guide toggle checkbox state must match `localStorage.guideMode`: if `"on"`, checkbox checked; if `"off"`, unchecked.

**Verify:**
1. After this fix, run: `localStorage.getItem('tier')` → `"starter"`
2. Run: `localStorage.getItem('guideMode')` → `"on"` or `"off"` (not `"pro"` or `"beginner"`)
3. Run: `localStorage.getItem('beginner_mode')` → `null`
4. Toggle guide ON → `localStorage.getItem('guideMode')` → `"on"`
5. Toggle guide OFF → `localStorage.getItem('guideMode')` → `"off"`
6. Guide toggle checkbox state visually matches the stored value

---

## Final Regression Check

After all tasks above are complete, verify the full DO NOT BREAK list at the top of this file. Then run through this sequence:

1. `localStorage.clear(); location.reload()` — onboarding fires, pick one market
2. Go to Fix & Flip — enter a deal, analyze, save to pipeline
3. Go to Rentals → STR — enter a deal, change Interest Rate to 7.5, analyze, save
4. Go to Pipeline — both deals visible, trash icons on collapsed cards, expand STR deal, confirm "Cap rate" label and "Platform fee" label
5. Open console → `setTier('investor')` → header badge shows INVESTOR, locked slots 3–4 unlock
6. Open console → `setTier('pro')` → all 6 slots unlocked
7. Open console → `setTier('starter')` → back to 2 slots only
8. Go to Guide — sections load, Market Intel and Market Benchmarks locked for Starter
9. Tap share button on any tab → correct iOS arrow icon, modal opens
10. Get Funding button on a qualifying deal → single line label, tappable
