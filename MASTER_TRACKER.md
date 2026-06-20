# Deal Screener — Master Tracker

**Single source of truth. All other spec files are superseded by this document.**
**Last updated: 2026-06-12 (Cowork audit pass — folded in Revisions 1–6b, markets integration, 6/12 decisions)**

---

## Project Identity

**App name:** Deal Screener — Powered by Clear Path Capital
**Owner:** Aaron Leach (A-Aron)
**Business:** Clear Path Capital (CPC) — private money brokering via Aspire lender network
**CPC website:** https://clearpathcapfunding.com/
**Deployment target:** GitHub Pages (not yet set up — see GITHUB_PAGES_RUNBOOK.md)
**Local dev:** VS Code + Live Server (or `python -m http.server` from `/docs`)
**⚠ App folder is `docs/` (GH Pages convention) — any older reference to `public/` is stale.**

---

## Strategic Foundation

### Primary Purpose (hidden from users)
Funnel qualifying real estate deals to Clear Path Capital. Every "Get Funding" submission is a lead for Aaron's private money brokering business. One closed loan = commission.

### User Experience (what users feel)
A fast, professional deal analysis tool they can use in the field. The funding option feels like a natural next step, not a sales pitch. Users don't need to know CPC benefits — they just get genuine value from the analyzer.

### Why This Works
Beginners are the volume play AND the best CPC leads. Experienced investors have lender relationships. Beginners don't — they need CPC. Beginner-friendly UX + CPC integration = the funnel.

### Product Relationship
- **Deal Screener** = top-of-funnel (quick field calculator, lead magnet)
- **CPC website** = conversion layer (deal submission, funding intake)
- **"Get Funding" button** = the bridge between them
- Keep them separate. Do not merge into one site.

---

## Tier Structure

### Starter (Free)
- 2 user-selected Market Regions (chosen at first launch, locked 30 days)
- Basic Field Guide: field explanations, glossary, formulas, investing basics
- Up to 10 pipeline saves
- CPC funding button on qualifying deals (standard priority submission)
- Cannot share pipeline

