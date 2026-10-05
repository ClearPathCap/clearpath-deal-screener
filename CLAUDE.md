# CLAUDE.md — DealFit (clearpath-deal-screener)

Operating instructions for Claude Code sessions in this repository. Tooling and working style only — **not** a state
document. It carries no commit SHAs, deployment IDs or release status; those live in the CPC continuity ledger and the
current recovery manifest in the CPC Governance folder (`_Recovery\Current\`). Where this file and the ledger disagree,
the ledger is right and this file is stale.

## What this is

**DealFit by Clear Path Capital** — a mobile-first PWA that screens real-estate investor deals (Fix & Flip, STR, LTR,
BRRRR) and hands qualifying deals to the Clear Path Capital intake. CPC is a **broker**; DealFit's paid tiers buy **app
features only** — never loan access, funding priority, rates or terms.

## Where things are

| What | Where |
|---|---|
| Production site | GitHub Pages, branch `main`, folder **`/docs`** (site root — browser paths omit `/docs`), custom domain `dealfit.clearpathcapfunding.com` (`docs/CNAME`) |
| App code | `docs/index.html`, `docs/src/js/*.js` (ES modules, **no build step**, no bundler), `docs/manifest.json`, `docs/version.json`, legal pages `docs/terms.html`, `docs/privacy.html` |
| Backend | Supabase: `supabase/migrations/` (append-only, numbered), Edge Functions `supabase/functions/{checkout,portal,reconcile,stripe-webhook,_shared}` |
| Keep-alive | `.github/workflows/supabase-keepalive.yml` (free-tier pause prevention) |
| Tests | `tests/*.test.mjs` — Node suites, run each directly: `node tests/<name>.test.mjs` (`npm test` is a stub) |
| CPC handoff contract | `CPC_INTEGRATION_SPEC.md`; the DSCR ratio is the integration keystone in both directions |
| Product context | `PROJECT_BRIEF.md`, `ROADMAP.md` (incl. the decision log), `TIER_STRATEGY.md`, `GITHUB_PAGES_RUNBOOK.md` (original setup) |

## Rules that bite here

- **The repository is public. Pushing any branch publishes its source**, and a push to `main` triggers a Pages rebuild.
  Never commit secrets: Stripe secret and webhook keys and the Supabase service-role key live only in the Supabase
  project's Edge Function secrets. The client uses the publishable Supabase URL and anon key by design.
- **Verify releases by served bytes, not by filename or appearance.** Pages/Fastly cache static filenames without content
  hashing; compare the live files' SHA-256 with the committed `docs/` bytes.
- **Suite baseline:** several suites fail on an unmodified `main` under Node 24 on this machine. Judge a change by
  comparing the full matrix against unmodified `main`, never by the raw failure count. Suites that stub `install.js`
  inline must gain any new exports there.
- **Compliance:** no lending, approval, qualification or licensure language; every loan or return figure is an estimate;
  business-purpose, non-owner-occupied only.
- **Migrations** are append-only; a deployed migration is never edited — a fix is a new numbered migration.
- **Synthetic data:** a signed-in canary/QA deal exists in the production Supabase pipeline from 2026-08-15 launch
  testing; do not create more test data in production without the owner's explicit instruction.

## Working style

Direct; say what changed, where, how it was tested and what could not be verified. Surface complexity before starting.
End substantive replies with a numbered "Action & Decision Needed" section.
