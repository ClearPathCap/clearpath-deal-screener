# Deal Screener — Phase 1 Addendum

**Prepared for Claude Code | Last updated: 2026-05-24**
**Complete all items in PHASE1_SPEC.md first, then work through this document.**

---

## Overview

This addendum captures fixes and adjustments identified during Phase 1 testing. Items are organized by priority — work top to bottom.

---

## 1. Tier Rename — Apply Everywhere

Rename all three tiers consistently across the entire app:

| Old | New |
|---|---|
| Free / Beginner | **Starter** |
| Pro (toggle) | **Investor** |
| (not yet built) | **Pro** |

Everywhere the word "Free" or "Pro" appears as a tier label — header badge, upgrade modals, Guide locks, market region locks — update to the new names. The header badge currently reads "FREE" → change to "STARTER".

---

## 2. Tab Rename

Rename the "STR / RENTAL" tab to **"RENTALS"**.

- Update tab label, page header, and any internal references
- STR remains the only active sub-category for now
- Add placeholder sub-category buttons below the Rentals header: **STR** (active), **Long-Term** (locked, "Coming in Phase 2"), **BRRR** (locked, "Coming in Phase 2")
- This sets up the structure without building those analyzers yet

---

## 3. First Launch — Market Region Selection

On first launch (detected via `localStorage` flag `hasSelectedMarkets`), show a full-screen onboarding modal before the app loads:

**Modal content:**
- Headline: *"Choose Your 2 Home Markets"*
- Subtext: *"Pick the regions where you invest most. You can change these later (once every 30 days)."*
- Display all available Market Regions as a selectable grid (see market list below)
- User must select exactly 2 before proceeding — "Continue" button activates only when 2 are selected
- Store selections in `localStorage` as `selectedMarkets: ["charlotte-nc", "ocean-lakes-sc"]` (example)
- Store selection date as `marketSelectedDate` for the 30-day lock

**Available Market Regions (hardcoded — Phase 2 will expand this list):**

Fix & Flip Markets:
- Charlotte NC
- Atlanta GA
- Dallas TX
- Phoenix AZ
- Tampa FL
- Nashville TN
- Indianapolis IN
- Columbus OH
- Kansas City MO
- Memphis TN
- Jacksonville FL
- San Antonio TX
- Birmingham AL

STR Markets:
- Ocean Lakes SC (Myrtle Beach area)
- Gatlinburg TN
- Pigeon Forge TN
- Lake Murray SC
- Destin FL
- Blue Ridge GA
- Outer Banks NC
- Hilton Head SC
- Gulf Shores AL
- Branson MO

Display all markets in a single scrollable list — don't separate by type. Users invest in both.

**30-day market lock:**
- After selecting, store `marketSelectedDate` in `localStorage`
- If user tries to change markets before 30 days, show: *"You can update your Market Regions on [date]. Upgrade to Investor for flexible market access."*
- Investor and Pro tiers: no lock — can change anytime

---

## 4. Market Region Lock Fixes

### Fix & Flip tab
- **Charlotte NC** → Starter (unlocked)
- **User's second selected market** → Starter (unlocked)
- All other markets → locked with 🔒 and upgrade prompt
- Remove "Regional (1hr+)" from the visible preset list — this was a Charlotte-specific label that doesn't make sense nationally. Replace with user's two selected markets + locked placeholders.

