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

## Measurement (success metrics from PROJECT_BRIEF)
- Every screener-sourced submission is identifiable via the email source tag → count monthly: submissions, packaged, closed. Quarter-1 target: 5+ submissions, 1+ closed loan.
