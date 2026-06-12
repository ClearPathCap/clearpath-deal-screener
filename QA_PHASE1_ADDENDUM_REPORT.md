# QA Report — Phase 1 Addendum + Revisions Build Audit
*Cowork independent code audit, 2026-06-12. Method: read actual code in `docs/`, verified against PHASE1_ADDENDUM.md + Revisions 1–6b. Not based on Code's self-reports.*

## Verdict: build is ~95% done and solid. 2 real defects, 1 decision needed, repo needs a commit.

## ✅ Verified passing (code evidence)

| Item | Evidence |
|---|---|
| Tier system Starter/Investor/Pro | `tiers.js` — getActiveTier(), validation list `['starter','investor','pro']` |
| Market slots 2/4/6 per tier | `tiers.js` getUnlockedSlotCount() returns 2/4/6 |
| Slot change locks 30/14/0 days | `tiers.js` getSlotCooldownDays() — starter 30, investor 14, pro 0 |
| First-launch market picker | `index.html` #modal-market-picker; `tiers.js` completePrimarySelection() sets hasSelectedMarkets + marketSelectedDate |
| localStorage migrations | `tiers.js` migrateMarketStorage() — old marketSlots[]→primaryMarket, devTier→tier |
| Upgrade modals wired | `main.js` lines 228–310 — locked slots 3–6 open #modal-upgrade; upgradeToInvestor()/upgradeToPro() exist |
| CPC priority tier messaging | `clearpath.js` — `[Starter Submission]` / `[Investor — Priority Review]` / `[Pro — Dedicated Broker Requested]` + per-tier button labels |
| Guide toggle global mirroring | `main.js` — single `guideMode` localStorage key, old beginner/pro values migrated |
| Self-Renovating present | `index.html` line 71 toggle-label |
| Dev testing mode | `main.js` — console `setTier('investor')` helper; tiers.js isDevMode() |
| **Markets data integration** | `docs/src/js/markets.js` is **byte-identical** to `Market Data/markets_data.js` (md5 match, 204 markets ids, FLIP/STR/LTR + BRRR_ASSUMPTIONS). **The MASTER_TRACKER "pending markets integration" item is ALREADY DONE** (commits: Rev 4 "expanded market data + picker rebuild", norfolk-va fix) |
| No logo CSS workarounds | `styles.css` — no background-color hack or filter on .cpc-logo (Rev 6b CSS cleanup is in effect) |

## ❌ Defects found

### 1. PWA manifest references deleted icons (breaks installability)
`docs/manifest.json` lists `icons/icon-192.png` and `icons/icon-512.png`, but both PNGs are **deleted on disk** (uncommitted deletions; only `.svg` versions remain). PWA install prompt on GitHub Pages will fail or show broken icons — and GH Pages is the next milestone.
**Fix (Code task):** regenerate icon-192.png + icon-512.png from the canonical mark (after Defect 3 decision), or point manifest at existing assets. SVG entries could be added but PNG 192/512 are the safe baseline for Android/Chrome.

### 2. Repo has uncommitted working-tree changes
`git status`: deleted `Logo/ClearPath Capital lo.png`, `docs/icons/icon-192.png`, `docs/icons/icon-512.png`; modified Gemini logo; untracked: `CPC_INTEGRATION_SPEC.md`, `Logo/ClearPath.png`, 2 ChatGPT logo files, ClearPath Compass.png. Last commit Jun 4. Today's specs and the logo state are not in history.
**Fix (Code task):** resolve Defect 3, then commit everything with a clean message. Also bump `docs/version.json` (still `3.1.0 / 2026-05-20`, predates Revisions 2–6).

### 3. DECISION NEEDED (A-Aron): which mark is canonical?
Revision 6b ordered: overwrite `docs/icons/clearpath-mark.png` with `Logo/clearpath-mark-transparent.png`. That never happened — instead the last commit (Jun 4) replaced it with a **new ChatGPT-generated icon** (hashes differ; deployed file is RGBA 1024×1024 so transparency itself is fine).
But today's CPC_INTEGRATION_SPEC declares `clearpath-mark-transparent.png` canonical for BOTH properties.
**Pick one:**
- **(a)** ChatGPT mark is the new canonical → update CPC_INTEGRATION_SPEC + memory, propagate to CPC site, regenerate 192/512 icons from it.
- **(b)** clearpath-mark-transparent.png is canonical → execute Rev 6b as written (overwrite), regenerate 192/512 from it.
Either way Defects 1–2 resolve in the same Code session.

## ⚠ Minor notes
- App folder is `docs/` not `public/` (GH Pages serves from /docs on main — good convention). MASTER_TRACKER, CLAUDE.md instructions, and markets_data.js header all still say `public/` — tracker updated today (see MASTER_TRACKER changelog); Code should ignore stale `public/` references.
- `version.json` stale (see Defect 2).

## What this means for your review
Your manual test can be a 10-minute spot check: first-launch picker on a cleared profile, tier switch via `setTier()`, one upgrade modal, one Get Funding clipboard copy. The structural items are verified here.
