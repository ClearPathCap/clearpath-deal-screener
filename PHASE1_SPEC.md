# Deal Screener — Phase 1 Build Spec

**Prepared for Claude Code | Last updated: 2026-05-21**
**Phase 0 is complete and verified. This document governs Phase 1.**

Read `CLAUDE.md` and `BUILD_SPEC.md` for project conventions and background before starting.

---

## Overview

Phase 1 has three categories of work:

1. **CPC Branding & Integration** — logo, Get Funding button, CPC link
2. **UX Fixes** — issues found during Phase 0 testing
3. **Tier Architecture** — design the app with monetization tiers in mind (no backend yet — UI scaffolding only)

Do not begin Phase 2 items. They are documented at the bottom for awareness only.

---

## 1. Clear Path Capital Branding

### Logo assets
Files are in `/Logo/`:
- `clearpath-mark.png` — icon/mark (green arrow + orbit ring). Use as PWA app icon, replacing the current "D" SVG placeholder in `manifest.json` and `apple-touch-icon`.
- `ClearPath Capital lo.png` — full horizontal logo, transparent background. Display in the app header.

### Header treatment
- Replace the plain `DEAL SCREENER` text logo with the CPC horizontal logo image (`ClearPath Capital lo.png`)
- Keep "Deal Screener" as a subtitle beneath it, smaller weight
- Update `<title>` to: `Deal Screener — Powered by Clear Path Capital`
- Update `apple-mobile-web-app-title` to: `Deal Screener`
- Color palette unchanged (`#0a0a0a` bg, `#b8ff57` accent)

### PWA icon
- Use `clearpath-mark.png` for `icon-192.png` and `icon-512.png` in `public/icons/`
- Pad to correct dimensions with `#0a0a0a` background — do not distort aspect ratio

---

## 2. "Get Funding" Button — Clear Path Capital Integration

**Show only when:** Deal analysis returns a passing verdict (Good Deal / Great Deal / Strong Signal). Do not show on marginal or failing deals.

**On tap:**
1. Build a plain-text deal summary from current analysis (address if entered, purchase price, ARV, rehab, projected profit/CoC, verdict)
2. Copy to clipboard via `navigator.clipboard.writeText(...)`
3. Open `https://clearpathcapfunding.com/` in a new tab
4. Show toast: *"Deal summary copied — paste into the Notes field on the Clear Path Capital form"*

**Button design:**
- Full-width, below the verdict/results card
- Background: `#b8ff57`, text: `#0a0a0a`
- Label: `Get Funding — Clear Path Capital` with `clearpath-mark.png` icon inline (~20px)
- Min 44px height tap target
- Module: `src/js/clearpath.js`

---

## 3. Geolocation — Regional Market Auto-Selection

**Approach:** Browser Geolocation API only. No external API. No network egress.

**Flow:**
- On first launch, prompt: *"Allow Deal Screener to use your location to set local market conditions?"*
- On grant: get lat/lng → run regional lookup → auto-select closest market preset
- On deny: fall back to manual selection, no error
- Store detected/selected market in `localStorage` — don't re-prompt each session

**Regional lookup table** (build in `src/js/markets.js`):

| Region | States | Default ARV Rule | Hold Cost Adj |
|---|---|---|---|
| Northeast | NY, NJ, CT, MA, RI | 65% | +15% |
| Mid-Atlantic | PA, MD, DE, VA, DC | 68% | +10% |
| Southeast | NC, SC, GA, FL, TN | 72% | baseline |
| Midwest | OH, IN, IL, MI, WI, MN, MO | 72% | -5% |
| South Central | TX, OK, AR, LA | 72% | -5% |
| Mountain West | CO, UT, AZ, NM, NV | 70% | +5% |
| Pacific Coast | CA, OR, WA | 63% | +20% |
| National Default | All other | 70% | baseline |

Use lat/lng bounding boxes per state — hardcoded constants, no API needed.

