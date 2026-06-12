# Deal Screener — Phase 1 Revision 5

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
- Market slots show on both Fix & Flip and Rentals tabs
- Onboarding fires on fresh localStorage (clear and reload to test)

---

## Task 1 — Fix Market Picker: State Buttons Showing Blank

**Problem:**
The market picker "Choose Your Primary Market" screen shows state buttons with only a `›` chevron and no state name text. The state label is either empty, invisible, or not being set.

**How to diagnose first:**
Open the picker and run in console:
```js
document.querySelectorAll('.picker-state-btn')[0].textContent
```
This will show what text is actually in the first button. Also inspect the button's innerHTML and check if a CSS rule is hiding the text (color: transparent, font-size: 0, overflow hidden, etc.).

**Most likely causes (check in this order):**

1. **State derivation is returning empty** — the `pickerBuildStateList` function derives the state code with `market.name.split(' ').pop()`. If `market.name` is undefined for any entry in PICKER_MARKETS, `state` becomes `'undefined'` and the button label may be blank. Add a guard:
   ```js
   const state = (market.name || '').split(' ').pop() || '';
   if (!state || state.length !== 2) continue; // skip bad entries
   ```

2. **Button text is being set but CSS hides it** — inspect `.picker-state-btn` in DevTools. Ensure `color` is not `transparent` or matching the background. The button label text must be legible.

3. **Button innerHTML structure mismatch** — if the button renders as `<span class="label"></span><span class="chevron">›</span>` but the JS is setting `btn.textContent` instead of `btn.querySelector('.label').textContent`, the label stays blank. Find the correct property to set.

**Fix:**
Whatever the root cause, the end result must be:
- Each button shows the 2-letter state code + market count: `NC (12) ›`
- OR state full name if space allows: `North Carolina (12) ›`
- All buttons have visible, legible text

**Do not hardcode state names.** Derive dynamically from ALL_MARKETS data.

**Verify:**
1. Clear localStorage, reload → onboarding picker opens
2. State list shows buttons with readable state labels and market counts
3. Run: `document.querySelectorAll('.picker-state-btn')[0].textContent.trim()` → must NOT be empty or just `›`
4. Run: `document.querySelectorAll('.picker-state-btn').length` → must be ≥ 35
5. Tap "NC" or "TX" → market list loads with city names visible
6. Select a market → `localStorage.getItem('primaryMarket')` returns a valid slug

---

## Task 2 — Fix Header Logo: Remove Checkered Background

**Problem:**
The logo mark in the page header (top-left, the `clearpath-mark.png` image) shows a checkered transparency pattern — meaning the PNG has a transparent background but the surrounding container is not providing the correct background color.

**Fix:**
Find the CSS rule for the header logo image or its container. The logo image element (`<img src=".../clearpath-mark.png">`) or its wrapper needs one of these:

```css
/* Option A — match the app's dark background */
.logo-mark, .header-logo img, [class*="logo"] img {
  background-color: #0a0a0a;
}

/* Option B — hide transparency entirely */
.logo-mark, .header-logo img {
  background: none;
  mix-blend-mode: screen;
}
```

Inspect the element in DevTools to find the exact selector. The correct fix is whichever option makes the logo render cleanly on the dark header with no checkered artifact.

**Note:** This is the header logo, not the Get Funding button icon (that was fixed in Revision 3). These are two different elements — fix the header logo specifically.

**Verify:**
1. Hard-reload the app
2. The logo mark in the page header shows cleanly — no checkered transparency grid visible
3. Logo is visible and legible on the dark header background
4. Run: `window.getComputedStyle(document.querySelector('img[src*="clearpath-mark"]')).backgroundColor` → must NOT return `rgba(0, 0, 0, 0)` if the checkered artifact persists, OR confirm visually in browser that no checkering is visible

---

## Task 3 — Dev Mode: Easy Tier Switching Without Stripe

**Problem:**
The tier badge (showing "STARTER") opens the upgrade modal when tapped. For testing, there is no way to switch between Starter/Investor/Pro without a payment flow. Stripe is not yet wired up, so A-Aron cannot test Investor/Pro features.

**Fix — Part A: Secret tap trigger to open Dev Panel**

The dev mode panel already exists in the HTML (`🛠 Dev Mode` modal). Wire a tap trigger to open it:

- Tap the tier badge **5 times in quick succession** (within 2 seconds) → dev panel opens instead of upgrade modal
- Track taps with a counter that resets after 2 seconds:

```js
let devTapCount = 0;
let devTapTimer = null;

tierBadge.addEventListener('click', (e) => {
  devTapCount++;
  clearTimeout(devTapTimer);
  devTapTimer = setTimeout(() => { devTapCount = 0; }, 2000);

  if (devTapCount >= 5) {
    devTapCount = 0;
    openModal('modal-dev'); // or whatever the dev modal ID is
    return;
  }
  // Normal behavior: open upgrade modal on single tap
  openModal('modal-upgrade');
});
```

**Fix — Part B: Dev Panel must actually switch tiers**

Confirm the dev panel's STARTER / INVESTOR / PRO buttons call `setTier()` and reload the app correctly. If `setTier` is not defined or doesn't work, wire it now:

```js
function setTier(tier) {
  localStorage.setItem('tier', tier);
  location.reload();
}
window.setTier = setTier; // keep console access too
```

**Fix — Part C: Tier badge must reflect current tier without opening upgrade modal on first tap**

Single tap on the tier badge should still open the upgrade modal as designed. Only 5 rapid taps opens dev mode. This is intentional — the app should look normal to regular users.

**Verify:**
1. Single-tap the STARTER badge → upgrade modal opens normally ✓
2. Tap the STARTER badge 5 times rapidly (within 2 seconds) → dev panel opens (not upgrade modal)
3. In dev panel, tap INVESTOR → page reloads, badge shows INVESTOR, 4 market slots unlocked
4. Tap badge 5 times rapidly again → dev panel opens
5. Tap PRO → page reloads, badge shows PRO, all 6 slots unlocked
6. Tap badge 5 times → dev panel → tap STARTER → back to 2 slots only
7. Run in console: `setTier('investor')` → works as before (console access preserved)

---

## Final Regression Check

After all 3 tasks complete:

1. `localStorage.clear(); location.reload()` → onboarding picker opens
2. State buttons show readable state code + count (e.g., `NC (12) ›`)
3. Select Charlotte NC → stored as `"charlotte-nc"`, slots update
4. Header logo shows no checkered pattern
5. Single-tap tier badge → upgrade modal opens
6. 5-tap tier badge → dev panel opens
7. Switch to PRO via dev panel → 6 slots show, badge shows PRO
8. Switch back to STARTER → 2 slots, badge shows STARTER
9. Fix & Flip analysis runs, STR analysis runs, pipeline saves work
