-- ───────────────────────────────────────────────────────────────────────────
-- K-3 · webhook concurrency / retry hardening — LOCAL-ONLY suite.
-- Run against a LOCAL stack AFTER applying 0001–0011. One transaction,
-- ends in ROLLBACK — zero persistent state. NEVER run against the live project.
--
-- Covers the single-session half of K-3: upsert convergence, exactly-one-grant,
-- no legitimate state discarded, grace-episode preservation, retry/idempotency,
-- durable prior-failure diagnostics across a successful retry, and the
-- mode-scoping of fail_stripe_event. TRUE multi-connection races are covered
-- by the two-session procedure in supabase/tests/concurrency_notes.md (§K-3),
-- which must be run separately — a single psql session cannot interleave.
-- ───────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  sub text := 'sub_k3_local_1';
  n int;
  v_status text;
  v_tier text;
  v_grace timestamptz;
  v_grace2 timestamptz;
  v_last text;
  v_prior text;
  v_prior_at timestamptz;
  v_fc int;
  v_pe timestamptz;
begin
  insert into auth.users (id, email) values (u1, 'k3-local@example.test');

  -- ── 1. first apply INSERTS exactly one grant ───────────────────────────────
  perform public.apply_stripe_grant(
    'evt_k3_1', u1, sub, 'cus_k3', 'investor', 'active', 'active',
    now() + interval '30 days', false, 28);
  select count(*) into n from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert n = 1, 'K3-1: first apply creates exactly one grant';

  -- ── 2. re-apply of the SAME state is idempotent (still exactly one) ────────
  perform public.apply_stripe_grant(
    'evt_k3_1', u1, sub, 'cus_k3', 'investor', 'active', 'active',
    now() + interval '30 days', false, 28);
  select count(*) into n from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert n = 1, 'K3-2: repeat apply is idempotent — still exactly one grant';

  -- ── 3. a LEGITIMATE later state is applied, never silently discarded ───────
  --      (this is why the upsert must not be a blind DO NOTHING)
  perform public.apply_stripe_grant(
    'evt_k3_2', u1, sub, 'cus_k3', 'pro', 'active', 'active',
    now() + interval '60 days', false, 28);
  select status, tier, current_period_end into v_status, v_tier, v_pe
    from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert v_tier = 'pro', 'K3-3a: later event updates tier (state-bearing, not discarded)';
  assert v_status = 'active', 'K3-3b: later event keeps status';
  assert v_pe > now() + interval '59 days', 'K3-3c: later period_end applied';

  -- ── 4. grace-episode law preserved through the upsert ─────────────────────
  perform public.apply_stripe_grant(
    'evt_k3_3', u1, sub, 'cus_k3', 'pro', 'past_due', 'grace',
    now() + interval '60 days', false, 28);
  select status, grace_until into v_status, v_grace
    from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert v_status = 'grace', 'K3-4a: entry to grace sets status';
  assert v_grace is not null, 'K3-4b: entry to grace stamps grace_until';
  -- staying in grace must NOT restamp the deadline (once per episode)
  perform public.apply_stripe_grant(
    'evt_k3_4', u1, sub, 'cus_k3', 'pro', 'past_due', 'grace',
    now() + interval '60 days', false, 28);
  select grace_until into v_grace2 from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert v_grace2 = v_grace, 'K3-4c: staying in grace does NOT restamp grace_until';
  -- recovery clears it
  perform public.apply_stripe_grant(
    'evt_k3_5', u1, sub, 'cus_k3', 'pro', 'active', 'active',
    now() + interval '90 days', false, 28);
  select status, grace_until into v_status, v_grace2
    from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert v_status = 'active' and v_grace2 is null, 'K3-4d: recovery clears grace_until';

  -- ── 5. ended is applied (cancellation is state-bearing) ───────────────────
  perform public.apply_stripe_grant(
    'evt_k3_6', u1, sub, 'cus_k3', 'pro', 'canceled', 'ended',
    now() + interval '90 days', false, 28);
  select status into v_status from public.entitlement_grants
   where stripe_subscription_id = sub and livemode = false and source = 'stripe';
  assert v_status = 'ended', 'K3-5: ended state applied, not discarded';

  -- ── 6. mode isolation survives: same textual sub id in live is its own row ─
  perform public.apply_stripe_grant(
    'evt_k3_7', u1, sub, 'cus_k3', 'investor', 'active', 'active',
    now() + interval '30 days', true, 28);
  select count(*) into n from public.entitlement_grants
   where stripe_subscription_id = sub and source = 'stripe';
  assert n = 2, 'K3-6: test and live subscriptions remain independent rows';

  -- ── 7. durable diagnostics: failure → successful retry keeps the evidence ──
  perform public.claim_stripe_event('evt_k3_diag', 'invoice.paid', false);
  perform public.fail_stripe_event('evt_k3_diag', 'simulated first-attempt failure');
  select state, last_error, prior_error, prior_error_at, failure_count
    into v_status, v_last, v_prior, v_prior_at, v_fc
    from public.stripe_events where event_id = 'evt_k3_diag' and livemode = false;
  assert v_status = 'failed', 'K3-7a: failure sets state';
  assert v_last like 'simulated first-attempt%', 'K3-7b: last_error records the current error';
  assert v_prior like 'simulated first-attempt%', 'K3-7c: prior_error records it durably';
  assert v_prior_at is not null, 'K3-7d: prior_error_at stamped';
  assert v_fc = 1, 'K3-7e: failure_count incremented';

  -- retry: claim again, then succeed via apply_stripe_grant
  assert public.claim_stripe_event('evt_k3_diag', 'invoice.paid', false) = 'claimed',
         'K3-7f: a failed event is reclaimable (retry semantics unchanged)';
  perform public.apply_stripe_grant(
    'evt_k3_diag', u1, 'sub_k3_local_2', 'cus_k3', 'investor', 'active', 'active',
    now() + interval '30 days', false, 28);
  select state, last_error, prior_error, prior_error_at, failure_count, attempts
    into v_status, v_last, v_prior, v_prior_at, v_fc, n
    from public.stripe_events where event_id = 'evt_k3_diag' and livemode = false;
  assert v_status = 'processed', 'K3-7g: successful retry reaches processed';
  assert v_last is null, 'K3-7h: last_error cleared — current state is unambiguous';
  assert v_prior like 'simulated first-attempt%', 'K3-7i: PRIOR FAILURE EVIDENCE SURVIVES the success';
  assert v_prior_at is not null, 'K3-7j: prior_error_at survives the success';
  assert v_fc = 1, 'K3-7k: failure_count survives the success';
  assert n = 2, 'K3-7l: attempts still counts the retry';
  assert public.claim_stripe_event('evt_k3_diag', 'invoice.paid', false) = 'already_processed',
         'K3-7m: idempotency intact after the successful retry';

  -- ── 8. fail_stripe_event is mode-scopable (latent defect closed) ───────────
  perform public.claim_stripe_event('evt_k3_dual', 'invoice.paid', false);
  perform public.claim_stripe_event('evt_k3_dual', 'invoice.paid', true);
  perform public.fail_stripe_event('evt_k3_dual', 'test-mode only failure', false);
  select state into v_status from public.stripe_events
   where event_id = 'evt_k3_dual' and livemode = false;
  assert v_status = 'failed', 'K3-8a: scoped failure marks the addressed mode';
  select state into v_status from public.stripe_events
   where event_id = 'evt_k3_dual' and livemode = true;
  assert v_status = 'processing', 'K3-8b: the OTHER mode ledger row is untouched';

  raise notice 'K3 CONCURRENCY SUITE: ALL ASSERTIONS PASSED';
end $$;

rollback;
