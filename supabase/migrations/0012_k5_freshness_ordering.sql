-- ─── 0012 · K-5 freshness / out-of-order convergence ─────────────────────────
-- GPT-approved design v1.3 (cccd0554…): prevents an older fetched Stripe
-- snapshot from overwriting newer authoritative state merely by committing
-- later. Freshness signal = Stripe's own HTTP response Date (a coarse
-- fetch-freshness comparator, NOT a version/total order — hence the bounded
-- ambiguity path). Reproduced defect: post-0011, apply(ended) then a
-- later-committing stale apply(active) resurrected a canceled subscription
-- with a regressed period.
--
-- THE LAW (all inside the K-3 advisory lock; ended-ratchet always first):
--   payment_config.freshness_enforced = FALSE (default; also the rollback
--   mode): pure pre-K-5 ordering semantics. Stamped params are accepted for
--   RPC shape but DISCARDED — no call establishes or advances state_at, and
--   an existing stamp is preserved untouched. Explicitly NOT K-5-safe.
--   freshness_enforced = TRUE (the hard protocol boundary — activated by one
--   governed UPDATE after the new Edge is verified): no legacy mutating
--   caller is accepted. Stamped calls: strictly-newer-different applies
--   (bootstrapping a NULL state_at); newer-identical advances the watermark
--   with no material mutation; equal/older-different returns 'needs_refetch'
--   (caller resolves with ONE fresh Stripe read; webhook falls back to
--   fail/5xx so Stripe retry converges; reconcile reports unconverged).
--   Unstamped calls: identical → harmless noop (never advances the
--   watermark); different vs stamped row, different vs NULL-stamped row, and
--   INSERT all RAISE — the old webhook's own catch (fail_stripe_event + 5xx)
--   keeps the event retryable and never falsely processed.
--
-- Materially-identical comparator (governed): tier, normalized status,
-- provider_status, current_period_end, stripe_customer_id. Excluded:
-- grace_until (derived episode state), user_id/purpose (identity, never
-- overwritten), livemode (row identity).
--
-- Durable disposition vocabulary (CHECK-enforced): applied · noop_same_state
-- · skipped_ended · reconciled_after_ambiguity. 'needs_refetch' is an
-- RPC-internal signal, never a terminal event disposition.
--
-- Rollback (deterministic, ruled order): (A) flip freshness_enforced=false —
-- pre-K-5 semantics restored immediately; (B) optionally redeploy old Edge;
-- (C) optionally drop this 12-arg function and recreate the 0011 body with
-- re-grant. The three added columns are additive and remain harmlessly.
-- Schema-cache NOTIFY stays a deployment-verification step (the canonical
-- pattern), not part of this migration.

drop function if exists public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer);

alter table public.entitlement_grants add column if not exists state_at timestamptz;
alter table public.stripe_events add column if not exists apply_disposition text
  check (apply_disposition in ('applied','noop_same_state','skipped_ended','reconciled_after_ambiguity'));
alter table public.payment_config add column if not exists freshness_enforced boolean not null default false;

drop function if exists public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer, timestamptz, boolean);

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
  p_grace_days      integer,
  p_state_at        timestamptz default null,
  p_after_refetch   boolean default false)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_prev public.entitlement_grants%rowtype;
  v_found boolean;
  v_identical boolean;
  v_enforced boolean;
  v_disposition text;
  v_write_stamp timestamptz;
