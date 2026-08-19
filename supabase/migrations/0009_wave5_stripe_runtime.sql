-- ───────────────────────────────────────────────────────────────────────────
-- DealFit · Wave 5 · 0009: Stripe runtime state — event ledger (3-state
-- machine), customer mapping, logical checkout attempts — plus the
-- transactional helpers the Edge Functions call.
--
-- Governing contract: DEALFIT_WAVE5_AS_BUILT_IMPLEMENTATION_SPEC_v1.md.
--   · stripe_events: processing / processed / failed (pin 9: 'received'
--     removed — the flow inserts directly into processing). 2xx only for
--     processed-now or known-processed; failed stays retryable; stale
--     processing (>10 min) is reclaimable.
--   · grant transition + terminal processed state commit ATOMICALLY
--     (apply_stripe_grant) — they cannot diverge silently (C-1).
--   · checkout_attempts: creating / open / completed / expired / superseded
--     with ONE live attempt per user (pin 1) — a fresh 'creating' row is
--     authoritative and may not be superseded merely because the Stripe call
--     is still in flight; idempotency key = attempt id.
--   · mode isolation (C-8 / pin 5): livemode recorded everywhere; customer
--     mapping keyed (user_id, mode); a same-event-id/different-mode conflict
--     fails closed.
--   · Helpers are executable by NO API role. The Edge runtime's service-role
--     connection is the only caller (it authenticates the end user's JWT
--     itself before acting on their behalf).
--
-- SECURITY DEFINER posture: SET search_path = '' + fully-qualified names.
-- HOW TO RUN (when separately authorized): SQL Editor, after 0008.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.stripe_events (
  event_id     text primary key,
  type         text not null,
  livemode     boolean not null,
  state        text not null default 'processing'
               check (state in ('processing','processed','failed')),
  attempts     integer not null default 1,
  claimed_at   timestamptz not null default now(),
  processed_at timestamptz,
  last_error   text
);

create table if not exists public.stripe_customers (
  user_id            uuid not null references auth.users(id) on delete cascade,
  mode               text not null check (mode in ('test','live')),
  stripe_customer_id text not null,
  created_at         timestamptz not null default now(),
  primary key (user_id, mode)
);
create unique index if not exists sc_customer_per_mode
  on public.stripe_customers (mode, stripe_customer_id);

create table if not exists public.checkout_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  tier              text not null check (tier in ('investor','pro')),
  state             text not null default 'creating'
                    check (state in ('creating','open','completed','expired','superseded')),
  stripe_session_id text,
  livemode          boolean not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);
create unique index if not exists ca_one_live_attempt
  on public.checkout_attempts (user_id) where state in ('creating','open');

alter table public.stripe_events     enable row level security;
alter table public.stripe_customers  enable row level security;
alter table public.checkout_attempts enable row level security;
-- NO policies: no client role reads or writes any of these.

-- ── event claim ──────────────────────────────────────────────────────────────
-- Returns exactly one of: 'claimed' | 'already_processed' | 'busy'.
-- 'busy' → the webhook returns 5xx and Stripe retries later.
create or replace function public.claim_stripe_event(
  p_event_id text, p_type text, p_livemode boolean)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.stripe_events%rowtype;
begin
  insert into public.stripe_events (event_id, type, livemode)
  values (p_event_id, p_type, p_livemode)
  on conflict (event_id) do nothing
  returning * into v_row;
  if found then
    return 'claimed';
  end if;

  select * into v_row from public.stripe_events
   where event_id = p_event_id for update;

  -- Same event id arriving with a different mode is an anomaly: fail closed.
  if v_row.livemode <> p_livemode then
    update public.stripe_events
       set state = 'failed',
           last_error = 'MODE_MISMATCH: event re-presented with different livemode',
           attempts = attempts + 1
     where event_id = p_event_id;
    return 'busy';
  end if;

  if v_row.state = 'processed' then
    return 'already_processed';
  end if;

  if v_row.state = 'failed'
     or (v_row.state = 'processing'
         and v_row.claimed_at < now() - interval '10 minutes') then
    update public.stripe_events
       set state = 'processing', attempts = attempts + 1, claimed_at = now()
     where event_id = p_event_id;
    return 'claimed';
  end if;

  -- Fresh 'processing' held by another instance.
  return 'busy';
end;
$$;
revoke all on function public.claim_stripe_event(text, text, boolean) from public, anon, authenticated;

-- ── atomic grant + terminal state ────────────────────────────────────────────
-- One transaction: upsert the subscription's grant row AND mark the event
-- processed. p_normalized comes from the single shared normalization module
-- (webhook and reconcile use the same logic — no competing authorities).
create or replace function public.apply_stripe_grant(
  p_event_id        text,
  p_user_id         uuid,
  p_subscription_id text,
  p_customer_id     text,
  p_tier            text,
  p_provider_status text,
  p_normalized      text,
  p_period_end      timestamptz,
  p_livemode        boolean,
  p_grace_days      integer)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing public.entitlement_grants%rowtype;