---

## 4. Beginner / Pro Mode

**Toggle:** Persistent, saved to `localStorage`. Default: **Pro** (current experience).
**Placement:** App header or accessible settings area.

**Beginner mode — what changes:**

*Labels: spell out all abbreviations inline*
- ARV → "ARV (After Repair Value)"
- MAO → "MAO (Maximum Allowable Offer)"
- LTV → "LTV (Loan-to-Value)"
- NOI → "NOI (Net Operating Income)"
- CoC → "CoC (Cash-on-Cash Return)"
- Cap Rate → "Cap Rate (Capitalization Rate)"
- GRM → "GRM (Gross Rent Multiplier)"

*Input fields: add helper text beneath each*
- Purchase Price: *"The price you'd pay to buy the property"*
- ARV: *"What the property will be worth after all repairs are done"*
- Rehab / Repair Costs: *"Your total budget to fix up the property"*
- Hold Period: *"How many months you expect to own it before selling"*
- Purchase Costs %: *"Fees at closing when you buy — title, escrow, inspections"*
- Sale Costs %: *"Agent commissions + closing fees when you sell"*

*Verdict language: add one-liner explanations*
- Strong deal: *"This deal meets your return target. Worth pursuing — verify your ARV with comps."*
- Negotiate hard: *"Close to your target. Counter at the Max Offer price shown."*
- Pass: *"This deal doesn't hit your minimum profit. The numbers don't work at this price."*

*Guide tab: show basic field explanations tier (see Section 7)*

**Pro mode:** No changes from current behavior.

**Implementation:** `isBeginnerMode()` helper in `main.js` reads localStorage. Use `body.beginner-mode` CSS class + JS to swap label text. No duplicate HTML.

---

## 5. UX Fixes — Fix & Flip Tab

### 5a. Comma formatting in input fields
All currency input fields must format with commas as the user types (e.g., `200000` → `200,000`). Use the existing `format.js` helpers. Apply to: Asking Price, ARV, Repair Costs, Carrying Cost/Mo, Min Profit Target.

### 5b. Repair cost auto-fill
When a repair scope (Light / Mid / Full Gut) is selected AND square footage is entered:
- Auto-calculate the midpoint estimate and populate the Repair Costs field
- Highlight the field in accent green (`#b8ff57` border) to signal it was auto-populated
- Keep the "Use midpoint estimate in calculator" blue text as a reset/re-apply button if user clears the field
- Field remains fully editable — user can override at any time

### 5c. Mobile placeholder visibility
Placeholder/default text in input fields is too bright on mobile — looks like entered data. Fix: ensure placeholder text uses `var(--muted)` color (`#6b6b6b`) clearly distinct from entered values (`var(--text)` = `#f0ede8`). Test on iPhone Safari specifically.

### 5d. Field label improvements
Rename for clarity (apply in both Pro and Beginner modes):
- "HOLD PERIOD" → "HOLD PERIOD (months)" — add unit label
- "BUY CLOSING" → "PURCHASE COSTS %" 
- "SELL CLOSING" → "SALE COSTS %"
- "CARRYING COST/MO" → "MONTHLY HOLD COST"

### 5e. Sale Costs default
Update default from `6%` to `5%` to reflect post-NAR settlement reality. Tooltip in Beginner mode: *"Agent commissions + title fees. Post-2024 this runs 4.5–5.5% — we default to 5% as a safe estimate."*

### 5f. Carrying cost — show total math
Below the Monthly Hold Cost field and Hold Period field, display the calculated total:
`$1,100/mo × 7 mo = $7,700`
Update dynamically as either field changes. Display in `var(--muted)` beneath the fields or inline in the cost breakdown.

### 5g. Save behavior
Current behavior clears notes and inputs after save. Change to:
- After saving: keep all field values and notes intact
- Change Save button to green (`#b8ff57` bg) and relabel "Saved ✓"
- Button reverts to normal state only when user modifies any field (indicating unsaved changes)
- "Clear & New Deal" is the only action that resets everything

