# Deal Screener — Phase 1 Setup (your ~10-minute task)

This stands up the free backend that makes paid tiers real. **No credit card. No code to write** — Claude Code writes all of it; you just create the project and run one script.

## 1. Create the free Supabase project
1. Go to **supabase.com** → **Start your project** → sign in with GitHub or email.
2. **New project.** Name it `deal-screener`. Pick a strong database password and **save it somewhere safe** (you won't need to share it).
3. Region: pick the one closest to you (e.g., **East US**). Plan: **Free**. Create it (takes ~2 min to provision).

## 2. Run the database script
1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_phase1_entitlements.sql` (in this repo), copy the whole file, paste it in, click **Run**.
3. You should see "Success." That created the `entitlements`, `comp_codes`, and `redemptions` tables and seeded your two comp codes.

## 3. Turn on email magic-link sign-in
1. Left sidebar → **Authentication** → **Providers** → make sure **Email** is enabled.
2. Under **Email**, turn **OFF** "Confirm email" password flow if shown, and ensure **magic link** is allowed (it is by default). We're using passwordless magic links — no passwords anywhere.

## 4. Send me three things (two are safe to share, one is NOT)
From **Project Settings → API**:

| Send to Claude Code | Keep SECRET (never paste in chat) |
|---|---|
| ✅ **Project URL** (e.g. `https://abcd1234.supabase.co`) | ❌ **`service_role` key** — this is god-mode; it goes into the function secrets in step 5, not to me |
| ✅ **`anon` / public key** — it's designed to live in the website code | ❌ Your **database password** |

The `anon` key being public is by design — Row-Level Security (already in the script) is what protects the data, not key secrecy.

## 5. (Later, when Claude builds the functions) set the secret key
When the edge functions are ready, you'll paste the `service_role` key into **Edge Functions → Secrets** in the dashboard. It stays in Supabase; Claude Code never sees it.

---

### What happens after you send the URL + anon key
Claude Code will: wire the website to sign you in by magic link, build the three secure functions (`/entitlement`, `/redeem`, `/market-data`), and move the Pro "depth" behind them — so editing localStorage or sharing a code can no longer unlock paid data. Then you redeem a `CPC-PRO-…` code as a real test. **Still no payments** — that's Phase 2 (Stripe + the legal pages).

### Cost reminder
Everything here is **$0**. Supabase free tier covers launch (only ~$25/mo if you outgrow it, which means you'd already have real volume). Stripe, in Phase 2, charges a per-transaction fee only — no monthly fee.
