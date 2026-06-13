# Spec — Phase 1D: Walkthrough Fixes
**Prepared for Claude Code | Cowork-authored 2026-06-12, from live walkthrough (WALKTHROUGH_REPORT_2026-06-12.md)**
**App = `docs/`. Items 10–12 are CPC-site tasks (separate repo `C:\Users\leach\clearpath-capital-site`) — split accordingly.**
**Hand-off: "Read SPEC_PHASE1D_FIXES.md and build the Deal Screener items (1–9). Then read it again in the CPC site repo for items 10–12."**

## Deal Screener repo (docs/)

### 1. STR revenue semantics — HIGH (kills qualified leads)
`index.html` ~line 268: label "Gross Annual Rent (STR)" feeds `analyzeRental()` which multiplies by occupancy (`effRent = rent * occ`, rental.js). Users paste AirDNA/Rabbu "annual revenue" (already occupancy-adjusted) → double discount → strong deals flunk (verified: same cabin −5% CoC wrong vs 9.8% right).
**Fix:** label → "Potential Annual Revenue *(at 100% occupancy)*". Add beginner-mode hint under the field: "Using AirDNA/Rabbu annual revenue? That number already includes occupancy — enter it here and set Occupancy to 100%, or back into the full-potential number." Add the same one-liner to the Guide STR section.

### 2. Funding button gate — HIGH (contradicts verdicts)
`clearpath.js` `shouldShowFunding()` shows on any `profit > 0` → button rendered on "Walk Away" verdicts (S3/I2/P4 in report).
**Fix:** require `result.cls === 'hot' || result.cls === 'warm'` (flip) and the rental equivalent. Walk-away deals never show funding regardless of sign.

### 3. Upgrade modal — HIGH (cannot convert)
`index.html` #modal-upgrade shows literal "$X/mo", feature-list bullets, identical for all tiers.
**Fix:** prices $14/mo Investor, $29/mo Pro (per TIER_STRATEGY.md; annual $119/$249 shown as "save 30%"). Context-aware headline by trigger (region lock → "Analyze deals in 4 markets, not 2"; save cap → "Never lose a deal you've already found"). Rewrite bullets as benefits: e.g. "Market intel in Field Guide" → "Your market's repair costs, rents, and flip benchmarks — in your pocket at the showing"; "Dedicated CPC lender" → "A broker who already knows your file before you call." Tier-aware: current investor sees ONLY the Pro column (delta framing: "You have 4 regions. Pro adds 2 more, plus a dedicated broker."). Buttons remain non-functional pre-Stripe — route to a "Get notified at launch" mailto or simple interest tag in localStorage.

### 4. Region-keyed Guide intel — HIGH (the paid promise)
Guide market sections are hardcoded Charlotte/SC regardless of selected regions (verified with Atlanta/Tampa/Indy/Destin selected). All needed data already exists per market in `markets.js` (medianArv, dom, arvRule, repair ranges, rehabNote, strViability, strRev, holdPct).
**Fix:** generate one intel block per *selected* region at render time from markets.js fields: headline benchmarks table + rehabNote + STR viability line. Starter: blocks render for their 2 regions but **locked** (blur + 🔒 "Investor unlocks intel for your regions") — they can see exactly what they'd get. Investor: unlocked for their 4. Pro: all selected. Delete the hardcoded Charlotte/SC + duplicate "Market Update — May 2026" blocks. Reorder Guide for learning flow: How to Estimate ARV → Repair Costs → Key Formulas → Your Market Intel → Private Money Lending Basics (funnel content reads better AFTER the user got value).

### 5. Verdict calibration on large deals — MEDIUM
flip.js: fixed bars (hot ≥20% ROI, warm ≥12%) mislabel big-dollar wins ($165K profit on $1.43M all-in = 11.5% → "Walk Away").
**Fix:** when `profit >= 2.5 * target`, floor the verdict at warm ("Dig Deeper") regardless of ROI bar, with sub-copy: "ROI is below your usual bar, but absolute profit is large — decide if capital efficiency or dollar profit matters more on this one." Keep pass verdict for negative/thin absolute profit.

### 6. Under-box explainer — MEDIUM (currently silent confusion)
When a hot/warm deal fails `qualifiesForCpc` only on loan size (<$150K), show a muted line where the button would be: "This deal's loan (~$149K) is below the $150K private-money minimum Clear Path brokers. Deals $150K+ get a funding option here." (No fake button, just the explanation.) Flag to A-Aron at runtime is fine; LoanBidz referral routing is a business decision — DO NOT build yet.

### 7. Self-reno default — LOW
`index.html` line 75 `checked` on #self-reno inflates beginner max offers (75% vs 70% rule).
**Fix:** default unchecked. Beginner hint: "Only check this if you'll genuinely perform the renovation yourself — lenders verify."

### 8. Funding toast copy — LOW
clearpath.js starter toast still says "paste into the Notes field." With pre-fill live: "Form pre-filled on the Clear Path page — review and submit. (Summary also copied as backup.)" Adjust investor/pro variants equivalently.

### 9. Dead listeners — LOW
main.js:763-764 reference deleted `updateScrollPadding` → pageerror every load/resize. Delete both lines (CSS scroll-padding-top covers it).

## CPC site repo (clearpath-capital-site)

### 10. Submit timeout + frozen-tab resilience — HIGH
Live test: backgrounded tab froze the fetch; UI hung on "Submitting…" forever while the server actually processed (duplicate risk + borrower never sees confirmation).
**Fix:** wrap submit fetch in 15s `AbortController` timeout → on timeout/abort show: "Still working — if you don't see a confirmation email in 2 minutes, your submission may have gone through; check email before resubmitting." Add idempotency: hash of (email+address+loan) in a hidden field; server skips duplicate within 10 min (kills the dupe class entirely).

### 11. Param + dealname polish — MEDIUM
(a) Accept `city`, `state`, `ptype` params per CPC_INTEGRATION_SPEC (screener will send them — add to `buildCpcUrl` map too, Deal Screener side: parse from addr or market). (b) Dealname builder dedupes city/state when already in addr. (c) Add HubSpot custom property `lead_source` = `dealscreener_{tier}` on created deals so A-Aron can filter/report quarterly metrics (description line stays).

### 12. Box boundary — LOW
Snapshot flags "Requested loan exceeds the estimated max loan" when requested == max ($238,000 vs $238,000). Change comparison to strictly-greater (or add $1 tolerance) so at-the-box files read "At maximum leverage — strong support required" instead of "exceeds."

## Verify (after build)
1. STR: enter 84,000 @ 62% → Strong; hint visible in beginner mode.
2. Walk-away flip with positive profit → NO funding button.
3. Upgrade modal: real prices, investor sees only Pro.
4. Guide: select Atlanta → Atlanta benchmarks render (locked on Starter, open on Investor).
5. $1.15M deal P4 inputs → verdict at least "Dig Deeper."
6. $95K deal → explainer line, no button.
7. Submit on CPC with DevTools offline after click → timeout message at 15s.
8. New submission → HubSpot deal has `lead_source=dealscreener_starter`.
