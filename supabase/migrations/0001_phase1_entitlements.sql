-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · Phase 1: server-side entitlement spine
-- ───────────────────────────────────────────────────────────────────────────
-- Goal: make paid tiers REAL — self-unlock-proof. Today tiers live in the
-- browser's localStorage and anyone can grant themselves Pro. After this lands,
-- the source of truth is the database, read through an authenticated function.
-- localStorage may still CACHE the tier for snappy UI, but it never GRANTS it.
--
-- No payments in this phase. Stripe billing is Phase 2 (separate migration).
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- ───────────────────────────────────────────────────────────────────────────

-- ── entitlements ────────────────────────────────────────────────────────────
-- One row per user. Written ONLY by the edge functions (service role).
-- A signed-in user with no explicit grant is treated as 'starter' (free).
create table if not exists public.entitlements (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  tier               text not null default 'starter' check (tier in ('starter','investor','pro')),
  source             text not null default 'comp'    check (source in ('stripe','comp')),
  status             text not null default 'active'  check (status in ('active','canceled','past_due')),
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

-- ── comp_codes ──────────────────────────────────────────────────────────────
-- Titled comp / test codes (CPC-PRO-…, CPC-INVESTOR-…), now server-validated.
-- max_redemptions: null = unlimited; a number = capped (owner chose CAPPED, so
-- a leaked code can't unlock Pro for the whole internet).
create table if not exists public.comp_codes (
  code            text primary key,
  tier            text not null check (tier in ('investor','pro')),
  active          boolean not null default true,
  max_redemptions integer,            -- null = unlimited
  redeemed_count  integer not null default 0,
  created_at      timestamptz not null default now()
);

-- ── redemptions ─────────────────────────────────────────────────────────────
-- Ledger of who redeemed what. The (code, user_id) primary key means a single
-- user can't inflate a code's count, and the cap is enforced honestly.
create table if not exists public.redemptions (
  code        text not null references public.comp_codes(code),
  user_id     uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Default-deny. The edge functions act through the service role (which bypasses
-- RLS) for privileged writes; end users get read-only access to their OWN data
-- and zero access to the comp-code table.
alter table public.entitlements enable row level security;
alter table public.comp_codes  enable row level security;
alter table public.redemptions enable row level security;

create policy "read own entitlement"
  on public.entitlements for select
  using (auth.uid() = user_id);

create policy "read own redemptions"
  on public.redemptions for select
  using (auth.uid() = user_id);

-- comp_codes intentionally has NO policy → no client can read it. Only the
-- service-role edge function (/redeem) touches it.

-- ── Seed the existing comp codes (capped at 25 each; change anytime) ──────────
insert into public.comp_codes (code, tier, active, max_redemptions) values
  ('CPC-INVESTOR-3F9K2A', 'investor', true, 25),
  ('CPC-PRO-8M4Q7X',      'pro',      true, 25)
on conflict (code) do nothing;

-- Note: the owner-only DEV code (CPC-DEV-…) stays CLIENT-side — it only reveals
-- the hidden dev panel and, per spec, must NOT be a path to paid data. The
-- premium endpoints check the server entitlement regardless of any local flag.
