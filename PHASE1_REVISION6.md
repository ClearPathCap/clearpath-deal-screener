# Deal Screener — Phase 1 Revision 6

**Prepared for Claude Code | Created: 2026-06-04**
**Build from this file only. Read CLAUDE.md and MASTER_TRACKER.md first.**

---

## CRITICAL INSTRUCTION

Every task has a **Verify** block. Run every verify step and confirm it passes before marking that task complete. Do not self-report based on intent — verify actual running behavior in the browser.

---

## DO NOT BREAK — Regression Check

Before calling anything done, confirm all of these still work:
- All four nav tabs load without error
- Fix & Flip analysis runs and produces correct verdict + metrics
- STR analysis runs and produces verdict + metrics
- Saving a deal adds it to Pipeline
- Market picker works — states show, selecting a market stores correct slug

---

## Task 1 — Replace Logo with New Transparent Icon Mark

**New file:**
```
Logo/Gemini_Generated_Image_9yspos9yspos9ysp.png
```
Full path: `C:\Users\leach\OneDrive\Documents\Claude\Projects\Deal Screener\Logo\Gemini_Generated_Image_9yspos9yspos9ysp.png`

This is the CPC icon mark (lightning bolt + orbit ring) with a fully transparent background — no gray, no artifacts.

**Fix:**
1. Copy the file into `public/icons/` as `clearpath-mark.png` — **overwrite the existing file**
2. No changes needed to `index.html` — `src` already points to `icons/clearpath-mark.png`
3. In `styles.css`, remove the `background-color: #0a0a0a` workaround that was added to the logo element. The new PNG is genuinely transparent — the dark app background shows through naturally without a CSS workaround.
4. Keep the logo at its current size — do not resize it.

**Verify:**
1. Hard reload — logo appears in the header with no checkered pattern, no gray box, no background color artifact
2. Logo icon is visible and clean on the dark header
3. Run: `window.getComputedStyle(document.querySelector('img[src*="clearpath-mark"]')).backgroundColor` → should be `rgba(0, 0, 0, 0)` (fully transparent — no CSS background override needed)

---

## Task 2 — Repair Cost Estimator: Market-Specific Ranges

**Problem:**
The repair scope cards (Light / Mid / Full Gut) show hardcoded $/sf ranges that never update when the active market changes. Charlotte NC and Los Angeles CA have dramatically different labor costs — the estimator must reflect the active market.

**How the data works:**
`FLIP_MARKETS[slug].repairLow` and `.repairHigh` are the **mid-grade hired-out renovation range** in $/sf for that market:
- Charlotte NC: `repairLow: 40, repairHigh: 85`
- Los Angeles CA: `repairLow: 65, repairHigh: 145`
- Cleveland OH: `repairLow: 32, repairHigh: 75`

**Derive all three scope ranges from these values:**

```js
function getRepairRanges(market) {
  const lo = market.repairLow;
  const hi = market.repairHigh;
  return {
    light: {
      hiredLow:  Math.round(lo * 0.35),
      hiredHigh: Math.round(lo * 0.65),
      selfLow:   Math.round(lo * 0.22),
      selfHigh:  Math.round(lo * 0.40),
    },
    mid: {
      hiredLow:  lo,
      hiredHigh: hi,
      selfLow:   Math.round(lo * 0.62),
      selfHigh:  Math.round(hi * 0.62),
    },
    fullGut: {
      hiredLow:  Math.round(hi * 0.90),
      hiredHigh: Math.round(hi * 1.45),
      selfLow:   Math.round(hi * 0.55),
      selfHigh:  Math.round(hi * 0.90),
    },
  };
}
```

Self-perform saves ~38% on Mid, and more on Full Gut (investor-GC advantage).

**Display logic:**
- When `selfRenovating` toggle is ON → show self-perform ranges in each scope card label
- When toggle is OFF → show hired-out ranges
- Ranges update immediately when the active market slot changes OR the self-reno toggle changes

**Update the scope card $/sf labels only** — the scope descriptions (what's included in each scope) stay the same. Only the `$XX–YY/sf` number updates.

**Update the midpoint estimate:**
The "Use midpoint estimate" button calculates: `((scopeLow + scopeHigh) / 2) × sqft` using the market-specific range for the currently selected scope and current toggle state.

**Verify:**
1. Active market = Charlotte NC (`repairLow: 40, repairHigh: 85`), self-reno OFF:
   - Light shows approximately `$14–26/sf`
   - Mid shows `$40–85/sf`
   - Full Gut shows approximately `$77–123/sf`
2. Same market, self-reno ON:
   - Mid shows approximately `$25–53/sf`
3. Switch active market to Los Angeles CA (`repairLow: 65, repairHigh: 145`):
   - Scope card ranges update immediately without page reload
   - Mid hired shows `$65–145/sf`
   - Mid self-perform shows approximately `$40–90/sf`
4. Switch to Cleveland OH (`repairLow: 32, repairHigh: 75`):
   - Mid hired shows `$32–75/sf`
5. Toggle self-reno ON/OFF — ranges update instantly on both the scope cards AND the estimated repair range line
6. Select Mid scope, enter 1,400 sqft, click "Use midpoint estimate":
   - Charlotte self-reno ON: fills `((25+53)/2) × 1400 ≈ $54,600`
   - LA self-reno ON: fills `((40+90)/2) × 1400 ≈ $91,000`
7. Full analysis still runs and produces correct verdict after all of the above

---

## Task 3 — Validate Min Profit Target Auto-Adjust

**Behavior to KEEP (this is correct and intentional):**
When the active market changes, the Min Profit Target auto-updates to `Math.round(market.medianArv * 0.09 / 1000) * 1000`. This produces market-appropriate targets:
- Charlotte NC (medianArv $427K) → ~$38,000 ✓
- Los Angeles CA (medianArv $1,000K) → $90,000 ✓
- Cleveland OH (medianArv $195K) → ~$18,000 ✓

This is intentional. A flip in LA needs to clear much more profit to justify the risk than a flip in Cleveland.

**What to check and fix if broken:**
1. Confirm the formula `medianArv × 0.09` is what's driving the auto-adjust. If a different formula is in place, document it.
2. The auto-adjust fires when the active market slot changes — not on every keystroke or field change.
3. If the user manually edits the Min Profit Target, their value is respected for that session — the auto-adjust does NOT overwrite a user-edited value mid-session.
4. "Clear & New Deal" resets Min Profit Target back to the market default (`medianArv × 0.09`).

**Verify:**
1. Active market Charlotte → Min Profit Target shows ~$38,000
2. Switch to LA → Min Profit Target updates to ~$90,000
3. Switch to Cleveland → Min Profit Target updates to ~$18,000
4. Manually type $50,000 into Min Profit Target → switch market to Houston TX → field stays at $50,000 (user value respected)
5. Click "Clear & New Deal" → field resets to Houston's market default (~$31,000 for medianArv $345K)

---

## Final Regression Check

After all 3 tasks complete:

1. Header logo: clean, no background artifact, transparent PNG rendering correctly
2. Charlotte repair estimator shows market-specific ranges — different from LA ranges
3. Switching markets updates both the repair ranges AND the min profit target
4. User can override min profit target; "Clear & New Deal" resets to market default
5. Full Fix & Flip analysis runs correctly on Charlotte, LA, and Cleveland
6. STR analysis, Pipeline, and Guide all load without errors
