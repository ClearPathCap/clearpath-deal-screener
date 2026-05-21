# Deal Screener — Build Spec (Phase 0 + Phase 1)

**Prepared for Claude Code | Last updated: 2026-05-20**
**Decisions made in Cowork session with Aaron Leach**

---

## Context

Deal Screener is a mobile-first PWA for real estate investors, branded under **Clear Path Capital**. The current state is a single-file prototype: `deal-screener-v3.html` (~1,423 lines). This spec covers two phases of work:

- **Phase 0** — Split the single file into proper project structure (no behavior changes)
- **Phase 1** — Add branding, CPC integration, geolocation market conditions, and Beginner/Pro mode

Read `CLAUDE.md` for full conventions before touching anything.

---

## Phase 0 — File Structure Split

**Goal:** Exact behavior preservation. Nothing changes for the user. This is purely a code organization task.

Follow the target structure defined in `CLAUDE.md` exactly. Key points:

- Extract all CSS into `src/css/styles.css`
- Split JS into ES modules per the module map in `CLAUDE.md`
- `public/index.html` is the lean entry point — references CSS and `src/js/main.js` as `type="module"`
- Move the inline PWA manifest to `public/manifest.json`
- Create `public/version.json` → `{ "version": "3.1.0", "released": "2026-05-20" }`
- Move the inline favicon SVG to `public/favicon.svg`
- Keep `deal-screener-v3.html` in `v3-reference/` as the reference until Phase 0 is verified

**Verify Phase 0 before starting Phase 1:** All four tabs work, deal analysis produces correct output, saved deals persist.

---

## Phase 1 — Features

### 1. Clear Path Capital Branding

**Logo assets (already in `/Logo` folder):**
- `clearpath-mark.png` — icon/mark only (green arrow + orbit ring). Use as the PWA app icon, replacing the current "D" placeholder in `manifest.json` and the apple-touch-icon.
- `ClearPath Capital lo.png` — full horizontal logo (transparent background). Display in the app header, replacing or sitting alongside the current "Deal Screener" text logo.

**Header treatment:**
- Replace the current plain text `logo` div with the CPC horizontal logo image
- Keep the app title "Deal Screener" as a subtitle below the logo, smaller weight
- Update `<title>` from "Deal Screener — Charlotte, Lake Murray & STR Markets" to "Deal Screener — Powered by Clear Path Capital"
- Update `apple-mobile-web-app-title` to "Deal Screener"
- Color palette stays as-is (`#0a0a0a` bg, `#b8ff57` accent) — it complements the CPC green

**App icon:**
- Use `clearpath-mark.png` for `icon-192.png` and `icon-512.png` in `public/icons/`
- If the PNG isn't 192×512px natively, resize via canvas or ImageMagick in the shell — do not distort aspect ratio, pad with `#0a0a0a` background

---

### 2. "Get Funding" Button — Clear Path Capital Integration

**Trigger condition:** Show the CTA only when a deal analysis returns a **passing verdict** — i.e., the deal scores as "Good Deal" or "Great Deal" / green-light status. Do not show on marginal or failing deals.

**Button behavior (on tap):**
1. Build a plain-text deal summary string from the current analysis results (address if entered, purchase price, ARV, rehab estimate, projected profit, ROI, verdict)
2. Copy that summary to the clipboard (`navigator.clipboard.writeText(...)`)
3. Open `https://clearpathcapfunding.com/` in a new tab
4. Show a toast notification: *"Deal summary copied — paste into the Notes field on the Clear Path Capital form"*

**Button design:**
- Full-width, below the verdict/results card
- Background: `#b8ff57` (accent green), text: `#0a0a0a`
- Label: "Get Funding — Clear Path Capital" with the `clearpath-mark.png` icon inline (small, ~20px)
- Same tap-target sizing as other primary buttons (min 44px height)

**Module:** Lives in `src/js/clearpath.js` (already planned in CLAUDE.md)

---

### 3. Geolocation-Based Market Conditions

**Approach:** Browser Geolocation API only. No external geocoding API. No network egress beyond Google Fonts. Build a static regional lookup table in JS that maps lat/lng bounding boxes to market presets.

**User flow:**
- On first launch (or when user taps a "Use My Location" button in the market selector), prompt: *"Deal Screener would like to use your location to set local market conditions"*
- On permission granted: get lat/lng, run through the regional lookup table, auto-select the closest matching market preset
- On permission denied: fall back to manual market selection (current behavior), no error state
- Store the user's selected/detected market in `localStorage` so the prompt doesn't fire every session

**Regional lookup table (build in `src/js/markets.js`):**

Map lat/lng bounding boxes to market tiers with adjusted default parameters. At minimum cover these regions with sensible ARV rule adjustments:

