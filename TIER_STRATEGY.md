# Deal Screener — Tier Strategy & Pricing Framework (Goal 5 working doc)
*Cowork strategy doc, 2026-06-12. For brainstorming — nothing here goes to Claude Code until decided.*

## The governing principle (lock this in)
**Never paywall the funnel.** Every tier — including free — gets the "Get Funding" button on qualifying deals. A beginner on the free tier with a qualifying deal is your single most valuable user (PROJECT_BRIEF: beginners lack lender relationships). Paid tiers sell *data, capacity, and convenience* — never access to capital. Tiers differentiate the *service level* of funding (standard / priority / dedicated broker), which costs you nothing and monetizes urgency.

## Pricing anchors (market context, 2026)
Comparable tools (DealCheck, REI calculators) cluster at free / ~$15 / ~$30 per month. Recommended starting point:

| Tier | Price | Logic |
|---|---|---|
| Starter | Free | Volume + funnel. Generous analysis, capped storage/markets. |
| Investor | **$14/mo or $119/yr** | Under the "two coffees" threshold; annual = 30% discount drives commitment. |
| Pro | **$29/mo or $249/yr** | Anchored by the dedicated-broker service, which feels like $$$ value but costs you a HubSpot tag. |

Revenue math sanity check: 500 installs (Year-1 target) × 5% paid conversion ≈ 25 paid ≈ $400–600/mo — nice, but one brokered loan = $4.5K–$7.5K. **The funnel remains the business; subscriptions pay the hosting.** Design every tier decision in that order.

## What stays free vs. gated (current MASTER_TRACKER structure is sound; refinements)
- Free: full analyzer math, 2 market regions, 10 pipeline saves, basic guide, standard funding submission.
- Investor: 4 regions + market intel, unlimited pipeline, deal export, one-way sharing, priority review.
- Pro: 6 regions, everything unlimited, dedicated broker, white-glove framing.
- Refinement: cap free at 10 saves but **never delete** — lock the oldest behind upgrade instead of losing data. Loss-aversion upsell beats a hard wall.

## Identified gaps (questionable items to resolve before charging money)
1. **No auth/backend** — tier enforcement is localStorage-only: trivially bypassed and resets per device. Fine pre-revenue; MUST add accounts (Supabase/Firebase free tier) before Stripe goes live, or paying users lose tiers when they clear their browser. This is the #1 blocker to charging.
2. **Stripe not set up** — A-Aron task; do after auth decision, not before.
3. **Cross-device** — paying users will expect their pipeline on phone + desktop. That's the same auth/backend dependency. Bundle them.
4. **Refunds/cancellation policy** — one paragraph, needed before first charge.
5. **Tier names** — Starter/Investor/Pro is good. "Investor" carrying priority review reads institutional. No change.
6. **Trial?** — recommend 14-day Investor trial, no card required (friction kills tool adoption; the funnel benefits from usage either way).

## Institutional feel for the screener (Goal 1 + 5)
- Adopt CPC green (see CPC_INTEGRATION_SPEC palette decision) + CPC mark + "Powered by Clear Path Capital" footer.
- Verdict language: keep "Hot Deal / Negotiate / Pass" (it's the product's voice) but render metrics in DM Mono with lender-grade labels (LTC, LTV, DSCR) — the user should feel they're seeing what a lender sees.
- Tier badges and upgrade modals: restrained, no countdown timers, no fake scarcity. Institutional = confident, not pushy.

## Sequencing (don't break Goal 7)
1. Finish Phase 1 Addendum (in progress with Code) → A-Aron reviews.
2. Markets data integration (`markets_data.js`) → review.
3. Theme swap (lime→green) + CPC integration spec implementation → review.
4. GitHub Pages deploy + real-URL testing → screener is live and funneling (all free).
5. THEN auth/backend + Stripe (Phase 2) — only after the funnel proves itself.
