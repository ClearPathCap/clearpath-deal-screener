# Deal Screener — Phase 1 Revision 3

**Prepared for Claude Code | Created: 2026-05-26**
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

## Task 1 — Header Overlap (Final Fix)

**Problem:** Content is still getting clipped at the top of every tab even when scrolled to the top. Code added `padding-top: 56px` to `.page` divs but the internal page header (logo row + tier badge) is still partially hidden behind the sticky nav bar.

**Fix:**
The sticky `.nav` is 44px tall with `top: 26px`. The total offset from the top of the viewport when stuck is 26px + 44px = 70px. The page content must start at least 70px below the viewport top.

In `styles.css`:
1. Set `.page { padding-top: 72px; }` (70px + 2px breathing room)
2. On the `html` element: `scroll-padding-top: 72px`
3. Do NOT use JavaScript measurement — use this static value. The nav height does not change.

**Verify:**
1. Open Fix & Flip tab, scroll to very top — page title "Fix & Flip" is fully visible, not clipped
2. Repeat on Rentals, Pipeline, and Guide — all page titles fully visible at top
3. Run: `window.getComputedStyle(document.querySelector('.page')).paddingTop` → must be `"72px"`

---

## Task 2 — Market Picker Redesign: 2-Step State → Market

**Problem:** The current picker uses a 3-step regional drill-down (Region → State → Market). Replace with a simpler 2-step flow: State → Market, with a search bar.

**Fix — Picker structure:**
The picker modal (`#modal-market-picker`) displays two screens:

**Screen 1 — State selection:**
- Header: "Choose a State"
- Search bar at top: placeholder "Search markets..." — filters BOTH states and markets simultaneously as user types
- If a search term matches a market name directly (e.g., "Charlotte"), skip the state screen and show matching markets immediately
- List of states alphabetically — only show states that have at least one market in the data
- Each state shows the count of available markets: `North Carolina (8)`
- Tap a state → go to Screen 2

**Screen 2 — Market selection:**
- Header: "Back" arrow + state name (e.g., "← North Carolina")
- Markets listed alphabetically
- Tap a market to select and close the picker

**Search behavior:**
- Typing filters the state list to only states with matching markets
- If the search term matches a market directly, show a flat list of matching markets (skip state grouping)
- Search is case-insensitive

**The picker is used in two places — behavior differs:**
1. **Onboarding (first launch):** Picks primary market → stores to `localStorage.primaryMarket`
2. **Adding/changing a slot:** Picks market for that slot number → stores to `localStorage.market_2` (or `market_3` etc. for Pro/Investor)

**Verify:**
1. Clear localStorage, reload — onboarding picker opens on State screen
2. Select North Carolina → see alphabetical NC markets
3. Select Charlotte NC → `localStorage.primaryMarket === "charlotte-nc"`, picker closes
4. Type "Gatlinburg" in search → jumps straight to Gatlinburg TN without selecting a state first
5. Type "TN" in search → shows all Tennessee markets
6. Only states with data appear in the state list

---

## Task 3 — Onboarding: Always Fire When primaryMarket Is Null

**Problem:** Onboarding does not fire on reload because `hasSelectedMarkets` is already set from a previous session. The check must use `primaryMarket` as the gate, not `hasSelectedMarkets`.

**Fix:**
In app init, replace the onboarding trigger condition:

```js
// OLD (broken):
if (!localStorage.getItem('hasSelectedMarkets')) { showOnboarding(); }

// NEW (correct):
if (!localStorage.getItem('primaryMarket')) { showOnboarding(); }
```

After onboarding completes and `primaryMarket` is written, set `hasSelectedMarkets: "1"` as before for any legacy checks.

**Verify:**
1. `localStorage.clear(); location.reload()` → onboarding fires immediately ✅
2. Complete onboarding → reload again → onboarding does NOT fire ✅
3. `localStorage.removeItem('primaryMarket'); location.reload()` → onboarding fires again ✅

---

## Task 4 — Market Slot Grid Layout (3+3)

**Problem:** Six market slots render as a single horizontal scroll row. On mobile, slots 5 and 6 are not reachable. Fix: render as a 2-row grid, 3 slots per row.

**Fix:**
In `styles.css`, find the `.market-slots` container rule. Replace with:

```css
.market-slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
```

Remove any `overflow-x`, `flex`, or `white-space: nowrap` from this container.

