-- ─── 0011 · K-3 webhook concurrency / retry hardening ────────────────────────
-- Nonblocking hardening prompted by the live $14 Investor smoke: two events
-- for the SAME subscription (customer.subscription.created + invoice.paid)
-- arrived ~1s apart, both first attempts returned the governed 500, both
-- retries succeeded, and the ledger reconciled with exactly one grant. The
-- exact first-attempt exception is UNRECOVERABLE and remains UNKNOWN — this
-- migration removes the structurally reachable race and makes any recurrence
-- diagnosable after the fact. It does NOT claim a unique violation occurred.
--
-- What changes:
--   1. apply_stripe_grant serializes per subscription identity and writes via
--      a single atomic UPSERT instead of read-then-insert/update.
--   2. stripe_events gains durable prior-failure diagnostics that survive a
--      successful retry.
--   3. fail_stripe_event becomes mode-scopable (latent defect: it matched on
--      event_id alone while the PK is (livemode, event_id)).
--
-- What does NOT change: the eg_one_stripe_sub unique index (kept and now
-- relied upon by name-free inference), the six governed event types, the
-- 3-state event machine, claim/idempotency semantics, grace-episode law,
-- checkout-attempt completion, normalization authority, or any privilege.
-- No function signature the deployed Edge runtime calls has changed shape:
-- apply_stripe_grant is identical, and fail_stripe_event's new third
-- parameter defaults to NULL so existing 2-argument calls resolve unchanged.
-- => MIGRATION-ONLY. No Edge redeploy is required by this file.

-- ── 1. durable prior-failure diagnostics ─────────────────────────────────────
-- last_error keeps its existing meaning: the CURRENT terminal error, cleared
-- on success so operational state is never ambiguous. The prior_* columns are
-- the durable record that survives the successful retry.
alter table public.stripe_events add column if not exists prior_error    text;
alter table public.stripe_events add column if not exists prior_error_at timestamptz;
alter table public.stripe_events add column if not exists failure_count  integer not null default 0;

-- ── 2. race-tolerant grant application ───────────────────────────────────────
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
  v_prev_status text;
begin
  if p_normalized not in ('active','grace','ended') then
    raise exception 'apply_stripe_grant: unexpected normalized state %', p_normalized;
  end if;

  -- K-3: serialize concurrent applies for ONE subscription identity, keyed on
  -- the same (livemode, subscription) identity as eg_one_stripe_sub. The old
  -- SELECT ... FOR UPDATE could not lock a row that did not exist yet, so two
  -- simultaneous first-events for a new subscription could both take the
  -- INSERT branch and one would hit the unique index. Transaction-scoped: the
  -- lock releases on commit/rollback, the critical section performs no network
  -- I/O (Stripe was already read by the caller), and reconcile() reaches the
  -- same lock because it calls this same function.
  perform pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtext('stripe_grant:' || p_livemode::text || ':' || p_subscription_id));

  -- Previous status drives the grace-episode rule (grace_until is stamped ONCE
  -- per episode). Read under the advisory lock, so it cannot be raced.
  select g.status into v_prev_status
    from public.entitlement_grants g
   where g.stripe_subscription_id = p_subscription_id
     and g.livemode = p_livemode and g.source = 'stripe';

  -- Single atomic write. Inference targets the existing partial unique index
  -- (livemode, stripe_subscription_id) WHERE source = 'stripe' — the index is
  -- preserved, not weakened, and is what makes this upsert exact. This is NOT
  -- a blind DO NOTHING: every governed event still applies its full state.
  insert into public.entitlement_grants as g
        (user_id, tier, source, purpose, status, provider_status,
         current_period_end, grace_until, livemode,
         stripe_customer_id, stripe_subscription_id)
  values (p_user_id, p_tier, 'stripe', 'business', p_normalized, p_provider_status,
          p_period_end,
          case when p_normalized = 'grace'
               then now() + make_interval(days => p_grace_days) end,
          p_livemode, p_customer_id, p_subscription_id)
  on conflict (livemode, stripe_subscription_id) where source = 'stripe'
  do update
     set tier               = excluded.tier,
         status             = excluded.status,
         provider_status    = excluded.provider_status,
         current_period_end = excluded.current_period_end,
         -- identical grace law to 0009: stamp on ENTRY to grace, hold it while
         -- still in grace, clear on any other state.
         grace_until        = case
                                when p_normalized = 'grace' and v_prev_status is distinct from 'grace'
                                  then now() + make_interval(days => p_grace_days)
                                when p_normalized = 'grace'
                                  then g.grace_until
                                else null
                              end,
         livemode           = excluded.livemode,
         stripe_customer_id = excluded.stripe_customer_id,
         updated_at         = now();
         -- user_id and purpose are deliberately NOT overwritten: the grant
         -- belongs to the account it was created for (0009 behavior).

  -- Terminal state in the SAME transaction (C-1: no silent divergence).
  -- last_error clears so 'processed' is unambiguous; prior_error /
  -- prior_error_at / failure_count are deliberately preserved as the durable
  -- record of the failed attempt(s) that preceded this success.
  if p_event_id is not null then
    update public.stripe_events
       set state = 'processed', processed_at = now(), last_error = null
     where event_id = p_event_id and livemode = p_livemode;
  end if;

  -- Mark the completed checkout attempt, if one is live for this user/tier —
  -- in the SAME mode only (a test completion never closes a live attempt).
  update public.checkout_attempts
     set state = 'completed'
   where user_id = p_user_id and tier = p_tier and livemode = p_livemode
     and state in ('creating','open');
end;
$$;
revoke all on function public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_grant(text, uuid, text, text, text, text, text, timestamptz, boolean, integer)
  to service_role;

-- ── 3. mode-scopable failure recording with durable diagnostics ──────────────
-- The 2-argument form is DROPPED and replaced by a 3-argument form whose third
-- parameter defaults to NULL: existing `fail_stripe_event(id, err)` callers
-- (the deployed webhook) resolve to it unchanged, so no Edge redeploy is
-- required — while a future Edge revision can pass p_livemode to scope the
-- write to one ledger row. Keeping BOTH forms would make 2-arg calls ambiguous,
-- so the drop is required, and the re-grant below restores the privilege the
-- drop removes. Both statements run inside this migration's transaction.
drop function if exists public.fail_stripe_event(text, text);

create or replace function public.fail_stripe_event(
  p_event_id text, p_error text, p_livemode boolean default null)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  update public.stripe_events
     set state          = 'failed',
         last_error     = left(p_error, 500),
         prior_error    = left(p_error, 500),   -- durable: survives a later success
         prior_error_at = now(),
         failure_count  = failure_count + 1
   where event_id = p_event_id
     and (p_livemode is null or livemode = p_livemode);
end;
$$;
revoke all on function public.fail_stripe_event(text, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_stripe_event(text, text, boolean) to service_role;
