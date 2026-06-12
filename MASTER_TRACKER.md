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
- Long-Term Rental — Phase 2 placeholder (locked)
- BRRR — Phase 2 placeholder (locked)

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

### ⏳ Pending — Pre-Phase 2 (in order)
1. **A-Aron decision: canonical logo mark** — ChatGPT mark (currently deployed) vs `clearpath-mark-transparent.png` (Rev 6b + integration spec say this). See QA report Defect 3. Check the box in SPEC_THEME_AND_FUNDING.md Part 0.
2. **Hand SPEC_THEME_AND_FUNDING.md to Claude Code** — fixes PWA icon defect + uncommitted repo state (QA Defects 1–2), swaps lime→CPC green `#22c55e`, builds `funding.js` CPC pre-fill bridge per CPC_INTEGRATION_SPEC.md (CPC site side already live)
3. **A-Aron 10-min spot check** — first-launch picker, `setTier()`, upgrade modal, Get Funding URL pre-fill (test list at end of QA report / spec Part 2)
4. **GitHub Pages deploy** — follow GITHUB_PAGES_RUNBOOK.md (~20 min, incl. gitignore for strategy docs before public push)
5. TrueDataPro API investigation — does it expose market-level benchmarks? If yes, changes hardcoded data approach
6. Stripe account setup (Aaron) — Phase 2, only after auth/backend decision (see TIER_STRATEGY.md gap #1: localStorage tiers MUST move to real auth before charging)

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
| CPC_INTEGRATION_SPEC.md | Query-param contract with CPC site (CPC side live) | Active contract |
| TIER_STRATEGY.md | Pricing framework ($14/$29), auth gap analysis | Active strategy |
| GITHUB_PAGES_RUNBOOK.md | Deploy steps for A-Aron | Ready — run after spec build |
| Logo/ | CPC brand assets | Active (canonical mark decision pending) |
| docs/ | Built app files (GH Pages serving folder) | Active |
| v3-reference/ | Original single-file prototype | Reference only |
