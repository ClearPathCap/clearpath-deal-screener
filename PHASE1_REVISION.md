# Deal Screener — Phase 1 Revision Spec

**Prepared for Claude Code | Created: 2026-05-25**
**This document supersedes PHASE1_ADDENDUM.md. Build from this file only.**

Read `CLAUDE.md` and `MASTER_TRACKER.md` before starting. Work through items top to bottom.

---

## 1. Logo — Use Correct Asset

The app is currently rendering the wrong logo file. Switch to the correct one everywhere.

**Correct file:** `Logo/clearpath-mark.png` (3D green arrow + silver orbit ring)
**Wrong file (do not use):** `Logo/Gemini_Generated_Image_qu3a8rqu3a8rqu3a (2).png`

Apply to:
- App header icon (small, left of "DEAL SCREENER" text)
- PWA icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable.png`
- Get Funding button inline icon (~20px)

When rendering `clearpath-mark.png` on the green Get Funding button (`#b8ff57` background), set the icon container background to `#b8ff57` explicitly in CSS to prevent any transparency artifacts from showing.

---

## 2. Header Overlap — Fix Content Offset

The fixed header is sitting on top of scrollable content. Fix: measure the header's rendered height and apply matching `padding-top` to the content container so content begins below the header, not under it.

---

## 3. Header — Three-Tier Badge

The header currently shows only "STARTER" and "PRO". Update to reflect all three tiers: **STARTER**, **INVESTOR**, **PRO**.

The tier badge should remain tappable and open the upgrade/tier comparison modal (per existing addendum spec, Section 6).

---

## 4. Get Funding Button — Text Fix

The button label text is rendering distorted. Verify font weight, size, and letter-spacing on the `#b8ff57` background and correct so it renders cleanly. Label: `Get Funding — Clear Path Capital`

---

## 5. First Launch — Primary Market Selection (Full Redesign)

Replace the current flat pill-grid modal with a 3-step drill-down flow.

### Step 1 — Major Region
Display a list of major regions:
- Southeast
- Midwest
- South Central
- Mountain West
- Pacific Coast
- Northeast

User taps a region to proceed.

### Step 2 — State
Display states within the selected region, alphabetical order. Only show states that have markets in the data.

### Step 3 — Local Market
Display available markets within the selected state.

### Modal copy
- Headline: **"Choose Your Primary Market"** (not "Home Markets")
- Subtext: *"Pick the region where you invest most."*
- Remove the "(you can change this later once every 30 days)" line entirely
- "Continue" button activates only when a market is selected

### Storage
- Save selection to `localStorage` as `primaryMarket: "charlotte-nc"`
- Save date as `marketSelectedDate`

### Reusable picker
Build this 3-step drill-down as a reusable component. It is used in two places:
1. First launch (primary market selection)
2. In-app when user taps the Region 2 slot to add their second market

---

## 6. Market Region Slots — Display & Behavior

After first launch, both Fix & Flip and Rentals tabs display market slots as follows (example with Charlotte NC selected):

```
[Charlotte NC]  [Region 2]  [🔒 Region 3]  [🔒 Region 4]  [🔒 Region 5]  [🔒 Region 6]
```

### Slot behavior
- **Slot 1** (primary): Shows selected market name, active/highlighted
- **Slot 2** (Region 2): Unlocked, tappable — opens the reusable 3-step picker. No popup or warning when adding for the first time.
- **Slots 3–6**: Locked. Tapping opens the upgrade modal. Investor unlocks to slot 4, Pro unlocks all 6.

### Unified markets
Fix & Flip and Rentals share the same market selection. One set of regions applies across the entire app. There is no separate market selection per tab.

### Label fix
Rename "MARKET PRESET" to **"MARKET REGIONS"** everywhere it appears.

### Changing a region (confirmation popup)
When a user taps an already-selected slot to change it (not adding for the first time), show a confirmation popup before opening the picker:

- **Starter:** *"Changing a Market Region locks that slot for 30 days. Your next change will be available on [calculated date]. Continue?"* | Confirm | Cancel
- **Investor:** Same message, 14 days
- **Pro:** No confirmation — change fires immediately, no restrictions

Adding Region 2 for the first time does NOT trigger this popup — it is treated as completing initial setup, not a change.

---

## 7. Rentals Sub-Tabs — Phase 2 Labels

