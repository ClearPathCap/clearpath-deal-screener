# Deal Screener — Roadmap

Phased build plan from current single-HTML prototype to monetization-ready product.

---

## Phase 0 — Project Setup (1–2 hrs)

Hand to Claude Code. Goal: get the repo organized so future work is fast.

- [ ] Decide repo name and location (recommend new repo `clearpath-deal-screener` under Aaron's GitHub)
- [ ] Initialize repo with `.gitignore`, `README.md`, `CLAUDE.md`, `PROJECT_BRIEF.md`, `ROADMAP.md`
- [ ] Split current v3 HTML into proper file structure (see CLAUDE.md for target structure)
- [ ] Verify the split version renders identically to v3 single-file
- [ ] Push to GitHub, enable GitHub Pages
- [ ] Verify deployed URL loads on phone

**Done when:** Aaron opens the deployed URL on his phone and it looks/works exactly like v3.

---

## Phase 1 — Quality of Life + Clear Path Integration (1 week)

The highest-impact wins.

### 1.1 Update mechanism
- [ ] Create `/version.json` with `{"version": "3.1.0", "released": "2026-MM-DD"}`
- [ ] Add "Check for Update" button in app header (subtle, near share/install)
- [ ] On tap: fetch version.json, compare to stored version, if newer show "Update Available" banner with one-tap hard-reload
- [ ] Store last-seen version in localStorage
- [ ] Bump version.json on every deploy

### 1.2 Comma-formatted number inputs
- [ ] All currency inputs ($-prefixed) auto-format with commas as user types
- [ ] Square footage input formats with commas
- [ ] Underlying values remain numeric for calculations
- [ ] Test on iOS Safari and Android Chrome (numeric keyboard interactions)

### 1.3 Fix share function
- [ ] Hard-code `APP_URL` constant to the deployed GitHub Pages / custom domain URL — never use `location.href`
- [ ] Email share: add proper subject line ("Check out Deal Screener by Clear Path Capital")
- [ ] Email body: friendly intro + URL on its own line, no raw file paths
- [ ] Add `?ref=share_email`, `?ref=share_sms` etc. so we can track which channels work

### 1.4 Clear Path Capital integration
- [ ] Add Clear Path mark / logo to header (small, top-left corner above "Deal Screener")
- [ ] Add "Powered by Clear Path Capital" subtle footer link
- [ ] In Guide tab, add new section "Need Capital?" with:
  - Brief on Clear Path's programs
  - Loan parameters (90% cost, 70% ARV, $150K–$5M)
  - 24-hour review callout
  - Submit Deal button → links to clearpathcapfunding.com/#submit
- [ ] On Fix & Flip results: if deal qualifies (LTV under 70%, project cost between $150K and $5M, has valid ARV), show a green "Qualifies for Clear Path Capital Funding" badge
- [ ] Add "Submit to Clear Path Capital" button under qualifying results that pre-fills the Clear Path intake form via URL parameters
- [ ] Same logic on STR results if it fits Bridge or Rental Acquisition programs

### 1.5 Polish
- [ ] Loading toast on first install
- [ ] Verify Add to Home Screen icon and splash look correct on iPhone and Android
- [ ] Run accessibility check (color contrast, tap target sizes)
- [ ] Test on three real devices: iPhone Safari, Android Chrome, Desktop Chrome

**Done when:** Aaron's first beta tester (friend, fellow investor) can install the app, analyze a deal, save it to their pipeline, share it via SMS, get an update notification, and tap through to submit a qualifying deal to Clear Path.

---

## Phase 2 — Distribution + Light Backend (1–2 months)

Once Phase 1 is stable, focus on getting users.

### 2.1 Custom domain
- [ ] Point dealscreener.clearpathcapfunding.com (or similar subdomain) at the GitHub Pages site
- [ ] SSL cert configured
- [ ] Update APP_URL constant

### 2.2 Analytics
- [ ] Add lightweight analytics (Plausible or simple Cloudflare Web Analytics — no creepy tracking)
- [ ] Track: installs, deal analyses by type, "Submit to Clear Path" clicks, share button usage
- [ ] Dashboard accessible to Aaron only

### 2.3 Optional cloud sync (Firebase or Supabase)
- [ ] User accounts (email + password or magic link)
- [ ] Sync pipeline deals across devices
- [ ] Default mode stays local-only; cloud sync is opt-in
- [ ] Clear Path team can view (with permission) deals submitted by users for warmer outreach

### 2.4 Marketing assets
- [ ] Landing page (separate from the app) explaining what it does, social proof, Clear Path connection
- [ ] Short demo video (60 seconds, phone-screen recorded)
- [ ] Social posts for BiggerPockets, Reddit r/realestateinvesting, Charlotte investor Facebook groups

**Done when:** 100+ unique installs and Clear Path has received at least 5 deal submissions sourced from the screener.

---

## Phase 3 — Revenue Multipliers (3–6 months)

Only build these after Phase 2 shows traction.

### 3.1 Affiliate revenue (low-effort)
- [ ] Add referral links in Guide tab to AirDNA ($30+ per signup), contractor finder services, REI insurance
- [ ] Track click-throughs

### 3.2 White-label / coach version
- [ ] Build admin panel for customization: logo, market presets, guide content, Submit-to-X CTA destination
- [ ] License at $500–$2,000 per coach for branded version pointed at their own lender or coaching program
- [ ] Outreach to RE coaches with established audiences

### 3.3 Premium tier (only if demand is clear)
- [ ] $9–19/mo for cloud sync, deal sharing with partners, AI repair estimation from photos, market data overlay
- [ ] Stripe integration
- [ ] Free tier remains fully functional — premium is additive

### 3.4 Repair estimator AI (interesting future)
- [ ] User uploads photos of a property
- [ ] AI estimates renovation scope and rough cost ranges
- [ ] Premium feature

**Done when:** Combined recurring revenue from broker fees, affiliate clicks, and any premium subscriptions consistently covers Aaron's monthly target (e.g. $5K/mo).

---

## What never happens

- We don't build a native iOS or Android app (PWA is sufficient)
- We don't charge for the basic Deal Screener (it's a funnel, not a product)
- We don't compromise the Clear Path Capital brand connection (it's the whole point)
- We don't add tracking or ads (it's a tool for investors, not a surveillance product)
- We don't lock features behind paywalls just to push upgrades

---

## Decision log

Notable decisions and the reasoning, captured so future-Aaron remembers why.

| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-05-20 | Brand under Clear Path Capital, not standalone | Better business model — broker fees > app sales |
| 2026-05-20 | Vanilla JS, no framework | Phase 1 has no state complexity that justifies bundle overhead |
| 2026-05-20 | Manual update button over service worker | Simpler, more reliable, gives user control |
| 2026-05-20 | Lake Murray added as market preset | Aaron's actual target market expansion |
| 2026-05-20 | Removed Charlotte (Self) vs (Hire Out) presets | Redundant with self-renovate toggle |
