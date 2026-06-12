# GitHub Pages Deploy Runbook — Deal Screener
*Cowork-authored 2026-06-12. ~20 minutes of your time, $0. Do AFTER the SPEC_THEME_AND_FUNDING build is committed.*
*The app already lives in `docs/` — that's GitHub Pages' native serving folder, so zero restructuring needed.*

## Step 1 — Create the repo (you, in browser, ~3 min)
1. github.com → New repository → name: `deal-screener` → **Private won't work for Pages on the free plan — use Public.** (Code is client-side anyway; nothing secret lives in it. Keep specs/strategy docs OUT — see step 2.)
2. No README/gitignore/license (repo already has history).

## Step 2 — Don't publish the strategy docs
The local repo tracks specs (BUILD_SPEC, PHASE1_*, etc.) but NOT MASTER_TRACKER/TIER_STRATEGY/QA files (currently untracked — good). Before pushing, tell Claude Code:
> "Add all root *.md files except README.md to .gitignore, `git rm --cached` the already-tracked spec files (keep them on disk), commit, and push to git@github.com:<your-username>/deal-screener.git main."
Pricing strategy and funnel docs should not be on a public repo. The `Market Data/` folder should also be gitignored (the xlsx + GPT raw data are competitive work product; markets.js already carries the data the app needs).

## Step 3 — Enable Pages (you, ~2 min)
Repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, Folder: **`/docs`** → Save.
Wait ~2 min → site live at `https://<username>.github.io/deal-screener/`.

## Step 4 — Custom subdomain (you, in Namecheap, ~5 min)
1. Namecheap → clearpathcapfunding.com → Advanced DNS → Add Record: **CNAME | Host: `dealscreener` | Value: `<username>.github.io.` | TTL: Automatic**
2. Repo → Settings → Pages → Custom domain: `dealscreener.clearpathcapfunding.com` → Save → wait for DNS check → tick **Enforce HTTPS** (appears after cert issues, can take ~15 min).

## Step 5 — Verify (you + me, ~10 min)
1. Open the URL on your phone → Chrome menu should offer "Install app" / "Add to Home Screen" (PWA icons must exist — fixed in SPEC Part 0).
2. Run a qualifying deal → Get Funding → confirm CPC form pre-fills (full bridge test from a real URL).
3. Lighthouse PWA check: bring me the URL and I'll audit it from here.

## Gotchas
- All asset paths in the app are relative (`icons/…`, `src/…`) — verified, so the `/deal-screener/` subpath AND the custom domain both work without edits.
- `start_url: "."` and `scope: "."` in manifest.json — correct for both URLs, don't change.
- After custom domain is set, GitHub writes a `CNAME` file into `docs/` — let it; don't delete it on future pushes.
- OneDrive + git: if Code hits file-lock weirdness on push, pause OneDrive sync for 5 min.

## After it's live
- Add the URL to the CPC site footer ("Free Deal Screener" link) — drives the funnel both directions. I'll spec it when you're ready.
- GSC: add `dealscreener.clearpathcapfunding.com` to the existing domain property (auto-covered since it's the same domain — just submit the sitemap if we add one).