begin
  if p_normalized not in ('active','grace','ended') then
    raise exception 'apply_stripe_grant: unexpected normalized state %', p_normalized;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtext('stripe_grant:' || p_livemode::text || ':' || p_subscription_id));

  select coalesce(freshness_enforced, false) into v_enforced
    from public.payment_config where id = 1;
  v_enforced := coalesce(v_enforced, false);

  select * into v_prev from public.entitlement_grants g
   where g.stripe_subscription_id = p_subscription_id
     and g.livemode = p_livemode and g.source = 'stripe';
  v_found := found;

  -- Terminal-ended ratchet: BOTH modes, ALL callers (declared exception).
  if v_found and v_prev.status = 'ended' and p_normalized in ('active','grace') then
    v_disposition := 'skipped_ended';
    if p_event_id is not null then
      update public.stripe_events
         set state = 'processed', processed_at = now(), last_error = null,
             apply_disposition = v_disposition
       where event_id = p_event_id and livemode = p_livemode;
    end if;
    return v_disposition;
  end if;

  if not v_enforced then
    -- ═ FLAG OFF: pre-K-5 ordering semantics (declared NOT K-5-safe). No
    --   identical shortcut, no ordering, and the write NEVER establishes or
    --   advances state_at (v_write_stamp = NULL; update coalesces to the
    --   existing value, which after a rollback simply freezes old stamps).
    v_write_stamp := null;
  else
    if v_found then
      v_identical := v_prev.tier = p_tier
                 and v_prev.status = p_normalized
                 and v_prev.provider_status is not distinct from p_provider_status
                 and v_prev.current_period_end is not distinct from p_period_end
                 and v_prev.stripe_customer_id is not distinct from p_customer_id;

      if v_identical then
        -- Approved Issue-1 watermark: strictly newer stamped-identical advances.
        if p_state_at is not null
           and (v_prev.state_at is null or p_state_at > v_prev.state_at) then
          update public.entitlement_grants
             set state_at = p_state_at, updated_at = now()
           where id = v_prev.id;
        end if;
        v_disposition := case when p_after_refetch then 'reconciled_after_ambiguity'
                              else 'noop_same_state' end;
        if p_event_id is not null then
          update public.stripe_events
             set state = 'processed', processed_at = now(), last_error = null,
                 apply_disposition = v_disposition
           where event_id = p_event_id and livemode = p_livemode;
        end if;
        return v_disposition;
      end if;

      -- Materially different:
      if p_state_at is null then
        -- Hard boundary: no legacy mutating caller after activation —
        -- regardless of whether the stored row is stamped or NULL-stamped.
        raise exception 'freshness enforcement active: unstamped apply refused for subscription %', p_subscription_id;
      end if;
      if v_prev.state_at is not null and p_state_at <= v_prev.state_at then
        return 'needs_refetch';
      end if;
      -- stored state_at NULL → the legitimate stamped call bootstraps it below.
    else
      if p_state_at is null then
        -- Hard boundary: an unstamped INSERT is a legacy mutation too.
        raise exception 'freshness enforcement active: unstamped insert refused for subscription %', p_subscription_id;
      end if;
    end if;
    v_write_stamp := p_state_at;
  end if;

  insert into public.entitlement_grants as g
        (user_id, tier, source, purpose, status, provider_status,
         current_period_end, grace_until, livemode,
         stripe_customer_id, stripe_subscription_id, state_at)
  values (p_user_id, p_tier, 'stripe', 'business', p_normalized, p_provider_status,
          p_period_end,
          case when p_normalized = 'grace'
               then now() + make_interval(days => p_grace_days) end,
          p_livemode, p_customer_id, p_subscription_id, v_write_stamp)
  on conflict (livemode, stripe_subscription_id) where source = 'stripe'
  do update
     set tier               = excluded.tier,
         status             = excluded.status,
         provider_status    = excluded.provider_status,
         current_period_end = excluded.current_period_end,
         grace_until        = case
                                when p_normalized = 'grace' and v_prev.status is distinct from 'grace'
                                  then now() + make_interval(days => p_grace_days)
                                when p_normalized = 'grace'
                                  then g.grace_until
                                else null
                              end,
         livemode           = excluded.livemode,
         stripe_customer_id = excluded.stripe_customer_id,
         state_at           = coalesce(excluded.state_at, g.state_at),
         updated_at         = now();

  v_disposition := case when p_after_refetch then 'reconciled_after_ambiguity' else 'applied' end;

  if p_event_id is not null then
    update public.stripe_events
       set state = 'processed', processed_at = now(), last_error = null,
           apply_disposition = v_disposition
     where event_id = p_event_id and livemode = p_livemode;
  end if;

  update public.checkout_attempts
     set state = 'completed'
   where user_id = p_user_id and tier = p_tier and livemode = p_livemode
     and state in ('creating','open');

  return v_disposition;
end;
$$;
revoke all on function public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer, timestamptz, boolean)
  to service_role;