**Verify:**
1. Fix & Flip tab — all 6 slots visible in a 3+3 grid, no horizontal scroll
2. Rentals tab — same grid layout
3. At 430px viewport width, slots do not overflow or wrap awkwardly
4. Grid renders the same on both tabs

---

## Task 5 — Market Slot: Tap to Activate vs. Tap to Change

**Problem:** Tapping an already-populated but inactive slot (e.g., Lake Murray when Charlotte is active) triggers the 30-day cooldown confirmation popup. It should silently switch the active market instead. The cooldown popup should only fire when the user wants to *replace* the market in a slot with a different city.

**Fix — Slot tap logic:**

```
IF slot is locked (3–6):
  → open upgrade modal

IF slot is empty (Region 2 with no market set):
  → open market picker (no confirmation)

IF slot is populated AND not currently active:
  → set this slot as the active market for analysis
  → show brief toast: "Switched to [Market Name]"
  → NO confirmation popup

IF slot is populated AND already active:
  → show cooldown confirmation popup
  → if confirmed, open market picker to replace this slot's market
```

A slot is "active" when it is driving the current analysis (has the highlighted/green styling).

**Verify:**
1. Primary market slot is active (green border), secondary slot is inactive
2. Tap secondary slot → market switches to secondary, toast shows "Switched to [name]", no popup
3. Tap the now-active secondary slot again → cooldown popup fires with correct date
4. Tap a locked slot (3–6) → upgrade modal opens
5. Tap empty Region 2 slot → picker opens with no popup

---

## Task 6 — Market Slot Visual: Primary vs. Secondary Distinction

**Problem:** On Fix & Flip tab, both Charlotte and Lake Murray render with the same green active styling. On Rentals tab, Charlotte has green border and Lake Murray has no border (correct). Fix & Flip needs to match Rentals.

**Fix:**
Only the currently active slot gets the full green border + green text treatment. Inactive populated slots get a muted/white border with white text (same as Rentals already does).

Apply this consistently: the active slot class (e.g., `.slot-active.active`) should only apply to ONE slot at a time — whichever slot is driving the current analysis.

**Verify:**
1. On Fix & Flip, only one slot has green border at a time
2. On Rentals, only one slot has green border at a time
3. Both tabs use identical slot styling logic

---

## Task 7 — Locked Slots Open Upgrade Modal

**Problem:** Tapping Region 3, 4, 5, or 6 does nothing. The upgrade modal should open.

**Fix:**
In the slot tap handler, ensure locked slots (those with class `slot-locked`) call `openModal('modal-upgrade')` on tap. Verify the upgrade modal exists and has content explaining Investor (4 slots) and Pro (6 slots) tiers.

**Verify:**
1. Tap Region 3 → upgrade modal opens immediately
2. Tap Region 4, 5, 6 → same result
3. Modal shows tier comparison with Investor and Pro unlock details
4. Closing the modal returns to the tab without any side effects

---

## Task 8 — Remove "PRO" Label from Guide Toggle

**Problem:** Every tab header shows "PRO | toggle | GUIDE" — the "PRO" label predates the tier rename and now conflicts with the Pro subscription tier name.

**Fix:**
Remove the "PRO" text label from the guide toggle row entirely. The toggle should display only:
- An icon or the word "GUIDE" on one side
- The toggle switch
- No tier label attached

If the toggle needs a label for clarity, use "GUIDE MODE" or just leave the toggle with the GUIDE label on one side only.

**Verify:**
1. Fix & Flip header shows no "PRO" text near the guide toggle
2. Rentals header shows no "PRO" text near the guide toggle
3. Guide toggle still functions (ON/OFF switches correctly)
4. Run: `document.querySelector('.guide-toggle-label, [class*="pro-label"]')` — should return null or have updated text

---

## Task 9 — Verdict Labels: Full System Update

**Problem:** Fix & Flip still shows "HOT DEAL" and other old verdict labels. Update all verdict labels across all tabs to match the new system.

**Fix — Verdict label map:**

| Tab | Tier header | Verdict body |
|---|---|---|
| Fix & Flip — Strong | STRONG SIGNAL | Strong Flip Play |
| Fix & Flip — Middle | NEEDS REVIEW | Dig Deeper & Negotiate |
| Fix & Flip — Weak | NOT A DEAL | Counter at Max Offer — Walk Away |
| STR — Strong | STRONG SIGNAL | Strong STR Play |
| STR — Middle | NEEDS REVIEW | Dig Deeper & Negotiate |
| STR — Weak | NOT A DEAL | Thin Margins — Walk Away |

