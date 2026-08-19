-- ───────────────────────────────────────────────────────────────────────────
-- DealFit · Wave 5 · 0008: grant-source independence (entitlement_grants),
-- private comp-code mechanism v2 (campaign slots + hashed codes), and the
-- contract-preserving current_tier() rewrite.
--
-- Governing contract: DEALFIT_WAVE5_AS_BUILT_IMPLEMENTATION_SPEC_v1.md
-- (scope lock v1.4 + plan v1/v1.1 + Phase-4 pins). Key laws implemented here:
--   · concurrent Stripe/comp grants coexist; no source overwrites another
--   · effective tier = highest currently valid grant; pro > investor > starter
--   · comp codes: hashed at rest, one-time, atomic under concurrency
--   · business inventory 12/10/10 is slots, not code-generation events
--   · QA grants (purpose='qa') can never entitle live-mode operation
--   · the legacy `entitlements` table is NOT dropped/renamed and its RLS/read
--     grants are untouched — the Supabase keepalive contract depends on it
--   · rollback boundary: once a real grant row exists, restoring the 0005
--     functions is FORBIDDEN (they cannot see grants); forward-fix only
--
-- PRODUCTION MIGRATION IS DETERMINISTIC: DDL + the active-entitlements data
-- copy only. Zero fixtures. The A–G fixture suite lives in
-- supabase/tests/verify_grants_local.sql and runs against a LOCAL stack only.
--
-- SECURITY DEFINER posture (Phase-4 pin 4): every NEW function uses
-- SET search_path = '' with fully-qualified references. Do not copy the older
-- `public` pattern into new functions.
--
-- HOW TO RUN (when separately authorized): Supabase dashboard → SQL Editor →
-- paste whole file → Run. (After 0001–0007.)
-- ───────────────────────────────────────────────────────────────────────────

-- ── comp_codes_v2 ────────────────────────────────────────────────────────────
-- Hash-at-rest (recommendation pending owner ratification; a plaintext variant
-- would store the raw value in `code_hash`'s place — two-line change in
-- issue/redeem, no schema redesign). Pool 'qa' exists for Phase-6 testing and
-- never touches the business slots below.
create table if not exists public.comp_codes_v2 (
  code_hash       text primary key,
  tier            text not null check (tier in ('investor','pro')),
  pool            text not null check (pool in ('aspire','generic_investor','generic_pro','qa')),
  active          boolean not null default true,
  max_redemptions integer not null default 1,
  redeemed_count  integer not null default 0,
  expires_at      timestamptz,
  label           text,
  issued_at       timestamptz not null default now()
);

-- ── campaign_slots ───────────────────────────────────────────────────────────
-- BUSINESS grant slots — exactly 12 Aspire + 10 generic Investor + 10 generic
-- Pro. A slot is consumed only by a real redemption. A lost/compromised
-- UNREDEEMED code is rotated on its slot (credential swap), consuming nothing.
-- Raising these counts is an owner decision by construction: it means touching
-- these seeded rows.
create table if not exists public.campaign_slots (
  pool              text not null check (pool in ('aspire','generic_investor','generic_pro')),
  slot_no           integer not null,
  state             text not null default 'available'
                    check (state in ('available','issued','redeemed','retired')),
  current_code_hash text references public.comp_codes_v2(code_hash),
  grant_id          uuid,
  updated_at        timestamptz not null default now(),
  primary key (pool, slot_no)
);

insert into public.campaign_slots (pool, slot_no)
select 'aspire', gs from generate_series(1, 12) gs
union all
select 'generic_investor', gs from generate_series(1, 10) gs
union all
select 'generic_pro', gs from generate_series(1, 10) gs
on conflict (pool, slot_no) do nothing;

