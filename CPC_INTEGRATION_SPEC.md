# Deal Screener ↔ Clear Path Capital — Integration Spec (v1)
**Cowork-authored spec. Shared contract between BOTH projects. 2026-06-12**
*Implements MASTER_TRACKER pending item: "CPC form pre-fill via query params (needs coordination with CPC site)." Coordination is now done — this is the contract.*

## The bridge
Deal Screener "Get Funding" button → opens CPC intake pre-filled:
`https://clearpathcapfunding.com/?src=dealscreener&tier={tier}&...params#submit`

## Query parameter contract (both sides implement exactly this)

| Param | Screener source field | CPC intake field | Example |
|---|---|---|---|
| `src` | constant `dealscreener` | internal: lead source tag | `dealscreener` |
| `tier` | user tier | internal: priority tag | `starter` / `investor` / `pro` |
| `pp` | asking/purchase price | Purchase Price | `285000` |
| `rehab` | repair cost | Rehab Budget | `45000` |
| `arv` | ARV | ARV | `425000` |
| `loan` | computed max loan (screener) | Loan Amount Requested | `297500` |
| `addr` | address (URL-encoded) | Property Address | `123%20Main%20St` |
| `city` | city | City | `Charlotte` |
| `state` | state 2-letter | State dropdown | `NC` |
| `ptype` | property type | Property Type | `sfr` / `2-4unit` / `multi` |
| `purpose` | deal type | Loan Purpose | `flip` / `bridge` / `rental` / `str` |
| `exit` | exit strategy | Exit Strategy | `sale` / `refi` / `hold` |

Rules: all params optional — CPC pre-fills what arrives, leaves the rest blank. Numbers raw (no commas/$). Unknown params ignored. Nothing breaks if a human edits the URL.

## CPC site side (Claude Code task — added to CLAUDE_CODE_HANDOFF.md as Edit 7)
1. On page load, parse `window.location.search`; if `src=dealscreener`, pre-fill the mapped intake fields and scroll to `#submit`.
2. Append to the internal-summary block of the submission email: `Source: Deal Screener — [Starter|Investor — Priority Review|Pro — Dedicated Broker Requested]`.
3. Tier handling per MASTER_TRACKER: pro → flag for dedicated-broker follow-up; investor → priority review; starter → standard.

## Deal Screener side (separate Claude Code task, this repo)
1. Build `buildCpcUrl(deal, tier)` in `share.js` or new `funding.js` — maps saved-deal fields to the table above.
2. "Get Funding" button shows only when deal qualifies for CPC box: loan ≤ 90% LTC AND ≤ 70% ARV AND $150K–$5M.
3. Open in new tab; keep the existing clipboard deal-summary as fallback.

## Branding unification (both repos)
- Canonical mark: `Logo/clearpath-mark-transparent.png` (this repo). CPC site should adopt it too — its `public/clearpath-mark.png` (1.4MB) and `clearpath-logo.png` (3.4MB) are unprocessed and oversized; compress to <100KB web versions.
- Full wordmark for headers: `Logo/ClearPath.png`.
- **Palette DECISION (2026-06-12): CPC green wins.** Screener swaps lime `#b8ff57` → CPC accent green (single token, match the constant Code consolidates on the CPC site, currently `#22c55e`). Keep `#0a0a0a` background and Syne/DM Mono fonts (good tool identity). Lime may survive ONLY as the "Hot Deal" verdict highlight if contrast testing favors it. Add "Powered by Clear Path Capital" footer with the wordmark. Rationale: deep green on near-black reads institutional (capital, stability, "go"); lime reads consumer-startup — wrong signal for a funding brand.

## Hosting/DNS (when screener leaves GitHub Pages default URL)
- Target: `dealscreener.clearpathcapfunding.com` — CNAME record in Namecheap → GitHub Pages. Free.

## Amendment 2026-09-05 — `annualUtilities` (itemized owner-paid utilities)

*The v1 table above predates the economics keys (`monthlyRent`, `annualTaxes`, `annualInsurance`,
`monthlyHoa`, `vacancyPct`, `pmPct`, `maintPct`, `capexPct`, `loanRate`, `amortYears`, `pointsPct`,
`closingPct`, `screener*`, `units`, `band`, `ltv`, `dscr`); the authoritative key map is
`docs/src/js/funding.js` (`buildCpcUrl`). This amendment records the one key added by the
DealFit → CPC handoff contract wave.*

| Param | Screener source field | CPC intake field | Example |
|---|---|---|---|
| `annualUtilities` | Owner-Paid Utilities (annual) — LTR / BRRRR / STR raw input | Annual Owner-Paid Utilities (income mode, optional) | `1200` |

Contract law:
- **Annual**, raw dollars, finite and nonnegative; sent by LTR, BRRRR and STR; **never by Fix & Flip**.
- Explicit `0` travels as `0` (same style as `monthlyHoa`); an absent value (legacy saved record) is omitted;
  a negative / NaN / non-finite value is omitted, never repaired.