### STR / Rentals tab
- **Ocean Lakes SC** (or user's selected STR market) → Starter (unlocked)
- **User's second selected market** → Starter (unlocked)
- All other markets → locked with 🔒 and upgrade prompt
- **Remove "Custom" from Starter tier entirely** — Custom is a Pro feature, deferred to Phase 2

### Locked market placeholder labels
Locked markets should show the actual market name (so users know what they're missing), not generic "Market 3", "Market 4" labels. The name is the marketing.

---

## 5. Upgrade Modal — Full Tier Details

Replace the "Upgrade — Coming Soon" button and generic modal with a proper tier comparison. When a user taps a locked Market Region, show an upgrade modal with full tier details.

**Modal structure:**

Headline: *"Unlock [Market Name]"*

Display both paid tiers side by side (or stacked on mobile):

---

**INVESTOR**
*[Price TBD — placeholder: $X/mo]*
- 4 Market Regions (your choice)
- Market intel in Field Guide per your regions
- Unlimited pipeline saves
- Deal export — shareable deal summaries
- Share your pipeline with Starter users
- Priority CPC funding review

**PRO**
*[Price TBD — placeholder: $X/mo]*
- 6 Market Regions (your choice)
- Full Field Guide intel for all regions
- Unlimited everything
- Deal export + pipeline sharing
- Dedicated Clear Path Capital private money lender
- Fiduciary representation — best terms across dozens of lenders
- Highest priority CPC funding

---

Buttons: **"Upgrade to Investor"** | **"Upgrade to Pro"** | "Not Now"

Upgrade buttons link to `#` placeholder for now — Stripe integration is Phase 2. Note this clearly in the code as `// TODO: wire to Stripe payment link`.

---

## 6. Header Tier Badge — Make It Functional

The "STARTER" badge in the header should be tappable. On tap, show the same tier comparison modal (Section 5 above) so users can upgrade from anywhere without having to tap a locked market first.

---

## 7. Dev Testing Mode — Hidden Tier Toggle

Add a hidden developer toggle so Aaron can test all three tier experiences without building a full auth system.

**Implementation:**
- In the browser console, typing `setTier('starter')`, `setTier('investor')`, or `setTier('pro')` switches the active tier
- Alternatively, add a hidden tap target (e.g., tap the app version number 5 times rapidly) that opens a dev modal with tier selector
- Store active tier in `localStorage` as `devTier`
- This overrides the real tier logic for testing purposes only
- Add a visible "DEV MODE" indicator when a non-Starter tier is active so Aaron knows he's in test mode
- This should never be visible to real users — gate it behind the hidden trigger only

---

## 8. Guide Tab — Fix Free Access

Currently the entire Guide tab is locked for Starter users. Fix this:

**Starter sees (always unlocked):**
- Field explanations for every input (what ARV means, how MAO is calculated, etc.)
- Glossary of all abbreviations
- Basic investing formulas
- "How to Estimate ARV" section
- "How to Estimate Repair Costs" section
- Private Money Lending Basics section

**Starter does NOT see (locked with blur + upgrade prompt):**
- Market Update (current intel per market)
- Market-specific benchmarks (Charlotte flip benchmarks, Ocean Lakes STR ranges, etc.)
- "Your Edge" section
- Repair cost ranges by specific market

The lock overlay on Guide should say: *"Unlock market-specific intel with Investor or Pro"* with the upgrade CTA.

---

## 9. Guide Toggle — Mirror Between Tabs

The Guide toggle (Beginner/Pro mode display) currently only appears on Fix & Flip. Fix:

- Add the same toggle to the Rentals tab header
- When toggled on either tab, it affects both — it's a global app setting
- Store state in `localStorage` as `guideMode: 'beginner' | 'pro'`
- When toggled on one tab and user switches tabs, the other tab reflects the same state

---

## 10. Self-Renovating Toggle — Fix Repair Cost Update

Current bug: when "Use midpoint estimate in calculator" has already populated the Repair Costs field, toggling Self-Renovating on/off doesn't update that field.

Fix: whenever Self-Renovating is toggled, if the Repair Costs field was populated via the midpoint estimate (track this with a flag), recalculate and update the field using the new scope range (self-perform vs. hired out). The field should update live — the same way it would if the user tapped "Use midpoint estimate" again after toggling.

The self-perform repair ranges are different from hired-out:
- Light: self $12–22/sqft vs. hired $18–35/sqft
- Mid: self $28–48/sqft vs. hired $42–70/sqft  
- Full Gut: self $60–95/sqft vs. hired $90–130/sqft

---

## 11. Copy & Language Fixes

Apply these text changes throughout:

**Sale Costs % helper text:**
- Remove: *"Post-2024 this runs 4.5–5.5%"*
- Replace with: *"Includes agent commissions and closing fees. We use 5% as a conservative market estimate."*

**Down Payment helper text (Rentals tab, Guide mode on):**
- Remove: *"Hard money lenders may require less — check with your lender."*
- Replace with: *"Private money lenders may require less — check with Clear Path Capital to optimize your terms."*

**Platform Fee (Airbnb/VRBO):**
- Change default value from `15` to `3`
- Update hint text to: *"Airbnb charges hosts ~3% per booking. Higher guest-side fees (14–20%) may affect your occupancy rate — factor this into your occupancy % above."*
- In Guide mode: add expanded explanation — *"Platform fees come in two forms: the host fee (~3%, taken from your payout) and the guest fee (~14–20%, added to what guests pay). Your 3% host fee is the direct cost. If guest fees price out budget travelers, it shows up as lower occupancy."*

---

## 12. UI Alignment Fixes

### Share & Install buttons
Both Fix & Flip and Rentals tabs have misaligned share and install (download) icon buttons in the header. Fix alignment — they should sit flush right, vertically centered with the header content, consistent between both tabs.

### Pipeline tab header
The Pipeline tab header doesn't match the visual style of Fix & Flip and Rentals. Align it: same padding, same font treatment, same header structure. "My Pipeline" should sit at the same vertical position as "Fix & Flip" and "Short-Term Rental" on the other tabs.

---

## 13. CPC Funding Button — Priority Tiers

The "Get Funding — Clear Path Capital" button already exists on qualifying deals. Update the behavior based on active tier:

**Starter:** Button label → *"Get Funding — Clear Path Capital"*
Deal summary copied to clipboard includes tag: `[Starter Submission]`

**Investor:** Button label → *"Get Funding — Priority Review"*  
Deal summary includes tag: `[Investor — Priority Review]`
Toast: *"Deal summary copied — your submission will receive priority review from Clear Path Capital."*

**Pro:** Button label → *"Get Funding — Dedicated Broker"*
Deal summary includes tag: `[Pro — Dedicated Broker Requested]`
Toast: *"Deal summary copied — your dedicated Clear Path Capital private money lender will follow up directly."*

Also: add this same "Get Funding" button to the Pipeline tab on each saved deal card (in the expanded view), for any deal that has a passing verdict. This way users can submit deals they saved earlier without having to re-run the analysis.

---

## Verification Checklist

Before handing back, verify:

**Tier naming:**
- [ ] "FREE" badge → "STARTER" everywhere
- [ ] "Pro" toggle renamed to "Investor" everywhere
- [ ] "Pro" tier appears in upgrade modals with correct benefits

**First launch:**
- [ ] Market selection modal fires on fresh install (clear localStorage to test)
- [ ] Exactly 2 markets must be selected before Continue activates
- [ ] Selected markets unlock correctly on both tabs
- [ ] 30-day lock shows correct "available on [date]" message

**Market regions:**
- [ ] Lake Murray SC unlockable as a user selection (not hardcoded locked)
- [ ] Custom market removed from Starter/free view
- [ ] Locked markets show actual market names with 🔒
- [ ] Tapping locked market shows full tier comparison modal

**Upgrade modal:**
- [ ] Both Investor and Pro tiers shown with full benefit lists
- [ ] Upgrade buttons present (link to # placeholder with TODO comment)
- [ ] "Not Now" dismisses cleanly
- [ ] Header STARTER badge tappable → same modal

**Dev mode:**
- [ ] Hidden trigger activates tier switcher
- [ ] setTier() works in console for all three tiers
- [ ] DEV MODE indicator visible when not in Starter
- [ ] Switching tiers updates all locked/unlocked states correctly

**Guide tab:**
- [ ] Starter can see basic field explanations, glossary, formulas
- [ ] Market intel sections blurred/locked for Starter
- [ ] Guide toggle appears on Rentals tab
- [ ] Toggling Guide mode on either tab affects both

**Functional fixes:**
- [ ] Self-Renovating toggle recalculates Repair Costs field when midpoint was used
- [ ] Self-perform vs. hired ranges are correct per scope level

**Copy:**
- [ ] "Post-2024" language removed from Sale Costs
- [ ] Down payment hint references Clear Path Capital
- [ ] Platform fee default is 3% with updated hint text

**Alignment:**
- [ ] Share/install buttons aligned on Fix & Flip header
- [ ] Share/install buttons aligned on Rentals header  
- [ ] Pipeline header matches other tab header styling

**CPC button:**
- [ ] Priority messaging correct per tier (Starter/Investor/Pro)
- [ ] "Get Funding" appears on saved deals in Pipeline expanded view (passing verdict only)
- [ ] Correct toast message per tier