| Region | States / Areas | ARV Rule | Notes |
|---|---|---|---|
| Northeast | NY, NJ, CT, MA, RI | 65–70% | High acquisition costs, compressed margins |
| Mid-Atlantic | PA, MD, DE, VA, DC | 68–72% | Mixed urban/suburban |
| Southeast | NC, SC, GA, FL, TN | 70–75% | Current home market, Charlotte/Lake Murray |
| Midwest | OH, IN, IL, MI, WI, MN, MO | 70–75% | Lower price points, stronger margins |
| South Central | TX, OK, AR, LA | 70–75% | Strong investor market, TX especially active |
| Mountain West | CO, UT, AZ, NM, NV | 68–72% | High appreciation, tighter margins |
| Pacific Coast | CA, OR, WA | 60–65% | Very high acquisition costs, tightest margins |
| National Default | Anywhere else | 70% | Safe fallback |

The lookup uses lat/lng to determine which bounding box the user is in, then loads the corresponding market preset. Users can always override manually.

**Note:** Latitude/longitude bounding boxes by state are hardcoded constants — no API call needed.

---

### 4. Beginner / Pro Mode

**Toggle location:** Persistent toggle in the app header or settings area, saved to `localStorage`. Default: **Pro mode** (current experience).

**Beginner mode changes:**

*Labels & terminology — spell out all abbreviations inline:*
- ARV → "ARV (After Repair Value)"
- MAO → "MAO (Maximum Allowable Offer)"
- LTV → "LTV (Loan-to-Value)"
- NOI → "NOI (Net Operating Income)"
- Cap Rate → "Cap Rate (Capitalization Rate)"
- ROI → "ROI (Return on Investment)"
- DSCR → "DSCR (Debt Service Coverage Ratio)"
- GRM → "GRM (Gross Rent Multiplier)"

*Input fields — add helper text beneath each field:*
- Purchase Price: *"The price you'd pay to buy the property"*
- ARV: *"What the property will be worth after all repairs are done"*
- Rehab Estimate: *"Your total budget to fix up the property"*
- Holding Costs: *"Monthly costs while you own it — taxes, insurance, utilities, loan payments"*

*Results — softer, explanatory verdict language:*
- Instead of just "STRONG DEAL ✓", add a one-liner: *"This deal meets the 70% rule and your profit target. Worth pursuing."*
- Instead of just "PASS ✗", add: *"This deal doesn't meet your target margin. The numbers don't work at this price."*

*Guide tab — expanded explanations, less assumed knowledge*

**Pro mode:** No changes from current behavior. Tight, clean, fast.

**Implementation:** A single `isBeginnerMode()` helper in `main.js` that reads localStorage. Modules check this flag when rendering labels and results. Avoid duplicating HTML — use CSS class toggling (`body.beginner-mode`) plus JS to swap label text where needed.

---

## Logo File Notes for Claude Code

```
/Logo/clearpath-mark.png          → PWA icon (192px + 512px variants)
/Logo/ClearPath Capital lo.png    → App header (horizontal logo)
/Logo/Gemini_Generated_Image_...  → Compass variant — hold for now, not used in Phase 1
```

When embedding the header logo in HTML, use a relative path from `public/index.html`: `../Logo/clearpath-mark.png` etc., or copy assets into `public/icons/` during Phase 0 setup.

---

## What Does NOT Change in Phase 0/1

- Color palette (`#0a0a0a`, `#b8ff57`, `#f0ede8`) — unchanged
- All four tabs (Fix & Flip, STR, Pipeline, Guide) — unchanged
- All existing calculations and deal logic — unchanged
- No build tools, no frameworks, no new dependencies
- No service workers
- Charlotte and Lake Murray market presets remain — geolocation adds to them, doesn't replace them

---

## Verify Before Handing Back

After Phase 1 is complete, test against the checklist in `CLAUDE.md`. Additionally verify:

- [ ] CPC logo renders correctly on iPhone Safari (Aaron's primary device)
- [ ] "Get Funding" button appears on a passing deal and is absent on a failing one
- [ ] Clipboard copy + new tab open both fire on the same tap
- [ ] Location prompt fires on first launch, does not repeat on reload
- [ ] Detected market auto-selects correctly (test with Charlotte, NC coordinates: 35.2271° N, 80.8431° W)
- [ ] Beginner/Pro toggle persists across page reload
- [ ] Beginner mode labels render correctly on both Fix & Flip and STR tabs
- [ ] All existing Pipeline/Guide/Share functionality unchanged

---

## CPC Site Access

The Clear Path Capital site code lives on Aaron's computer. Claude Code will be given folder access when integration work on the CPC site itself is needed. For Phase 1, only the Deal Screener app is in scope.

**CPC live URL:** `https://clearpathcapfunding.com/`
**Intake form anchor:** `https://clearpathcapfunding.com/` (deep-link to `#submit` when that anchor is confirmed on the live site)