begin
  if p_normalized not in ('active','grace','ended') then
    raise exception 'apply_stripe_grant: unexpected normalized state %', p_normalized;
  end if;

  select * into v_existing from public.entitlement_grants
   where stripe_subscription_id = p_subscription_id and source = 'stripe'
   for update;

  if found then
    update public.entitlement_grants
       set tier               = p_tier,
           status             = p_normalized,
           provider_status    = p_provider_status,
           current_period_end = p_period_end,
           -- grace_until is set ONCE per grace episode; recovery clears it.
           grace_until        = case
                                  when p_normalized = 'grace' and v_existing.status <> 'grace'
                                    then now() + make_interval(days => p_grace_days)
                                  when p_normalized = 'grace'
                                    then v_existing.grace_until
                                  else null
                                end,
           livemode           = p_livemode,
           stripe_customer_id = p_customer_id,
           updated_at         = now()
     where id = v_existing.id;
  else
    insert into public.entitlement_grants
          (user_id, tier, source, purpose, status, provider_status,
           current_period_end, grace_until, livemode,
           stripe_customer_id, stripe_subscription_id)
    values (p_user_id, p_tier, 'stripe', 'business', p_normalized, p_provider_status,
            p_period_end,
            case when p_normalized = 'grace'
                 then now() + make_interval(days => p_grace_days) end,
            p_livemode, p_customer_id, p_subscription_id);
  end if;

  -- Terminal state in the SAME transaction (C-1: no silent divergence).
  if p_event_id is not null then
    update public.stripe_events
       set state = 'processed', processed_at = now(), last_error = null
     where event_id = p_event_id;
  end if;

  -- Mark the completed checkout attempt, if one is live for this user/tier.
  update public.checkout_attempts
     set state = 'completed'
   where user_id = p_user_id and tier = p_tier and state in ('creating','open');
end;
$$;
revoke all on function public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer)
  from public, anon, authenticated;

create or replace function public.fail_stripe_event(p_event_id text, p_error text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.stripe_events
     set state = 'failed', last_error = left(p_error, 500)
   where event_id = p_event_id;
end;
$$;
revoke all on function public.fail_stripe_event(text, text) from public, anon, authenticated;

-- ── checkout attempt lifecycle ───────────────────────────────────────────────
-- begin_checkout_attempt enforces, server-side and in order:
--   1. the payment-launch gate (checkout_enabled OR allowlisted caller);
--   2. the same-tier law (C-5): refuse when requested tier <= effective tier;
--   3. one live logical attempt per user (pin 1): converge / reuse / retry-later.
-- Returns jsonb: outcome 'refused_gate' | 'refused_same_tier' | 'reuse'
--                | 'busy' | 'claimed', plus fields per outcome.
create or replace function public.begin_checkout_attempt(
  p_user uuid, p_tier text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_cfg       public.payment_config%rowtype;
  v_effective text;
  v_rank_req  integer;
  v_rank_eff  integer;
  v_live      public.checkout_attempts%rowtype;
  v_id        uuid;
begin
  if p_tier not in ('investor','pro') then
    raise exception 'unknown tier %', p_tier;
  end if;

  select * into v_cfg from public.payment_config where id = 1;
  if not (v_cfg.checkout_enabled or p_user = any(v_cfg.allowlist)) then
    return jsonb_build_object('outcome', 'refused_gate');
  end if;

  v_effective := public.effective_tier_for(p_user);
  v_rank_req  := case p_tier when 'pro' then 2 else 1 end;
  v_rank_eff  := case v_effective when 'pro' then 2 when 'investor' then 1 else 0 end;
  if v_rank_req <= v_rank_eff then
    return jsonb_build_object('outcome', 'refused_same_tier', 'effective_tier', v_effective);
  end if;

  -- Reclaim stale rows first (creating > 10 min = past any legitimate in-flight
  -- create; open past expires_at = abandoned).
  update public.checkout_attempts
     set state = 'expired'
   where user_id = p_user
     and ((state = 'creating' and created_at < now() - interval '10 minutes')
       or (state = 'open'     and expires_at < now()));

  insert into public.checkout_attempts (user_id, tier, livemode, expires_at)
  values (p_user, p_tier, v_cfg.mode = 'live', now() + interval '30 minutes')
  on conflict (user_id) where state in ('creating','open') do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('outcome', 'claimed', 'attempt_id', v_id);
  end if;

  select * into v_live from public.checkout_attempts
   where user_id = p_user and state in ('creating','open')
   limit 1;

  if v_live.state = 'open' and v_live.stripe_session_id is not null then
    -- Converge racing callers onto the existing session (same tier or not —
    -- one live purchase intent per user at a time).
    return jsonb_build_object('outcome', 'reuse',
                              'attempt_id', v_live.id,
                              'session_id', v_live.stripe_session_id,
                              'tier', v_live.tier);
  end if;

  -- Fresh 'creating' held by a racing request: NEVER supersede it (pin 1).
  return jsonb_build_object('outcome', 'busy');
end;
$$;
revoke all on function public.begin_checkout_attempt(uuid, text) from public, anon, authenticated;

create or replace function public.finalize_checkout_attempt(
  p_attempt uuid, p_session_id text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.checkout_attempts
     set state = 'open', stripe_session_id = p_session_id
   where id = p_attempt and state = 'creating';
  if not found then
    raise exception 'attempt % not in creating state', p_attempt;
  end if;
end;
$$;
revoke all on function public.finalize_checkout_attempt(uuid, text) from public, anon, authenticated;

create or replace function public.expire_checkout_attempt(p_attempt uuid, p_reason text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.checkout_attempts
     set state = case when p_reason = 'superseded' then 'superseded' else 'expired' end
   where id = p_attempt and state in ('creating','open');
end;
$$;
revoke all on function public.expire_checkout_attempt(uuid, text) from public, anon, authenticated;

-- ── customer mapping ─────────────────────────────────────────────────────────
create or replace function public.upsert_stripe_customer(
  p_user uuid, p_mode text, p_customer_id text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.stripe_customers (user_id, mode, stripe_customer_id)
  values (p_user, p_mode, p_customer_id)
  on conflict (user_id, mode) do update set stripe_customer_id = excluded.stripe_customer_id;
end;
$$;
revoke all on function public.upsert_stripe_customer(uuid, text, text) from public, anon, authenticated;