Also update the verdict badge on Pipeline deal cards to match:
- Fix & Flip strong deals: badge shows `STRONG FLIP PLAY` (not `HOT DEAL`)
- STR strong deals: badge shows `STRONG STR PLAY` ✅ (already correct, verify it stays)

Also update the supporting description text under each verdict to match the new label tone where appropriate.

**Verify:**
1. Run Fix & Flip with a strong deal (ARV >> asking, low repairs) → verdict shows "Strong Flip Play" with "STRONG SIGNAL" header
2. Run Fix & Flip with a borderline deal → verdict shows "Dig Deeper & Negotiate" with "NEEDS REVIEW" header
3. Run Fix & Flip with a clearly bad deal → verdict shows "Counter at Max Offer — Walk Away" with "NOT A DEAL" header
4. Run STR analysis with a strong deal → "Strong STR Play"
5. Save deals → Pipeline cards show updated badge labels
6. Search all JS files: `grep -r "Hot Deal\|HOT DEAL\|Negotiate Hard\|Pass on This One" public/` → returns no matches

---

## Task 10 — Get Funding Button: Expand Trigger Logic

**Problem:** Get Funding button only appears on top-tier "Strong Signal" deals. This gates out most CPC leads. Show the button on any deal with positive returns.

**Fix:**

**Fix & Flip:** Show Get Funding when `netProfit > 0`
**STR Rentals:** Show Get Funding when `annualCashFlow > 0`

Button copy by verdict tier:
- Strong Signal: `Get Funding — Clear Path Capital` (existing copy)
- Needs Review: `Explore Funding Options — Clear Path Capital`
- Not a Deal: hide button (negative returns — genuinely not fundable)

**Verify:**
1. Fix & Flip "Dig Deeper & Negotiate" deal with positive profit → Get Funding button shows with "Explore Funding Options" copy
2. Fix & Flip "Counter at Max Offer" deal with negative profit → Get Funding button hidden
3. STR "Dig Deeper & Negotiate" deal with positive cash flow → Get Funding button shows
4. STR "Thin Margins" deal with negative cash flow → button hidden
5. Tapping Get Funding on a borderline deal → still copies summary to clipboard and opens CPC site

---

## Task 11 — Get Funding Button: Logo Artifact + Text Wrap in Pipeline

**Problem:** The Get Funding button icon still shows a checkered transparency artifact. The button text also wraps to 2 lines inside the expanded Pipeline card view.

**Fix — Logo artifact:**
The icon container inside the Get Funding button must have `background-color: #b8ff57` (same as button background) set explicitly in CSS. Do not rely on transparency inheritance.

**Fix — Text wrap in pipeline:**
The Get Funding button in the pipeline expanded card has a narrower container than the main analyzer. Ensure `white-space: nowrap` is on the button label AND the button container is wide enough. If needed, reduce font-size to `0.78rem` on the pipeline card version specifically to keep the label on one line.

**Verify:**
1. Get Funding button on analyzer tab — icon shows no checkered artifact
2. Get Funding button on analyzer tab — label on one line
3. Expand a pipeline deal with Get Funding → button label on one line
4. Button icon in pipeline — no checkered artifact
5. Run: the button's icon element must have `background-color` matching `#b8ff57`, not transparent

---

## Task 12 — Pipeline: Trash Icon Position

**Problem:** Trash icon is in the card header row alongside the verdict badge and expand chevron, where it can be accidentally tapped when trying to expand the card.

**Fix:**
Move the trash icon to the **bottom-right corner of the collapsed card**, in the same row as the saved date. The card layout when collapsed:

```
[Deal name]                    [Verdict badge]  [chevron ↓]
[Deal type]
[Stat]  [Stat]  [Stat]
[Saved date]                                         [🗑]
```

The trash icon stays in the card footer, not the header. On tap, it still triggers the existing delete confirmation modal before permanently deleting.

**Verify:**
1. Collapsed card shows no trash icon in the header row
2. Trash icon appears at bottom-right of collapsed card
3. Tapping trash → confirmation modal fires ("Are you sure?" / Cancel / Delete)
4. Confirming delete removes the card from Pipeline
5. Tapping the card body/header to expand still works without accidentally triggering delete

---