- **NOI law:** `screenerNoi` is *already* utilities-adjusted (DealFit subtracts utilities above NOI).
  CPC itemizes `annualUtilities` in its **own** quick-estimate reconstruction
  (`rent × 12 − taxes − insurance − HOA − utilities`, exactly once) and never subtracts it from
  `screenerNoi`. CPC's server discards every `screener*` figure, so double subtraction is structurally
  impossible.
- Legacy links without the key keep working: CPC treats a missing value as `$0` in the reconstruction
  (unlike the HOA basis, which stays "Not sure"); a malformed CPC entry is refused (422), never defaulted.

## Amendment 2026-09-06 — `hoaStatus` (HOA basis token) and recomputed assumptions

| Param | Screener source field | CPC intake field | Example |
|---|---|---|---|
| `hoaStatus` | HOA (monthly) — LTR / BRRRR; `none` when the analysis ran at $0 HOA, `applies` when positive | HOA Status control (`No HOA` / `HOA applies`) | `none` |

Contract law:
- DealFit models HOA as a displayed figure with an explicit `$0` default, so every rental analysis carries a
  confirmed HOA basis. `hoaStatus=none` = confirmed no HOA / $0 (CPC selects **No HOA**, annual HOA $0,
  calculable, no confirmation request). `hoaStatus=applies` + positive `monthlyHoa` = CPC selects **HOA
  applies** and converts ×12 exactly once. A record with no HOA value at all sends no token.
- Legacy links (no token): unchanged — zero/omitted `monthlyHoa` maps to **Not sure**; a confirmed zero is
  never inferred from an absent parameter.
- The six assumption keys (`vacancyPct`, `pmPct`, `maintPct`, `capexPct`, `loanRate`, `amortYears`) are
  recomputed by CPC server-side into its labeled **operator-basis estimate** (B1 spec v1.8 §6.5A); they
  remain non-governing at CPC.

## Amendment 2026-09-06 (Wave A) — STR HOA emitter, optional property facts, City / State law

Owner/GPT ruling "INVENTORY r2 ACCEPTED WITH MODIFICATIONS" (2026-09-06). Additive only; every pre-existing
link keeps today's behaviour at CPC.

| Param | Screener source field | CPC intake field | Example |
|---|---|---|---|
| `monthlyHoa` + `hoaStatus` | HOA (monthly) — **now also STR** (`v-hoa`, explicit `$0` default) | HOA Status control + Annual HOA (×12 once) | `0` + `none` · `150` + `applies` |
| `units`, `ptype` | STR / F&F **optional** Unit Count and Property Type (no `band` — CPC derives band from units and never reads the key) | Number of Units / Property Type | `4` / `2–4 Unit` |
| `city`, `state` | structured City / State inputs (all four analyzers), auto-filled from the address, user-editable | City / State dropdown | `Myrtle Beach` / `SC` |

Contract law:
- **STR HOA (A2):** the STR analyzer carries the same monthly HOA input and explicit `$0` default as LTR / BRRRR,
  annualized exactly once inside `computeStr`. Its handoff emits `monthlyHoa` + `hoaStatus` through the identical
  `hoaBasisHandoff` rule (`0` → `none`, positive → `applies`, absent / negative / non-finite → both keys omitted).
  A pre-A2 STR record has no `hoa` key and therefore sends no token — CPC keeps its legacy `Not sure` rule.
- **Unknown stays unknown (A4):** STR and Fix & Flip collect Unit Count and Property Type as **optional** facts with a
  blank initial state. `units` / `ptype` travel only when the user supplied them; a blank never serializes a
  default (`SFR`, `1`), so CPC may still ask for them. The only translation is the LTR / BRRRR one: a selected
  `5–8 Unit` / `9+ Unit` type is sent as `Multifamily` (CPC has no 5–8 option). No `band` is emitted for STR / F&F.
  No analyzer computation depends on either value.
- **City / State (A1):** each analyzer stores structured `city` and `state` values. They are auto-filled from the
  address by `parseCityState` only when the parse is confident (a comma- or ZIP-delimited two-letter state, or a
  full state name; trailing `USA` / `United States` stripped) and are **never** written over a user's explicit edit
  or clearing. The handoff sends the stored values (state normalized to its two-letter code, sent only when it is a
  real state); a record without the keys (pre-A1) falls back to the parser. **Prefer blank over wrong:** an
  address with no city delimiter (`12 Oak Ct`) yields nothing, never a street suffix read as a state. The 9+ unit
  referral handoffs carry the same `city` / `state`.

## Measurement (success metrics from PROJECT_BRIEF)
- Every screener-sourced submission is identifiable via the email source tag → count monthly: submissions, packaged, closed. Quarter-1 target: 5+ submissions, 1+ closed loan.