-- ── entitlement_grants ───────────────────────────────────────────────────────
-- One row per GRANT (not per user). Sources never write each other's rows.
create table if not exists public.entitlement_grants (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  tier                   text not null check (tier in ('investor','pro')),
  source                 text not null check (source in ('stripe','comp')),
  purpose                text not null default 'business' check (purpose in ('business','qa')),
  status                 text not null default 'active'
                         check (status in ('active','grace','ended','revoked')),
  provider_status        text,
  current_period_end     timestamptz,
  grace_until            timestamptz,
  livemode               boolean,
  stripe_customer_id     text,
  stripe_subscription_id text,
  comp_code_hash         text references public.comp_codes_v2(code_hash),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  revoked_at             timestamptz,
  -- Phase 4.1 (#2) — source/field integrity, fail-closed by shape:
  -- A stripe grant must carry its Stripe identity + mode and can never carry a
  -- comp credential; a comp grant can never masquerade as Stripe (no Stripe
  -- identity, no provider_status, no mode). comp_code_hash stays NULLABLE on
  -- comp rows ONLY for the legacy data-copy below (pre-v2 grants have no v2
  -- credential) — every redemption-created row sets it, and the local suite
  -- pins that; constraining the grandfathered rows is the over-constraint the
  -- correction dispatch prohibits.
  constraint eg_stripe_shape check (
    source <> 'stripe'
    or (stripe_subscription_id is not null and livemode is not null and comp_code_hash is null)
  ),
  constraint eg_comp_shape check (
    source <> 'comp'
    or (stripe_subscription_id is null and stripe_customer_id is null
        and provider_status is null and livemode is null and grace_until is null)
  )
);

-- Phase 4.1 (#3): subscription-grant identity is MODE-SCOPED — a test and a
-- live subscription with the same textual id can never share a row.
create unique index if not exists eg_one_stripe_sub
  on public.entitlement_grants (livemode, stripe_subscription_id) where source = 'stripe';
create unique index if not exists eg_one_comp_per_code
  on public.entitlement_grants (user_id, comp_code_hash) where source = 'comp';

alter table public.campaign_slots
  add constraint campaign_slots_grant_fk
  foreign key (grant_id) references public.entitlement_grants(id);

-- ── redemptions_v2 ───────────────────────────────────────────────────────────
-- Immutable, hash-safe history. The legacy `redemptions` table and its rows
-- are untouched history forever.
create table if not exists public.redemptions_v2 (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null references public.comp_codes_v2(code_hash),
  user_id     uuid not null references auth.users(id) on delete cascade,
  grant_id    uuid not null references public.entitlement_grants(id),
  redeemed_at timestamptz not null default now()
);

-- ── payment_config ───────────────────────────────────────────────────────────
-- Server-authoritative payment-launch gate + mode switch (spec §10). Ships with
-- checkout DISABLED and mode='test'. Owner flips values in the SQL Editor under
-- separate authorization. No client role can read or write it.
create table if not exists public.payment_config (
  id               integer primary key check (id = 1),
  checkout_enabled boolean not null default false,
  mode             text not null default 'test' check (mode in ('test','live')),
  allowlist        uuid[] not null default '{}',
  updated_at       timestamptz not null default now()
);
insert into public.payment_config (id) values (1) on conflict (id) do nothing;

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Default-deny everywhere; users read their OWN grants and redemption history.
-- The legacy `entitlements` table's RLS/grants are deliberately NOT modified.
alter table public.comp_codes_v2     enable row level security;
alter table public.campaign_slots    enable row level security;
alter table public.entitlement_grants enable row level security;
alter table public.redemptions_v2    enable row level security;
alter table public.payment_config    enable row level security;

create policy "read own grants"
  on public.entitlement_grants for select
  using (auth.uid() = user_id);

create policy "read own redemptions v2"
  on public.redemptions_v2 for select
  using (auth.uid() = user_id);

-- comp_codes_v2, campaign_slots, payment_config: NO policies — no client access.

-- ── helper: normalize + hash a code value ────────────────────────────────────
create or replace function public.hash_comp_code(p_code text)
returns text language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(upper(trim(p_code)), 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function public.hash_comp_code(text) from public, anon, authenticated, service_role;

-- ── effective tier resolution ────────────────────────────────────────────────
-- The single authoritative resolver (spec v1.1 §5, corrected Phase 4.1 #2):
-- validity is SOURCE-SPECIFIC.
--   comp/active:    period NULL (perpetual) or future — NULL is legal ONLY here
--   stripe/active:  period NOT NULL AND future AND mode matches — a Stripe
--                   grant with no billing period FAILS CLOSED (never perpetual)
--   stripe/grace:   grace_until NOT NULL AND future AND mode matches
--   qa-purpose rows count only while mode='test'
create or replace function public.effective_tier_for(p_user uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select case when bool_or(g.tier = 'pro') then 'pro' else 'investor' end
       from public.entitlement_grants g
      cross join (select mode from public.payment_config where id = 1) cfg
      where g.user_id = p_user
        and g.tier in ('investor','pro')
        and (
              (g.source = 'comp' and g.status = 'active'
               and (g.current_period_end is null or g.current_period_end > now()))
           or (g.source = 'stripe' and g.status = 'active'
               and g.current_period_end is not null and g.current_period_end > now()
               and g.livemode = (cfg.mode = 'live'))
           or (g.source = 'stripe' and g.status = 'grace'
               and g.grace_until is not null and now() < g.grace_until
               and g.livemode = (cfg.mode = 'live'))
        )
        and (g.purpose = 'business' or cfg.mode = 'test')
     -- Phase 5 fix (caught by the LOCAL suite, first zero-valid-grant assert):
     -- an aggregate over ZERO rows still returns one row (bool_or = NULL), and
     -- CASE WHEN NULL falls to the ELSE — which resolved EVERY grantless user
     -- as 'investor'. HAVING count(*) > 0 returns zero rows instead, so the
     -- outer coalesce lands on 'starter'.
     having count(*) > 0
     ),
    'starter');
$$;
-- Owner-only posture (Phase 4.1 #1): Supabase default privileges grant new
-- functions to anon/authenticated/service_role — revoke ALL of them. This
-- resolver is called only from inside other definer functions (owner-executed
-- context); no API role, including service_role, may call it directly.
revoke all on function public.effective_tier_for(uuid) from public, anon, authenticated, service_role;

-- Contract-preserving rewrite: same name, signature, return type, and grant as
-- 0005's version — the client chain (syncEntitlement → setCachedTier) needs no
-- change. ROLLBACK LAW: once entitlement_grants holds a real row, do NOT
-- restore the 0005 body — it cannot see grants and would demote paid users.
create or replace function public.current_tier()
returns text language sql stable security definer
set search_path = ''
as $$
  select public.effective_tier_for(auth.uid());
$$;
revoke all on function public.current_tier() from public, anon;
grant execute on function public.current_tier() to authenticated;

-- ── issuance (owner-only; NO API role may execute) ───────────────────────────
-- Business pools claim a slot under row lock; the 'qa' pool never touches
-- slots. Returns the plaintext code EXACTLY ONCE. Aspire default expiry is the
-- ratified 2027-01-01T00:00:00Z instant (Dec 31 2026 = last usable day).
create or replace function public.issue_comp_code(
  p_pool text, p_expires timestamptz default null, p_label text default null)
returns table (code text, pool text, slot_no integer, tier text, expires_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tier    text;
  v_expires timestamptz := p_expires;
  v_slot    integer;
  v_plain   text;
  v_hash    text;
begin
  if p_pool not in ('aspire','generic_investor','generic_pro','qa') then
    raise exception 'unknown pool %', p_pool;
  end if;

  v_tier := case p_pool
              when 'aspire' then 'investor'
              when 'generic_investor' then 'investor'
              when 'generic_pro' then 'pro'
              else null end;
  if p_pool = 'qa' then
    -- QA codes name their tier in the label convention: 'qa:investor'/'qa:pro'.
    v_tier := case when p_label like '%pro%' then 'pro' else 'investor' end;
  end if;
  if p_pool = 'aspire' and v_expires is null then
    v_expires := timestamptz '2027-01-01T00:00:00Z';
  end if;

  if p_pool <> 'qa' then
    select s.slot_no into v_slot
      from public.campaign_slots s
     where s.pool = p_pool and s.state = 'available'
     order by s.slot_no
     limit 1
     for update skip locked;
    if v_slot is null then
      raise exception 'no available % slot — business inventory is fixed at 12/10/10 by owner ruling', p_pool;
    end if;
  end if;

  v_plain := 'CPC-' || upper(left(p_pool, 1)) || '-' ||
             upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_hash  := public.hash_comp_code(v_plain);

  insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
  values (v_hash, v_tier, p_pool, true, 1, v_expires, p_label);

  if p_pool <> 'qa' then
    update public.campaign_slots s
       set state = 'issued', current_code_hash = v_hash, updated_at = now()
     where s.pool = p_pool and s.slot_no = v_slot;
  end if;

  return query select v_plain, p_pool, v_slot, v_tier, v_expires;
end;
$$;
revoke all on function public.issue_comp_code(text, timestamptz, text) from public, anon, authenticated, service_role;

-- Rotate the credential on an ISSUED, UNREDEEMED business slot (lost code).
-- Consumes nothing: same slot, new code value; old code is deactivated.
create or replace function public.rotate_comp_code(p_pool text, p_slot integer)
returns table (code text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_slot   public.campaign_slots%rowtype;
  v_old    public.comp_codes_v2%rowtype;
  v_plain  text;
  v_hash   text;
begin
  select * into v_slot from public.campaign_slots s
   where s.pool = p_pool and s.slot_no = p_slot
   for update;
  if not found or v_slot.state <> 'issued' then
    raise exception 'slot %/% is not in issued state', p_pool, p_slot;
  end if;
  select * into v_old from public.comp_codes_v2 c where c.code_hash = v_slot.current_code_hash;
  if v_old.redeemed_count > 0 then
    raise exception 'slot %/% code was already redeemed — rotation is for unredeemed credentials only', p_pool, p_slot;
  end if;

  update public.comp_codes_v2 set active = false where code_hash = v_old.code_hash;

  v_plain := 'CPC-' || upper(left(p_pool, 1)) || '-' ||
             upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_hash  := public.hash_comp_code(v_plain);
  insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
  values (v_hash, v_old.tier, v_old.pool, true, 1, v_old.expires_at, v_old.label);

  update public.campaign_slots s
     set current_code_hash = v_hash, updated_at = now()
   where s.pool = p_pool and s.slot_no = p_slot;

  return query select v_plain;
end;
$$;
revoke all on function public.rotate_comp_code(text, integer) from public, anon, authenticated, service_role;

-- Code deactivation vs grant revocation are DISTINCT operations (spec §9).
create or replace function public.deactivate_comp_code(p_pool text, p_slot integer)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_hash text;
begin
  select s.current_code_hash into v_hash from public.campaign_slots s
   where s.pool = p_pool and s.slot_no = p_slot for update;
  if v_hash is null then raise exception 'slot %/% has no code', p_pool, p_slot; end if;
  update public.comp_codes_v2 set active = false where code_hash = v_hash;
end;
$$;
revoke all on function public.deactivate_comp_code(text, integer) from public, anon, authenticated, service_role;

create or replace function public.revoke_grant(p_grant uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.entitlement_grants
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = p_grant and status <> 'revoked';
  if not found then raise exception 'grant % not found or already revoked', p_grant; end if;
end;
$$;
revoke all on function public.revoke_grant(uuid) from public, anon, authenticated, service_role;

-- Owner reporting: campaign counts and states, zero live values, zero hashes
-- needed by the reader.
create or replace function public.comp_code_status()
returns table (pool text, slot_no integer, slot_state text, code_label text,
               code_active boolean, redeemed integer, expires_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select s.pool, s.slot_no, s.state, c.label, c.active, c.redeemed_count, c.expires_at
    from public.campaign_slots s
    left join public.comp_codes_v2 c on c.code_hash = s.current_code_hash
   order by s.pool, s.slot_no;
$$;
revoke all on function public.comp_code_status() from public, anon, authenticated, service_role;

-- ── redemption (the only comp function an API role may call) ─────────────────
-- Atomic one-time claim: the guarded UPDATE takes a row lock; two concurrent
-- winners are impossible. Same jsonb response contract the client already
-- consumes ({ok, msg, tier}).
create or replace function public.redeem_comp_code(p_code text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_hash  text;
  v_code  public.comp_codes_v2%rowtype;
  v_grant uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first to redeem a code.');
  end if;

  v_hash := public.hash_comp_code(p_code);

  -- Idempotent repeat by the SAME user: report the existing grant, mutate nothing.
  select g.id into v_grant
    from public.entitlement_grants g
   where g.user_id = v_user and g.comp_code_hash = v_hash;
  if found then
    select * into v_code from public.comp_codes_v2 c where c.code_hash = v_hash;
    return jsonb_build_object('ok', true, 'tier', v_code.tier,
                              'msg', 'Already redeemed — ' || initcap(v_code.tier) || ' is on your account.');
  end if;

  -- Atomic claim: one UPDATE enforces active + unexpired + under-cap under lock.
  update public.comp_codes_v2 c
     set redeemed_count = c.redeemed_count + 1
   where c.code_hash = v_hash
     and c.active = true
     and (c.expires_at is null or now() < c.expires_at)
     and c.redeemed_count < c.max_redemptions
  returning * into v_code;

  if not found then
    -- Deliberately one generic message: do not oracle which check failed.
    return jsonb_build_object('ok', false, 'msg', 'That code isn''t valid.');
  end if;

  insert into public.entitlement_grants
        (user_id, tier, source, purpose, status, current_period_end, comp_code_hash)
  values (v_user, v_code.tier, 'comp',
          case when v_code.pool = 'qa' then 'qa' else 'business' end,
          'active', v_code.expires_at, v_hash)
  returning id into v_grant;

  insert into public.redemptions_v2 (code_hash, user_id, grant_id)
  values (v_hash, v_user, v_grant);

  -- A business slot is consumed HERE and only here.
  update public.campaign_slots s
     set state = 'redeemed', grant_id = v_grant, updated_at = now()
   where s.current_code_hash = v_hash;

  return jsonb_build_object('ok', true, 'tier', v_code.tier,
                            'msg', 'Unlocked ' || initcap(v_code.tier) || '.');
end;
$$;
revoke all on function public.redeem_comp_code(text) from public, anon;
grant execute on function public.redeem_comp_code(text) to authenticated;

-- ── data copy: still-valid legacy entitlements become business grants ────────
-- Deterministic, fixture-free. The legacy table itself is left exactly as-is
-- (not dropped, not renamed, RLS/grants untouched — keepalive contract).
insert into public.entitlement_grants
      (user_id, tier, source, purpose, status, current_period_end, created_at)
select e.user_id, e.tier, 'comp', 'business', 'active', e.current_period_end, e.updated_at
  from public.entitlements e
 where e.status = 'active'
   and e.source = 'comp'   -- Phase 4.1: only comp rows are copyable — a legacy
                           -- 'stripe' row (none exists per owner-verified state)
                           -- would lack the required Stripe identity/mode and
                           -- must fail closed into reconciliation, not be copied
   and e.tier in ('investor','pro')
   and (e.current_period_end is null or e.current_period_end > now())
on conflict do nothing;