### 5h. Clear & New Deal — full reset
Currently only clears below the results line. Fix: reset ALL fields on the page — address, asking price, ARV, repair costs, hold period, cost assumptions, notes, results card. Full blank slate.

### 5i. Install button
Programmatic PWA install requires HTTPS on a real domain — not possible until GitHub Pages is live. Keep the current instructions approach for now. Flag this for Phase 2 when GitHub Pages is set up: implement `beforeinstallprompt` event to trigger native browser install dialog automatically.

---

## 6. UX Fixes — STR / Rental Tab

### 6a. Comma formatting
Same as Fix & Flip — apply comma formatting to all currency fields: Purchase Price, Gross Annual Rent, Taxes + Insurance, Maintenance/yr, Furnishing/Setup.

### 6b. Property Manager — Self-Manage toggle
Replace the static `0%` default with a Self-Manage toggle (mirror Fix & Flip's Self-Renovation toggle pattern):
- Toggle ON (Self-Managing): field locks at 0%, toggle label reads *"Self-Managing — saves 8–12% annually"*
- Toggle OFF: field unlocks, placeholder shows `8` with muted hint *"Typical range: 8–12%"*

### 6c. STR Management Fee — rename and contextualize
Rename: "STR MGMT FEE (Airbnb etc)" → "PLATFORM FEE (Airbnb/VRBO)"
Add muted hint beneath: *"Airbnb charges hosts ~3%; total guest + host fees avg 14–20%. Default 15% is conservative."*
Field remains editable.

### 6d. Gross Annual Rent — show as range
Replace single grayed placeholder (`$55,000`) with a range display pulled from the selected market preset.
Example for Ocean Lakes SC: *"Estimated range: $40,000 – $85,000"*
If user leaves blank and taps Analyze: highlight field red + offer to auto-fill midpoint with one tap.

### 6e. Required field validation
When user taps "Analyze This Deal" with critical fields empty:
- Highlight empty required fields with red border
- Show inline message beneath each: *"Required — [recommended value or range]"*
- Offer a selectable chip to auto-fill with the recommendation (user can then edit)
Required fields: Purchase Price, ARV (Fix & Flip), Gross Annual Rent (STR), Repair Costs (Fix & Flip).

### 6f. Verdict language — clarify metrics
"Strong Play — Clears your 6% target" currently doesn't specify which metric. Update to be explicit:
- *"Strong STR Play — Cash-on-cash return of 7.9% clears your 6% target."*
- Add one-sentence Cap Rate explanation in Beginner mode: *"Cap Rate (8.2%) measures this property's return as if you paid cash — useful for comparing properties regardless of financing."*

### 6g. Down Payment
Add muted hint: *"20% = conventional financing. Hard money lenders may require less — check with your lender."*

---

## 7. Tier Architecture (UI Scaffolding — No Backend Yet)

Design the UI to support monetization tiers. No accounts, no payment processing, no enforcement yet — just the visual scaffolding so it doesn't need to be retrofitted later.

### Market Preset Tiers
| Tier | Markets Available | Label |
|---|---|---|
| Free | 2 (Charlotte NC + Ocean Lakes SC) | Unlocked |
| Tier 1 | 4 markets | "Pro" |
| Tier 2 | 8 markets | "Pro+" |

**Implementation:**
- Display all market preset buttons but lock unavailable ones with a padlock icon and muted styling
- On tap of a locked preset: show an upgrade prompt modal — *"Unlock [Market Name] with Deal Screener Pro. [Upgrade button]"*
- Upgrade button links to a placeholder URL for now (Phase 2 will wire to Stripe/payment)
- Charlotte NC and Ocean Lakes SC remain always unlocked as the free tier anchors

### Guide Tab Tiers
**Free / Beginner content (always visible):**
- What each field means
- How to calculate ARV, MAO, Cap Rate, CoC
- Glossary of all abbreviations
- Basic investing concepts

**Paid content (locked behind Pro tier — show teaser + lock):**
- Market-specific benchmarks tied to selected preset (e.g., Charlotte flip benchmarks, Ocean Lakes STR ranges)
- Current market update intel per market
- Repair cost ranges by region
- "Your Edge" section (currently Aaron-specific — make this user-configurable in Phase 2)

**Implementation:**
- Show a blurred/dimmed preview of locked Guide sections
- Overlay a lock icon + *"Unlock market-specific intel with Deal Screener Pro"*
- Don't remove content — just gate it visually so users can see what they're missing

### Tier Badge
Add a subtle "Free" badge in the app header. When Pro is unlocked (Phase 2), this becomes "Pro" in accent green. Sets the expectation from first launch that tiers exist.

---

## 8. Phase 2 Items — Do Not Build Now

Document these here for awareness. Raise with Aaron before starting any of them.

- **SaaS backend:** Auth, accounts, cloud sync, billing (Stripe). Required for tier enforcement.
- **LTR / BRRR rental types:** Additional tabs in the STR/Rental section. Needs UI design before building.
- **Live market data:** API integration for real-time comp ranges and market updates.
- **Programmatic PWA install:** `beforeinstallprompt` — needs HTTPS/GitHub Pages first.
- **CPC form pre-fill:** Pass deal data as query params to CPC intake form — requires coordination with CPC site.
- **Affiliate links in Guide:** Hard money lender, contractor, AirDNA referral links — Phase 2 revenue layer.
- **White-label config:** Branding customization layer for coaches/team leads.

---

## Verification Checklist (Run Before Handing Back)

**Branding:**
- [ ] CPC horizontal logo renders in header on iPhone Safari
- [ ] PWA icon shows CPC mark (not "D") when installed
- [ ] App title updated in browser tab and home screen

**Get Funding button:**
- [ ] Appears on passing deals only
- [ ] Absent on failing/marginal deals
- [ ] Clipboard copy fires on tap
- [ ] CPC site opens in new tab
- [ ] Toast notification appears

**Geolocation:**
- [ ] Location prompt fires on first launch
- [ ] Does not re-prompt on reload
- [ ] Charlotte, NC (35.2271°N, 80.8431°W) auto-selects Charlotte preset
- [ ] Denied permission falls back gracefully to manual selection

**Beginner/Pro toggle:**
- [ ] Toggle persists across page reload
- [ ] Abbreviations spelled out in Beginner mode on both tabs
- [ ] Helper text appears beneath fields in Beginner mode
- [ ] Pro mode unchanged from Phase 0

**Fix & Flip UX:**
- [ ] Comma formatting works as user types
- [ ] Repair cost auto-fills when scope + sqft entered (green border)
- [ ] Placeholder text clearly muted on iPhone Safari
- [ ] Field labels updated (Hold Period months, Purchase/Sale Costs, Monthly Hold Cost)
- [ ] Carrying cost total math displays correctly and updates dynamically
- [ ] Save button turns green "Saved ✓" and fields/notes persist
- [ ] Clear & New Deal resets every field on the page

**STR UX:**
- [ ] Self-Manage toggle works (mirrors Fix & Flip pattern)
- [ ] Platform Fee renamed and hint text shows
- [ ] Gross Annual Rent shows range from market preset
- [ ] Empty required fields highlight red on Analyze tap with auto-fill offer
- [ ] Verdict language references correct metric explicitly
- [ ] Comma formatting works

**Tier scaffolding:**
- [ ] Locked market presets show padlock and muted styling
- [ ] Tapping locked preset shows upgrade modal
- [ ] "Free" tier badge visible in header
- [ ] Guide locked sections show blurred preview + lock overlay
