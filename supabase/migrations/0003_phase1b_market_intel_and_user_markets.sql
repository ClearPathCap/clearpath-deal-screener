-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · Phase 1b: server-side premium intel + market-slot enforcement
-- ───────────────────────────────────────────────────────────────────────────
-- Mirrors the Phase 1a pattern (default-deny RLS, SECURITY DEFINER RPCs granted
-- only to `authenticated`, set search_path = public). Two goals:
--
--  (1) market_premium — the analyst/benchmark notes, regulatory notes/risk,
--      source URLs and confidence ratings that today ship in the client bundle.
--      Moved here so editing localStorage.tier can't unlock them. Read ONLY
--      through get_market_intel(), which returns rows only when the caller's
--      entitlement tier is investor or pro (depth ladders by tier inside).
--
--  (2) user_markets — the per-user slot SELECTIONS + change COOLDOWN clock.
--      Writes go ONLY through set_user_market(), which re-derives the tier's
--      slot-count limit and cooldown days ON THE SERVER, so neither the slot
--      count nor the cooldown can be bypassed by clearing localStorage.
--
-- The FREE per-market numbers (medianArv, holdPct*, repair*, occ*, rev*, adr*,
-- makeReady*) stay in the client bundle — they power the instant free calc.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Depends on 0001 (entitlements) being applied first.
-- ───────────────────────────────────────────────────────────────────────────

-- ── tier helper ──────────────────────────────────────────────────────────────
-- Resolve the caller's effective tier from entitlements. Signed-in with no
-- active investor/pro row = 'starter'. The server is the source of truth.
create or replace function public.current_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.tier
       from public.entitlements e
      where e.user_id = auth.uid()
        and e.status = 'active'
        and e.tier in ('investor','pro')
      limit 1),
    'starter'
  );
$$;

revoke all on function public.current_tier() from public, anon;
grant execute on function public.current_tier() to authenticated;

-- ── market_premium ───────────────────────────────────────────────────────────
-- One row per market slug. Holds ONLY the premium "depth" stripped from the
-- client bundle. The free numbers stay in markets.js.
create table if not exists public.market_premium (
  market_id       text primary key,
  rehab_note      text,
  str_viability   text,
  str_rev_low     integer,
  str_rev_high    integer,
  benchmark_note  text,
  regulatory_note text,
  regulatory_risk text,
  confidence      text,
  source_url      text,
  updated_at      timestamptz not null default now()
);

-- ── user_markets ─────────────────────────────────────────────────────────────
-- Server-authoritative slot SELECTIONS + cooldown clock for SIGNED-IN users.
-- slot_index 0 == primary (localStorage 'primaryMarket'); 1..5 == market_2..6.
-- changed_at is the cooldown anchor: null on a first-add, stamped now() on a
-- real change. (user_id, slot_index) pk = one row per slot.
create table if not exists public.user_markets (
  user_id     uuid not null references auth.users(id) on delete cascade,
  slot_index  integer not null check (slot_index between 0 and 5),
  market_id   text not null,
  changed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot_index)
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.market_premium enable row level security;
alter table public.user_markets   enable row level security;

create policy "read own markets"
  on public.user_markets for select
  using (auth.uid() = user_id);

-- market_premium intentionally has NO policy → unreadable by anon/authenticated
-- except through the tier-gated get_market_intel() SECURITY DEFINER function.