## Task 13 — Pipeline: Label Fixes in Expanded View

**Problem:** The Fix & Flip expanded deal view in Pipeline shows "Buy / sell closing" — this should have been updated to "Purchase costs / Sale costs" per the previous revision. Also, the verdict badge still shows "HOT DEAL" (covered in Task 9, but the pipeline card specifically needs the label from the saved verdict data).

**Fix:**
In `pipeline.js` (or wherever expanded deal HTML is built), find the line that renders `Buy / sell closing` and replace with `Purchase costs / Sale costs`.

Note: the pipeline renders saved deal data, so the label comes from how the card is built in JS — not from the form label. Find the string in the pipeline rendering code specifically.

**Verify:**
1. Expand a Fix & Flip deal → Property & Inputs section shows "Purchase costs / Sale costs" (not "Buy / sell closing")
2. Run: `grep -r "Buy / sell\|buy.*sell.*closing" public/src/js/pipeline.js` → returns no matches

---

## Task 14 — Rentals: Furnishing in Income & Expense Breakdown

**Problem:** Furnishing/Setup cost ($15,000) is entered as a one-time cost and factors into the CoC denominator, but it does not appear as a line item in the Income & Expense Breakdown. Users see a low CoC and can't understand why.

**Fix:**
Add a line to the Income & Expense Breakdown between "Effective rent" and "Platform fees":

```
Furnishing / setup (one-time)          −$15,000
```

Label it clearly as one-time. It should only appear when the furnishing value is > 0.

Also add a footnote or parenthetical to the CoC line in the breakdown:
`Cash-on-cash (incl. furnishing)`

**Verify:**
1. Enter $15,000 furnishing → breakdown shows "Furnishing / setup (one-time) −$15,000"
2. Enter $0 furnishing → line does not appear in breakdown
3. CoC label reads "Cash-on-cash (incl. furnishing)" or similar to signal the denominator

---

## Task 15 — Rentals: CPC Link in Interest Rate Guide Text

**Problem:** The Interest Rate guide text shows correctly but the "Check with Clear Path Capital" tappable link may not be rendering. Needs to be confirmed and fixed.

**Fix:**
Below the Interest Rate guide text ("Your rate significantly impacts cash flow..."), add a tappable link on its own line:

```
→ Check with Clear Path Capital
```

This link opens `https://clearpathcapfunding.com/` in a new tab. Style it in the accent green (`#b8ff57`) so it stands out as a link.

The link is only visible when the guide toggle is ON.

**Verify:**
1. Turn guide toggle ON on Rentals tab
2. Scroll to Interest Rate field → guide text appears below field
3. "Check with Clear Path Capital" link visible below the guide text, in green
4. Tap the link → opens `https://clearpathcapfunding.com/` in a new tab
5. Turn guide toggle OFF → link not visible

---

## Task 16 — Guide Tab: Move Private Money Lending Basics to Top

**Problem:** Private Money Lending Basics is at the bottom of the Guide, after all educational content. CPC content should be prominent.

**Fix:**
Reorder Guide sections:
1. **Private Money Lending Basics** ← move to top
2. Market Intel (locked)
3. How to Estimate ARV
4. How to Estimate Repair Costs
5. Key Formulas & Definitions
6. Market Benchmarks (locked)

**Verify:**
1. Open Guide tab → first visible section is "Private Money Lending Basics"
2. All sections still present and in correct order
3. Locked sections still show upgrade prompt

---

## Final Regression Check

After all 16 tasks are complete:

1. `localStorage.clear(); location.reload()` → onboarding fires, picker shows State screen
2. Select a state → markets list → select one market → stored as `primaryMarket`
3. Fix & Flip: enter deal, analyze → correct verdict label ("Strong Flip Play" / "Dig Deeper & Negotiate" / "Counter at Max Offer — Walk Away")
4. Get Funding appears on positive-return deals, hidden on negative
5. Save deal → Pipeline shows correct verdict badge
6. Expand pipeline deal → "Purchase costs / Sale costs" label, Get Funding on one line
7. Trash icon at bottom-right of collapsed card, triggers confirmation
8. Rentals: switch between Charlotte/Lake Murray slots silently, no popup
9. Tap Region 3 → upgrade modal
10. Guide: Private Money section is first, locked sections show upgrade prompt
11. No "PRO" text visible next to any guide toggle
12. All 6 market slots visible in 3+3 grid on both tabs
