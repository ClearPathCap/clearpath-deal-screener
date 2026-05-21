# Deal Screener — Project Brief

**Owner:** Aaron Leach
**Parent business:** Clear Path Capital (private money brokering)
**Domain (current):** GitHub Pages
**Domain (target):** dealscreener.clearpathcapfunding.com or subroute of clearpathcapfunding.com
**Status:** v3 single-file prototype complete · ready to formalize as a project

---

## What this is

Deal Screener is a mobile-first web app for real estate investors to underwrite fix-and-flip and short-term rental deals in seconds. The user enters property data (asking price, ARV, repair cost, occupancy, etc.) and gets a verdict (Hot Deal / Negotiate / Pass), key metrics (profit, ROI, LTV, cap rate, cash-on-cash), a cost breakdown, and the option to save the deal to a personal pipeline. Built for use on a phone while walking properties or reviewing listings.

## Who it's for

**Primary user:** Active real estate investors in the Charlotte / Lake Murray / Mid-Atlantic and Tennessee STR markets. Specifically people running 1–10 deals per year who don't want a full spreadsheet but need numbers fast.

**Secondary user:** Aaron's own deal pipeline, used as the de-facto underwriting tool for every property considered.

**Tertiary (the business case):** Borrower lead generation for Clear Path Capital. Every user analyzing a deal is a potential broker client.

## The business model — why we're doing this

The Deal Screener is not a paid product. It is a **lead generation funnel for Clear Path Capital's private money brokering business**.

Path to revenue:
1. Free Deal Screener distributed publicly (GitHub Pages, then proper domain)
2. Marketing through real estate investor communities (BiggerPockets, Reddit, Facebook groups, Instagram)
3. When a user analyzes a deal that meets Clear Path's parameters (under 70% ARV, $150K–$5M loan size, fix-and-flip or bridge or rental hold), a CTA appears: *"This deal qualifies for Clear Path Capital funding — submit for review."*
4. One tap pre-fills the Clear Path intake form (https://clearpathcapfunding.com/#submit) with everything the user already entered
5. Clear Path's existing 24-hour review process handles the rest

Economics: a typical brokered loan at 1.5–2.5 points on a $300K deal = $4,500–$7,500 per closed loan. One closed deal per month covers all hosting + outpaces any subscription model.

Secondary monetization (additive, not core):
- Affiliate links to AirDNA, contractor referral networks, REI insurance brokers
- White-label version for real estate coaches ($500–$2,000 license)
- Premium tier with cloud sync, multi-device deal sharing, AI repair estimation ($9–19/mo) — only if the free tool gains traction

## Brand integration

Deal Screener is co-branded as a Clear Path Capital tool. Working title: **"Deal Screener by Clear Path Capital"** or **"ClearPath Deal Screener."**

Existing color palette is already aligned:
- Background: `#0a0a0a` (matches Clear Path dark theme)
- Accent: `#b8ff57` lime-green (already matches Clear Path mark)
- Type: Syne (headings) + DM Mono (numbers)

Brand elements to add:
- Clear Path logo in header or footer
- "Powered by Clear Path Capital" tagline on splash/about
- Contact: deals@clearpathcapfunding.com surfaced inside the Guide tab under "Need Capital?"
- Submit-to-Clear-Path CTA on qualifying flip and bridge deals

## Current state (as of May 2026)

**v3 capabilities (single HTML file, deployed manually):**
- Fix & Flip analyzer with self-perform toggle, repair estimator, market presets (Charlotte, Lake Murray, Regional)
- STR analyzer with market presets (Ocean Lakes, Gatlinburg, Pigeon Forge, Lake Murray, Custom)
- Pipeline tab with expandable deal cards, filters, share + delete actions
- Field Guide updated for 2026 market conditions
- PWA install support (iOS Safari, Android Chrome)
- Share via SMS, WhatsApp, Email, native share sheet, copy link
- Notes + address fields per deal
- Two-step confirmation before deal deletion
- localStorage persistence

**Known issues to resolve in project version:**
- Single HTML file is unwieldy at 1,200+ lines
- PWA caching: installed app does not auto-update when remote site updates
- No manual "Check for Update" mechanism
- Share function captures `location.href` which may be a local file path
- Email share has no subject line and raw URL body
- Numeric inputs are not comma-formatted as user types
- No Clear Path Capital integration yet

## Technical decisions

**Phase 1 (build now):** Static site, no framework. Vanilla HTML/CSS/JS broken into proper files. Hosted on GitHub Pages or Vercel under a custom subdomain.

**Why no framework:** Phase 1 has no auth, no backend, no complex state. React/Vue adds build complexity and bundle size without payoff. localStorage is sufficient. Vanilla keeps it shareable, debuggable, and fast.

**Phase 2 trigger:** Once free users exceed ~200 active and Clear Path is converting 1+ deal/month from the funnel, layer in Firebase or Supabase for optional account-based cloud sync.

**Phase 3 trigger:** Only build the SaaS / coach white-label tier if Phase 2 shows clear demand for cross-device sync and saved-deal sharing between partners.

## Update mechanism (priority feature for Phase 1)

Problem: Phones that "install" the app cache it aggressively. Closing and reopening does not refresh.

Solution: Manual update button in the header that:
1. Fetches `/version.json` from the live site (small file, e.g. `{"version": "3.1.0", "released": "2026-05-20"}`)
2. Compares to locally stored version
3. If newer, displays a banner: *"New version available — tap to update"*
4. On tap, hard-reloads with cache-busting query string (`?v=3.1.0`)

This avoids the complexity of service workers while giving users explicit control.

## Success metrics

**Quarter 1 (after deployment):**
- 50+ unique installs
- 5+ deals submitted through the Clear Path Capital CTA
- 1+ closed brokered loan attributable to the screener

**Year 1:**
- 500+ unique installs
- 50+ deals submitted via the screener funnel
- 6–12 closed brokered loans = $25K–$75K in broker fees attributable

## Out of scope (for now)

- User authentication
- Backend / server-side anything
- Multi-user deal sharing inside the app
- AI repair cost estimation from photos
- MLS integration
- Mortgage calculator beyond what's already embedded
- iOS / Android native app store distribution (PWA is enough)