-- ── get_market_intel(p_market_ids) ───────────────────────────────────────────
-- Tier-gated premium fetch. Zero rows for starter/signed-out. Investor gets the
-- quantitative depth (str_viability, str_rev_*, regulatory_risk, confidence);
-- Pro additionally gets the analyst prose + sources.
create or replace function public.get_market_intel(p_market_ids text[])
returns table (
  market_id       text,
  rehab_note      text,
  str_viability   text,
  str_rev_low     integer,
  str_rev_high    integer,
  benchmark_note  text,
  regulatory_note text,
  regulatory_risk text,
  confidence      text,
  source_url      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier text := public.current_tier();
  v_pro  boolean := (v_tier = 'pro');
begin
  if v_tier not in ('investor','pro') then
    return;
  end if;

  return query
    select
      mp.market_id,
      case when v_pro then mp.rehab_note      else null end,
      mp.str_viability,
      mp.str_rev_low,
      mp.str_rev_high,
      case when v_pro then mp.benchmark_note  else null end,
      case when v_pro then mp.regulatory_note else null end,
      mp.regulatory_risk,
      mp.confidence,
      case when v_pro then mp.source_url      else null end
    from public.market_premium mp
    where mp.market_id = any (p_market_ids);
end;
$$;

revoke all on function public.get_market_intel(text[]) from public, anon;
grant execute on function public.get_market_intel(text[]) to authenticated;

-- ── get_user_markets() ───────────────────────────────────────────────────────
-- Returns the caller's slot rows for client hydration on boot / sign-in.
create or replace function public.get_user_markets()
returns table (slot_index integer, market_id text, changed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select um.slot_index, um.market_id, um.changed_at
    from public.user_markets um
   where um.user_id = auth.uid()
   order by um.slot_index;
$$;

revoke all on function public.get_user_markets() from public, anon;
grant execute on function public.get_user_markets() to authenticated;

-- ── set_user_market(p_slot, p_market) ────────────────────────────────────────
-- The ONLY write path for slot selections. Enforces server-side:
--   • slot-count limit by tier (starter 2 / investor 4 / pro 6)
--   • cooldown by tier (starter 30d / investor 14d / pro 0d) — a CHANGE to an
--     occupied slot is rejected until the prior change clears the window.
-- First-add and same-market re-selection never start a cooldown.
-- Returns jsonb {ok, msg, lockedUntil?} (mirrors redeem_comp_code).
create or replace function public.set_user_market(p_slot integer, p_market text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user         uuid    := auth.uid();
  v_tier         text;
  v_slot_limit   integer;
  v_cooldown     integer;        -- days
  v_existing     public.user_markets%rowtype;
  v_locked_until timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first to set a market.');
  end if;

  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'msg', 'Invalid slot.');
  end if;
  if p_market is null or length(trim(p_market)) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'Pick a market first.');
  end if;

  v_tier := public.current_tier();

  -- Tier → unlocked slot count (mirrors getUnlockedSlotCount: pro6/investor4/starter2)
  v_slot_limit := case v_tier when 'pro' then 6 when 'investor' then 4 else 2 end;
  if p_slot >= v_slot_limit then
    return jsonb_build_object('ok', false,
      'msg', 'That market slot is not unlocked on your plan.');
  end if;

  -- Tier → cooldown days (mirrors getSlotCooldownDays: pro0/investor14/starter30)
  v_cooldown := case v_tier when 'pro' then 0 when 'investor' then 14 else 30 end;

  select * into v_existing
    from public.user_markets
   where user_id = v_user and slot_index = p_slot;

  -- Existing row holding a DIFFERENT market → CHANGE → enforce cooldown.
  if found and v_existing.market_id is distinct from p_market then
    if v_cooldown > 0 and v_existing.changed_at is not null then
      v_locked_until := v_existing.changed_at + (v_cooldown || ' days')::interval;
      if now() < v_locked_until then
        return jsonb_build_object(
          'ok', false,
          'msg', 'This market is locked until the cooldown ends.',
          'lockedUntil', v_locked_until
        );
      end if;
    end if;

    update public.user_markets
       set market_id  = p_market,
           changed_at = now(),               -- start a fresh cooldown clock
           updated_at = now()
     where user_id = v_user and slot_index = p_slot;

    return jsonb_build_object('ok', true, 'msg', 'Market updated.',
      'lockedUntil', case when v_cooldown > 0
                          then now() + (v_cooldown || ' days')::interval
                          else null end);
  end if;

  -- No existing row → first-add. No cooldown starts (changed_at null).
  if not found then
    insert into public.user_markets (user_id, slot_index, market_id, changed_at)
    values (v_user, p_slot, p_market, null);
    return jsonb_build_object('ok', true, 'msg', 'Market added.');
  end if;

  -- Existing row, SAME market → idempotent no-op.
  return jsonb_build_object('ok', true, 'msg', 'No change.');
end;
$$;

revoke all on function public.set_user_market(integer, text) from public, anon;
grant execute on function public.set_user_market(integer, text) to authenticated;