Long-Term and BRRR sub-tabs should NOT use the upgrade lock icon (🔒). They are unbuilt features, not paid upgrades. Replace lock icon with a "Phase 2" label:

- `Long-Term` → `Long-Term · Phase 2` (muted, non-tappable)
- `BRRR` → `BRRR · Phase 2` (muted, non-tappable)

BRRR remains its own separate tab — do not fold into Long-Term.

---

## 8. Repair Cost Estimator — Guide Mode Expanded Descriptions

When Guide toggle is ON, expand each scope card with a detailed description. When Guide is OFF, keep current brief text.

**Light ($12–22/sf) — Guide ON:**
Interior paint throughout, LVP or carpet flooring, light fixture replacements, vanity/toilet/mirror swaps, kitchen hardware, door hardware, minor drywall patches, basic landscaping and curb appeal.

**Mid ($28–48/sf) — Guide ON:**
Full kitchen cabinet and countertop replacement, bathroom tile and tub/shower overhaul, HVAC system replacement, window replacement throughout, electrical panel update, plumbing fixture upgrades — plus everything in the Light category.

**Full Gut ($60–95/sf) — Guide ON:**
Complete interior demo, structural repairs and reframing, full electrical rewire, plumbing rough-in, new HVAC from scratch, insulation and new drywall, roof replacement, possible foundation work — plus everything in the Mid category.

---

## 9. Self-Renovating Toggle — Full Calculation Fix

When the Self-Renovating toggle fires, if the Repair Costs field was populated via the midpoint estimate, recalculate using the correct rate range and re-run the full analysis.

**Rate ranges:**
| Scope | Self-Perform | Hired Out |
|---|---|---|
| Light | $12–22/sf | $18–35/sf |
| Mid | $28–48/sf | $42–70/sf |
| Full Gut | $60–95/sf | $90–130/sf |

The midpoint of the active range populates the Repair Costs field. All downstream metrics (Net Profit, ROI, LTV, Max Offer, Cost Breakdown) recalculate from the updated value.

**If the user manually entered a repair cost** (did not use "Use midpoint estimate"), the toggle does NOT override their number.

Track whether the field was auto-populated with a flag (`repairCostAutoFilled: true/false`).

---

## 10. Total Hold Cost — Move and Label

The `$900/mo × 5 mo = $4,500` calculation row currently floats between Repair Costs and Cost Assumptions with no label. Fix:

- Move it to the **bottom of the Cost Assumptions section**, below Monthly Hold Cost and Min Profit Target
- Add the label **"TOTAL HOLD COST"** above the calculation row
- Continue updating dynamically as Monthly Hold Cost or Hold Period changes

---

## 11. Cost Breakdown — Label Renames

In the Fix & Flip results Cost Breakdown section, update line item labels to match the renamed input fields:

- "Buy closing (X%)" → **"Purchase costs (X%)"**
- "Sell closing (X%)" → **"Sale costs (X%)"**

---

## 12. Occupancy Rate — Guide Mode Helper Text

When Guide toggle is ON, display below the Occupancy Rate field:

*"The percentage of nights your property is booked over a year. A 62% rate means roughly 226 nights booked. STR markets typically run 55–75% — higher in peak tourist areas, lower in seasonal markets. Your gross rent estimate assumes this rate."*

(The nights-booked figure should calculate dynamically: `Math.round(occupancyRate / 100 * 365)`)

---

## 13. Property Manager — Default Value Bug

When the "Hired Property Manager" toggle is OFF (meaning they hired a manager), the field is showing 3% instead of the correct default of 8%.

Fix: when toggle is OFF (hired), default to `8` with hint text: *"Typical range: 8–12%"*. When toggle is ON (self-managing), lock field at `0`.

---

## 14. Interest Rate Field — Rentals Tab

Add a visible, editable **Interest Rate %** field to the Rentals tab (under Annual Expenses or Cost Assumptions section). Default: `6.75`.

The debt service calculation uses this field instead of a hardcoded assumption.

**Guide mode helper text:**
*"Your rate significantly impacts cash flow. Conventional loans run 7–8%. Private money lenders can offer more flexible terms."* — followed by a tappable link: **"Check with Clear Path Capital"** → opens `https://clearpathcapfunding.com/` in a new tab.

---