### Investor (Paid — price TBD)
- 4 Market Regions (user's choice, no lock)
- Full Field Guide with market-specific intel for selected regions
- Unlimited pipeline saves
- Deal export — formatted shareable deal summary
- One-way pipeline sharing → can share to Starter users (Starter cannot share back)
- CPC funding button — Priority Review submission
- Toast: *"Your submission will receive priority review from Clear Path Capital."*

### Pro (Paid — price TBD, higher than Investor)
- 6 Market Regions (user's choice, no lock)
- Full Field Guide with intel for all selected regions
- Unlimited everything
- Deal export + pipeline sharing to Investor and Starter users
- Dedicated Clear Path Capital private money lender (fiduciary, best terms, dozens of lenders)
- CPC funding button — Dedicated Broker submission
- Toast: *"Your dedicated Clear Path Capital private money lender will follow up directly."*

### CPC Priority Messaging (all tiers get funding button, priority differs)
Deal summary clipboard text includes tier tag:
- Starter: `[Starter Submission]`
- Investor: `[Investor — Priority Review]`
- Pro: `[Pro — Dedicated Broker Requested]`

---

## Tab Structure

| Tab | Status |
|---|---|
| Fix & Flip | Built |
| Rentals | Built (was "STR / Rental" — renamed) |
| Pipeline | Built |
| Guide | Built |

**Rentals tab sub-categories:**
- STR (Short-Term Rental) — active
- Long-Term Rental — **spec ready (`SPEC_LTR_ANALYZER.md`), next build.** DSCR funnel into CPC's rental-loan product. Builds as a "Short-Term | Long-Term" sub-toggle under Rentals (D6).
- BRRR — **spec ready (`SPEC_BRRR_ANALYZER.md`), build after LTR.** Two-phase (bridge acquisition → DSCR cash-out refi); shares LTR's income/DSCR engine. Third toggle under Rentals.

---

## Market Regions

**Term:** "Market Regions" (not presets, not zones)

**Free Starter:** 2 regions, user-selected at first launch, 30-day change lock
**Investor:** 4 regions, no lock
**Pro:** 6 regions, no lock
**Custom market:** Deferred — hold until data source is confirmed (see Pending)

### First Launch Flow
Modal fires on first launch (tracked via `localStorage: hasSelectedMarkets`).
User picks exactly 2 from the full list before entering the app.
Stores: `selectedMarkets[]` + `marketSelectedDate` for lock enforcement.

### Full Market List (29 markets — benchmarks being researched via GPT)

**Fix & Flip:**
Charlotte NC, Atlanta GA, Dallas TX, Phoenix AZ, Tampa FL, Nashville TN,
Indianapolis IN, Columbus OH, Kansas City MO, Memphis TN, Jacksonville FL,
San Antonio TX, Birmingham AL

**STR:**
Ocean Lakes SC (Myrtle Beach), Gatlinburg TN, Pigeon Forge TN, Lake Murray SC,
Destin FL, Blue Ridge GA, Outer Banks NC, Hilton Head SC, Gulf Shores AL, Branson MO,
Scottsdale AZ, Park City UT, Lake Tahoe NV, Smoky Mountains TN, Sevierville TN,
Nashville TN (STR)

**Data status:** ✅ GPT benchmarking complete. Source: `Market Data/market_benchmarks_2026.xlsx`. Formatted ES module: `Market Data/markets_data.js` — ready for Code to integrate into `public/src/js/markets.js` after Phase 1 Addendum review.

---

## Branding

**Logo assets (in `/Logo` folder):**
- `clearpath-mark.png` — preferred app icon (simpler mark, green arrow + orbit ring). Use for PWA icon (192 + 512px), app header icon.
- `ClearPath Capital lo.png` — full horizontal logo. Use in page header alongside "Deal Screener" subtitle.
- `Gemini_Generated_Image_...` — compass variant. Hold, not in use.

**Color palette (do not change):**
- Background: `#0a0a0a`
- Accent: `#b8ff57`
- Text: `#f0ede8`
- Fonts: Syne (display), DM Mono (numbers)

---

## Build Status

### ✅ Complete
- Phase 0: File structure split (single HTML → proper module structure)
- Phase 1 original: CPC branding, Get Funding button, geolocation, Beginner/Pro mode, all UX fixes (Fix & Flip + STR)
- **Phase 1 Addendum + Revisions 1–6** (committed through Jun 4; independently QA'd by Cowork 6/12 — see QA_PHASE1_ADDENDUM_REPORT.md): tiers Starter/Investor/Pro, first-launch market picker, slot cooldowns 30/14/0, upgrade modals, Guide toggle mirroring, dev testing mode (`setTier()`), CPC priority tier messaging
- **Markets integration** — DONE (verified 6/12: `docs/src/js/markets.js` byte-identical to `Market Data/markets_data.js`; 204 market ids, FLIP/STR/LTR + BRRR_ASSUMPTIONS live in picker)

### ✅ 2026-06-12 evening: SPEC_THEME_AND_FUNDING built by Code (76b319a) and VERIFIED by full live walkthrough
Green theme live, funding bridge live, 15-deal walkthrough across all 3 tiers, 6 live CPC submissions verified in HubSpot (source-tagged) + borrower emails delivered. Logo decision: keep ChatGPT mark (A-Aron + eyes-on comparison agree); lime stays on Hot Deal verdict. See WALKTHROUGH_REPORT_2026-06-12.md.

### ⏳ Pending — Pre-Phase 2 (in order)
1. **Hand SPEC_PHASE1D_FIXES.md to Claude Code** — 9 screener fixes (STR label HIGH, funding gate HIGH, upgrade-pitch rewrite HIGH, region-keyed Guide intel HIGH, plus 5 smaller) + 3 CPC-site fixes (submit timeout HIGH)
2. **A-Aron: verify deals@ inbox** — 7 test intake emails: tier tags in body, ⚠ LICENSING REVIEW flag on the Destin FL submission
3. **Test-data purge** (after review) — HubSpot 6 contacts + 7 deals (search "screenertest"; one Brookdale dupe), Gmail aliases, deals@ copies. Cowork can run it on request.
4. **Tier follow-up SLAs in HubSpot** — 3 templates + task SLAs (Pro 4h+booking link / Investor same-day / Starter 24h) to make tier promises real (drafts in walkthrough report)
5. **GitHub Pages deploy** — GITHUB_PAGES_RUNBOOK.md (~20 min; gitignore strategy docs before public push)
6. **Chase AMP TPO approval** — P3-type DSCR/STR files have no home until it lands; LoanBidz fallback meanwhile
7. TrueDataPro API investigation — market-level benchmarks?
8. Stripe (Phase 2) — only after auth/backend (TIER_STRATEGY gap #1)

### 📋 Phase 2 (do not build yet)
- Full SaaS backend: user accounts, auth, subscription status, tier enforcement
- Stripe payment integration: monthly subscriptions for Investor and Pro
- Funding/loan analysis section: lender's view of the deal (loan range, LTV, cash to close, misc charges) — appears above cost breakdown in Fix & Flip and Rentals. Carries into Pipeline.
- Long-Term Rental analyzer (sub-tab under Rentals)
- BRRR analyzer (sub-tab under Rentals)
- Affiliate links in Guide tab (hard money / private money lenders, AirDNA, contractors, REI insurance)
- White-label version for RE coaches/team leads ($500–2,000/branded version)
- Pipeline sharing (one-way: Investor → Starter)
- Deal export (formatted PDF or shareable link)
- Custom Market Region for Pro (needs data source — TrueDataPro or similar)
- Programmatic PWA install prompt (needs HTTPS/GitHub Pages)
- CPC form pre-fill via query params (needs coordination with CPC site)

---

## Key Decisions Log

| Decision | Choice | Notes |
|---|---|---|
| Build tool | Claude Code | Cowork = strategy/specs only |
| Deployment | GitHub Pages | Serving from `/public` |
| Framework | None | Vanilla JS ES modules, no build step |
| CPC integration style | Hidden funnel | Tool feels like analyzer, funding is natural next step |
| Tier names | Starter / Investor / Pro | Not Beginner/Free/Pro |
| Market terminology | Market Regions | Not presets or zones |
| Free markets | 2, user-selected at launch | 30-day change lock |
| App icon | clearpath-mark.png (simple mark) | Not the full wordmark |
| Platform fee default | 3% | Was 15% — corrected |
| Sale costs default | 5% | Reflects post-NAR settlement reality |
| "Hard money lenders" | → "private money lenders" | Reference Clear Path Capital |
| Tab rename | STR/Rental → Rentals | STR is sub-category |
| Custom market | Deferred | No data source yet |
| Payment approach | Monthly subscriptions | Stripe, do it right not fast |
| Payments timeline | Phase 2 | After GitHub Pages and backend |
| Sharing mechanic | One-way: Investor → Starter | Starter cannot share back |
| Guide for Starter | Partial access | Basics unlocked, market intel locked |
| Guide toggle | Global (mirrors both tabs) | One toggle affects Fix & Flip + Rentals |
| LTR analyzer | Promoted from Phase 2 → next build | DSCR borrower had no home in the tool; DSCR is the core CPC rental product. Spec: `SPEC_LTR_ANALYZER.md` |
| LTR default down payment | 20% (not 25%) | Matches what investors model; bigger loan clears the $150K CPC min more often; sits at the LTV≤80% gate. 25% surfaced as a "best DSCR pricing" tip only |
| LTR funnel gate | loan $150K–$5M AND LTV ≤ 80% AND DSCR ≥ 1.0 | DSCR is LTV/DSCR-underwritten, NOT the flip ARV/LTC box — needs a separate `qualifiesForCpcLtr` in funding.js |
| LTR NOI definition | Excludes CapEx reserve (deducted below NOI) | Keeps cap rate + DSCR comparable to lender numbers; cash flow/CoC still net of reserves |
| LTR navigation | Sub-toggle under Rentals (STR \| Long-Term) | Honors locked Rentals-tab design; keeps mobile nav uncluttered |
| LTR CPC purpose | `purpose=dscr` → "DSCR / Rental Hold" | Standardized to `dscr` after live QA (was `rental_ltr`); CPC must add inbound mapping — see QA report |
| BRRR analyzer | Spec ready, build after LTR | Two-phase bridge→DSCR refi; shares LTR income engine (build `incomeBlock()` once); dual CPC funnel |
| BRRR CPC purpose/exit | `purpose=brrr` → "DSCR / Rental Hold", `exit=brrr` → "BRRRR" | CPC options exist live but unmapped inbound — Code wires both sides |
| CPC QA (2026-06-17) | Flip pre-fill PASS; DSCR/BRRR FAIL | CPC snapshot hardwired to flip box (90% cost/70% ARV); needs income/LTV snapshot mode + token mapping. $500 loan-rounding false-flag on flip (minor) |
| **CPC loan minimum $150K → $50K** (2026-06-18) | Lower the box floor | Applies everywhere: CPC site box copy, deal-fit logic, screener `qualifiesForCpc*`, LTR/BRRR funnel gates, CPC_INTEGRATION_SPEC. License-required states → refer out (nationwide otherwise) |
| **No upper loan cap** (2026-06-18) | Remove the $5M ceiling; keep $50K floor | "Cap low, not high." Large deals still qualify (optionally route >$Xm to priority team). Update `qualifiesForCpc*` (drop `loan > 5000000`), CPC box copy → "$50K+" |
| **Absolute-$ profit in verdicts** (2026-06-18) | Don't let low % alone kill a high-dollar deal | A-Aron: a $60K flip is a good deal even if ROI% is modest on a big purchase. Weight absolute net profit (the user's $ target) as a primary HOT driver, ROI as secondary. Exact thresholds = open decision |
| LTR Golden Test B corrected | WARM (not HOT) | Code's catch: §2 formula yields CoC ≈6.84% → WARM (DSCR 1.41). Spec prose "HOT" was an estimate slip. Added Test B2 as a true HOT case (price 230K) |
| LTR premium server-seed | Do the Supabase migration | Bundle leak closed (ltrNote/sourceUrl stripped), but notes now show for NO ONE until seeded into market_premium for get_market_intel (Pro/Investor). Approved to build |
| CPC UAT live test (2026-06-18) | 3 deals submitted end-to-end | See CPC-PMB `UAT_CPC_EndToEnd_Test_Plan`. Findings: 🔴 Estimated Closing Date is REQUIRED + fails submit SILENTLY (make optional + show errors); DSCR snapshot uses flip box (LTV 0%); no $ minimum enforced; Quick-Action link encoding bug; CRM auto-creates contact+deal but into DEFAULT pipeline/"appointmentscheduled" not a CPC stage; no lender template (per-program needed) |
| **B3 — One hardened parser** (2026-06-19) | Strip $/spaces/dashes in `format.js`; add `parseNumOpt` (undefined on blank) | Live `parseComma` only stripped commas → "$425,000" = 0; flip was vulnerable too. Can't reuse parseComma in ltr/brrr (its 0-on-blank kills finance.js defaults), so we harden the shared stripper + add an optional variant. |
| **B2 — Validate before compute** (2026-06-19) | Pure `validateInputs(type,raw)` in finance.js; analyzers render inline errors + abort | Out-of-range inputs (150% down, −5% rate, vacancy>100, refiLtv 150, loan>cost) reached the funnel as "HOT." Reject (not silent-clamp) so the user sees the typo. Hard rule: no out-of-range input grades HOT. |
| **B1 — Funnel never blanks on hot/warm** (2026-06-19) | Replace `… ? underBoxHTML : ''` with `outsideBoxHTML(type,deal)` at BOTH call sites | A qualifying all-cash/high-LTV hot/warm deal rendered an empty funding area — verdict said "Lender-Ready" with no path to act. Pipeline card had the same bug; both fixed. |
| **B5 — DSCR ≥ 1.0 is never COLD** (2026-06-19) | COLD only for DSCR<1.0 or NOI<debt service; DSCR≥1.0 + CF-negative-after-reserve → WARM "Covers Debt — Thin After Reserves" | CapEx reserve alone was flipping fundable deals to "Negative Leverage — Walk," suppressing the button on deals CPC would fund. Aligns the verdict bar with the funnel gate (≥1.0). MoS-tile interaction (B5-MoS) left to a separate A-Aron decision. |
| **B4 — "$50K+, no upper cap"** (2026-06-19) | CPC site copy only; screener already clean | Only `$5M` strings in the screener are code comments. B4 is a clearpathcapfunding.com edit (not in this repo) → Cowork. |
| **B6 — No guarantee/loan-benefit copy** (2026-06-19) | B6a index.html copy DONE by Code this pass (lines 286/859/946/959/960); B6b Investor "Priority Review" tier label (clearpath.js getTierConfig) HELD pending A-Aron compliance call | Paid tiers must buy app features, never loan priority/terms. "Priority Review"/"first look"/"highest-priority funding" reframed to app value. The JS tier label needs A-Aron's sign-off before edit (left exactly as-is). |
| **Fold-in (2026-06-19)** | Added 2 post-compute plausibility warnings (DSCR>3, cap>20%) + HOT/Tight clarity (#9) to the ship-blocker pass | Serves new-investor confidence — stop bad-deal-as-HOT and good-deal-as-false-COLD. |
| **B2-STR — validate STR too** (2026-06-19, cleanup) | Added a `'str'` branch to `validateInputs` + wired `rental.js` (pre-compute abort + post-compute soft warnings) | STR was left out of the B2 pass — garbage (150% down/occ, neg rate/revenue) could still grade "Strong STR Play." Now blocks before compute; STR already uses the hardened parseComma (B3); #9 is N/A (STR has no Margin-of-Safety tile). |
| **B5-MoS decision = Option A** (2026-06-19, cleanup) | Ship as-is: WARM "Covers Debt — Thin After Reserves" paired with a "Fails" MoS tile is intentional | Honest — covers debt at base case, fails the stress test. No softening. |
| **B6b decision = neutral funding CTA** (2026-06-19, cleanup) | All tiers → label "Get Funding — Clear Path Capital"; tier tracked only in the tag (`[Starter/Investor/Pro Submission]`) + the `tier` URL param | Removed "Priority Review" (Investor) and "Dedicated Broker / your dedicated broker will follow up" (Pro) from the user-facing CTA/tag/toast. Paid tiers buy app features, never loan priority/terms. Clipboard "Summary also copied as backup" stays (accurate). |
| **[CPC site — Cowork] loan-size copy** | `$50K–$5M+` (no hard `$5M` contradiction) | Screener already clean ($50K+, no cap). CPC site (separate repo) to align. |
| **[CPC site — Cowork] external copy** | Effort/process framing, never "guaranteed terms" | Broker, not lender. Screener `index.html` 859 already softened to process framing ("shop your scenario to lenders; you don't call lenders, they do"). |
| **CPC-site + live round-trip = separate gate** | Not in this repo; live-UAT handled separately | CPC form → DSCR snapshot → borrower/internal email + HubSpot round-trip, then deploy — outside this screener repo. |

---

## Workflow Rules

- **Cowork** = strategy, decisions, specs, this document
- **Claude Code** = all file writing and code changes
- **Spec handoff** = Cowork writes spec → Aaron passes to Code with "Read [filename] and build it"
- **Review cycle** = Aaron tests → brings screenshots/feedback to Cowork → Cowork writes next spec → Code builds
- Never send Code a prompt based on Cowork's suggestion without reviewing it first

---

## Files in Project

| File | Purpose | Status |
|---|---|---|
| MASTER_TRACKER.md | This file — single source of truth | Active |
| CLAUDE.md | Code conventions, file structure rules | Active |
| PROJECT_BRIEF.md | Business and product context | Reference |
| ROADMAP.md | Original phased task list | Superseded by this tracker |
| BUILD_SPEC.md | Original Phase 0+1 spec | Superseded |
| PHASE1_SPEC.md | Phase 1 UX fixes spec | Superseded |
| PHASE1_ADDENDUM.md + PHASE1_REVISION1–6b | Phase 1 addendum + revision specs | Complete/superseded — QA'd 6/12 |
| QA_PHASE1_ADDENDUM_REPORT.md | Cowork independent build audit (6/12) | Active — read first |
| SPEC_THEME_AND_FUNDING.md | Next Code handoff: cleanup + green theme + funding bridge | **Ready to hand off** |
| SPEC_LTR_ANALYZER.md | Long-Term Rental analyzer — inputs, formulas, thresholds, DSCR funnel, tests | **Ready to hand off** |
| SPEC_BRRR_ANALYZER.md | BRRR analyzer — two-phase (bridge→DSCR refi), shares LTR income engine, tests | **Ready to hand off (build after LTR)** |
| QA_CPC_INTEGRATION_2026-06-17.md | Live QA: flip pre-fill PASS; DSCR/BRRR purpose mapping + income snapshot FAIL | **Active — Code must fix CPC side before LTR/BRRR funnels work** |
| CPC_INTEGRATION_SPEC.md | Query-param contract with CPC site (CPC side live) | Active contract — needs `dscr`/`brrr` purpose, `hold`/`brrr` exit, + `ltv`/`dscr` params added (see QA) |
| TIER_STRATEGY.md | Pricing framework ($14/$29), auth gap analysis | Active strategy |
| GITHUB_PAGES_RUNBOOK.md | Deploy steps for A-Aron | Ready — run after spec build |
| Logo/ | CPC brand assets | Active (canonical mark decision pending) |
| docs/ | Built app files (GH Pages serving folder) | Active |
| v3-reference/ | Original single-file prototype | Reference only |