## 15. Pipeline — Quick Delete Trash Icon

Add a trash icon (🗑) to each deal card in the collapsed (unexpanded) view.

- Position: right side of card, alongside the verdict badge and expand chevron
- Tapping the trash icon triggers the existing deletion confirmation warning before permanently deleting
- The deal does not need to be expanded to be deleted

---

## 16. Pipeline — "STR mgmt fee" Label Fix

In the expanded deal view for STR deals, the Property & Inputs section shows "STR mgmt fee". Update to **"Platform fee (Airbnb/VRBO)"** to match the renamed field label.

---

## 17. Pipeline — Filter Rename

Rename the "Hot Only" filter chip to **"Strong Deals Only"**.

---

## 18. Share Button Icon

Replace the current connected-dots/network share icon with the standard iOS-style share icon (box with upward arrow). Apply consistently across all tabs that have a share button.

---

## 19. Tier Rename — Verify Completeness

The tier rename (Free/Beginner → Starter, Pro toggle → Investor, Pro tier → Pro) was partially applied in the previous build. Audit and verify every location:

- [ ] Header tier badge: STARTER | INVESTOR | PRO (not STARTER | PRO)
- [ ] All upgrade modals reference correct tier names
- [ ] Guide lock overlays reference correct tier names
- [ ] Market slot lock prompts reference correct tier names
- [ ] Dev mode tier switcher: `setTier('starter')`, `setTier('investor')`, `setTier('pro')`
- [ ] CPC button label/toast per tier (Starter/Investor/Pro as specced in addendum Section 13)

---

## Verification Checklist

**Logo & branding:**
- [ ] `clearpath-mark.png` renders in header — NOT the Gemini compass variant
- [ ] PWA icons updated to clearpath-mark
- [ ] Get Funding button icon renders clean on green background (no checkered artifact)
- [ ] Get Funding button text renders cleanly (no distortion)

**Header & navigation:**
- [ ] Header no longer overlaps scrollable content
- [ ] Three-tier badge shows STARTER | INVESTOR | PRO
- [ ] Share icon updated to iOS-style arrow on all tabs

**First launch & market regions:**
- [ ] 3-step drill-down fires on first launch (clear localStorage to test)
- [ ] Headline reads "Choose Your Primary Market"
- [ ] No 30-day subtext on first launch modal
- [ ] One market selected → stored as primaryMarket
- [ ] Region 2 slot visible after launch, tappable, opens same 3-step picker
- [ ] Regions 3–6 locked with upgrade prompt
- [ ] Fix & Flip and Rentals show identical market slots
- [ ] "MARKET REGIONS" label (not "MARKET PRESET") on both tabs
- [ ] Changing an existing region shows cooldown confirmation popup
- [ ] Adding Region 2 for the first time shows NO popup
- [ ] Starter cooldown: 30 days | Investor: 14 days | Pro: none

**Rentals tab:**
- [ ] Long-Term and BRRR show "Phase 2" label, not upgrade lock icon
- [ ] Property Manager defaults to 8% when toggle is OFF (hired)
- [ ] Occupancy Rate shows guide text when Guide is ON
- [ ] Interest Rate field present and editable (default 6.75%)
- [ ] Debt service in breakdown calculates from the Interest Rate field
- [ ] "Check with Clear Path Capital" link in guide text opens CPC site

**Fix & Flip tab:**
- [ ] Self-Renovating toggle recalculates repair costs and reruns full analysis
- [ ] Self-perform vs hired ranges are correct per scope
- [ ] Manually entered repair costs are NOT overridden by toggle
- [ ] Total Hold Cost labeled and moved to bottom of Cost Assumptions
- [ ] Cost breakdown: "Purchase costs" and "Sale costs" (not Buy/Sell closing)
- [ ] Repair scope Guide mode shows expanded descriptions for all three levels

**Pipeline:**
- [ ] Trash icon visible on collapsed deal cards
- [ ] Trash icon triggers confirmation before delete
- [ ] "Strong Deals Only" filter (not "Hot Only")
- [ ] STR expanded view shows "Platform fee (Airbnb/VRBO)" (not "STR mgmt fee")
- [ ] Get Funding button appears in expanded view on passing deals

**Tier naming audit:**
- [ ] All three tiers named correctly everywhere
- [ ] Dev mode setTier() works for all three tiers
