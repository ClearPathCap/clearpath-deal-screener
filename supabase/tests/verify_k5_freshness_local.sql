-- ───────────────────────────────────────────────────────────────────────────
-- K-5 · freshness / out-of-order convergence — LOCAL-ONLY suite (design v1.3,
-- GPT-approved). Run against a LOCAL stack AFTER applying 0001–0012. One
-- transaction per block, ends in ROLLBACK — zero persistent state. NEVER run
-- against the live project.
--
-- Phase 1 (flag OFF): pre-K-5 semantics; no call establishes/advances
-- state_at; rollback shape freezes stamps; ended ratchet active.
-- Phase 2 (activation): hard boundary — unstamped mutation raises against
-- stamped rows, NULL-stamped rows, and inserts; refused webhook events stay
-- retryable; unstamped-identical noops; stamped calls bootstrap watermarks.
-- Phase 3 (enforced): T1/T2/T3 watermark law, equal-second immovability,
-- refetch-confirm disposition, grace episode + recovery, ended ratchet.
-- The pre-K-5 NULL-window expectations of older suites are superseded BY
-- RULING; this file is their replacement for freshness semantics.
-- ───────────────────────────────────────────────────────────────────────────
begin;
do $$
declare
  u uuid := gen_random_uuid();
  d text; v_status text; v_pe timestamptz; v_sa timestamptz; v_g1 timestamptz; v_g2 timestamptz;
  v_err text; n int;
  T1 timestamptz := timestamptz '2026-08-25T12:00:01Z';
  T2 timestamptz := timestamptz '2026-08-25T12:00:02Z';
  T3 timestamptz := timestamptz '2026-08-25T12:00:03Z';
begin
  insert into auth.users (id, email) values (u, 'k5v13@example.test');
  assert (select freshness_enforced from public.payment_config where id = 1) = false, 'gate defaults OFF';

  -- ═══ PHASE 1 · FLAG OFF ═══════════════════════════════════════════════════
  -- R1: a stamped call does NOT establish state_at while OFF.
  d := public.apply_stripe_grant(null, u, 'sOff', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T1, false);
  assert d = 'applied', 'R1a: ' || d;
  select state_at into v_sa from public.entitlement_grants where stripe_subscription_id = 'sOff';
  assert v_sa is null, 'R1b flag OFF: stamped call did NOT establish state_at';
  -- R2: pre-K-5 behavior preserved — unstamped different call legacy-applies;
  --     identical call is a legacy WRITE (no noop shortcut while OFF).
  d := public.apply_stripe_grant(null, u, 'sOff', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, null, false);
  assert d = 'applied', 'R2a unstamped different legacy-applies OFF: ' || d;
  d := public.apply_stripe_grant(null, u, 'sOff', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, null, false);
  assert d = 'applied', 'R2b identical is a legacy write OFF (pre-K-5): ' || d;
  -- stamped call cannot ADVANCE a stamp while OFF either (rollback shape):
  -- bootstrap a stamped row under ON, then flip OFF and try to advance.
  update public.payment_config set freshness_enforced = true where id = 1;
  d := public.apply_stripe_grant(null, u, 'sRoll', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T1, false);
  assert d = 'applied', 'R1c: ' || d;
  update public.payment_config set freshness_enforced = false where id = 1;
  d := public.apply_stripe_grant(null, u, 'sRoll', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-11-25T00:00:00Z', false, 28, T3, false);
  assert d = 'applied', 'R1d: ' || d;
  select state_at into v_sa from public.entitlement_grants where stripe_subscription_id = 'sRoll';
  assert v_sa = T1, 'R1e flag OFF: stamped call did NOT advance state_at (frozen at T1)';
  -- R-rollback: OFF + unstamped-different vs the STAMPED row legacy-applies
  -- (pre-K-5 semantics restored; stamp frozen, not destroyed).
  d := public.apply_stripe_grant(null, u, 'sRoll', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-12-25T00:00:00Z', false, 28, null, false);
  assert d = 'applied', 'R-rb1 rollback restores legacy NULL semantics: ' || d;
  select state_at into v_sa from public.entitlement_grants where stripe_subscription_id = 'sRoll';
  assert v_sa = T1, 'R-rb2 stamp frozen (neither advanced nor destroyed)';
  -- ended ratchet active even OFF (declared exception)
  d := public.apply_stripe_grant(null, u, 'sOff', 'c1', 'pro', 'canceled', 'ended',
        timestamptz '2026-10-25T00:00:00Z', false, 28, null, false);
  assert d = 'applied', 'ratchet-setup: ' || d;
  d := public.apply_stripe_grant(null, u, 'sOff', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, null, false);
  assert d = 'skipped_ended', 'R-ratchet OFF-mode ended cannot resurrect: ' || d;

  -- ═══ PHASE 2 · ACTIVATION (the hard protocol boundary) ═══════════════════
  update public.payment_config set freshness_enforced = true where id = 1;

  -- R3: unstamped-different vs UNSTAMPED row RAISES (sOff row has state_at NULL... it is 'ended';
  --     use a fresh unstamped row created pre-activation instead).
  update public.payment_config set freshness_enforced = false where id = 1;
  d := public.apply_stripe_grant(null, u, 'sNullRow', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-09-25T00:00:00Z', false, 28, null, false);
  update public.payment_config set freshness_enforced = true where id = 1;
  begin
    d := public.apply_stripe_grant(null, u, 'sNullRow', 'c1', 'pro', 'active', 'active',
          timestamptz '2026-10-25T00:00:00Z', false, 28, null, false);
    raise exception 'R3 FAIL: unstamped mutation of NULL-stamped row allowed after activation';
  exception when others then
    v_err := sqlerrm;
    if position('freshness enforcement active' in v_err) = 0 then raise; end if;
  end;
  select tier into v_status from public.entitlement_grants where stripe_subscription_id = 'sNullRow';
  assert v_status = 'investor', 'R3b NULL-stamped row unmutated';

  -- R4: unstamped-different vs STAMPED row RAISES.
  begin
    d := public.apply_stripe_grant(null, u, 'sRoll', 'c1', 'investor', 'grace', 'grace',
          timestamptz '2026-12-25T00:00:00Z', false, 28, null, false);
    raise exception 'R4 FAIL: unstamped mutation of stamped row allowed after activation';
  exception when others then
    v_err := sqlerrm;
    if position('freshness enforcement active' in v_err) = 0 then raise; end if;
  end;

  -- R5: refused webhook event stays retryable, never processed. Simulate the
  -- old webhook's full path: claim → apply raises → (old code) fail_stripe_event.
  perform public.claim_stripe_event('eRefused', 'invoice.paid', false);
  begin
    d := public.apply_stripe_grant('eRefused', u, 'sRoll', 'c1', 'investor', 'grace', 'grace',
          timestamptz '2026-12-25T00:00:00Z', false, 28, null, false);
    raise exception 'R5 FAIL';
  exception when others then
    v_err := sqlerrm;
    if position('freshness enforcement active' in v_err) = 0 then raise; end if;
  end;
  select state into v_status from public.stripe_events where event_id = 'eRefused' and livemode = false;
  assert v_status = 'processing', 'R5a refused event NOT marked processed';
  perform public.fail_stripe_event('eRefused', 'freshness refused (old caller)', false);
  select state into v_status from public.stripe_events where event_id = 'eRefused' and livemode = false;
  assert v_status = 'failed', 'R5b old-caller catch path recorded failure';
  assert public.claim_stripe_event('eRefused', 'invoice.paid', false) = 'claimed',
         'R5c the refused event remains retryable';

  -- R6: unstamped-identical remains harmless (uses current sRoll state: pro/active/2026-12-25 from R-rb1).
  d := public.apply_stripe_grant(null, u, 'sRoll', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-12-25T00:00:00Z', false, 28, null, false);
  assert d = 'noop_same_state', 'R6 unstamped identical noop: ' || d;
  select state_at into v_sa from public.entitlement_grants where stripe_subscription_id = 'sRoll';
  assert v_sa = T1, 'R6b and it never advances the watermark';

  -- R7: first valid stamped call bootstraps a NULL state_at row.
  d := public.apply_stripe_grant(null, u, 'sNullRow', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, T2, false);
  assert d = 'applied', 'R7a: ' || d;
  select state_at into v_sa from public.entitlement_grants where stripe_subscription_id = 'sNullRow';
  assert v_sa = T2, 'R7b stamped call bootstrapped the watermark';

  -- R8: unstamped INSERT refused after activation (hard-boundary extension).
  begin
    d := public.apply_stripe_grant(null, u, 'sNewLegacy', 'c1', 'investor', 'active', 'active',
          timestamptz '2026-09-25T00:00:00Z', false, 28, null, false);
    raise exception 'R8 FAIL: legacy insert allowed after activation';
  exception when others then
    v_err := sqlerrm;
    if position('freshness enforcement active' in v_err) = 0 then raise; end if;
  end;
  select count(*) into n from public.entitlement_grants where stripe_subscription_id = 'sNewLegacy';
  assert n = 0, 'R8b no legacy row created';

  -- ═══ PHASE 3 · CARRIED APPROVED LAWS (enforced mode) ══════════════════════
  -- T1/T2/T3 watermark proof (Issue 1, approved v1.2):
  d := public.apply_stripe_grant(null, u, 'sW', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T1, false);
  d := public.apply_stripe_grant(null, u, 'sW', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T3, false);
  assert d = 'noop_same_state', 'W1: ' || d;
  select state_at into v_sa from public.entitlement_grants where stripe_subscription_id = 'sW';
  assert v_sa = T3, 'W2 watermark advanced to T3';
  d := public.apply_stripe_grant(null, u, 'sW', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, T2, false);
  assert d = 'needs_refetch', 'W3 intermediate T2 refused: ' || d;
  select current_period_end into v_pe from public.entitlement_grants where stripe_subscription_id = 'sW';
  assert v_pe = timestamptz '2026-09-25T00:00:00Z', 'W4 unregressed';
  -- strictly newer applies; equal+different refused; period immovable on shared second:
  d := public.apply_stripe_grant(null, u, 'sW', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, timestamptz '2026-08-25T12:00:09Z', false);
  assert d = 'applied', 'C1: ' || d;
  d := public.apply_stripe_grant(null, u, 'sW', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-11-25T00:00:00Z', false, 28, timestamptz '2026-08-25T12:00:09Z', false);
  assert d = 'needs_refetch', 'C2 equal+different refused: ' || d;
  -- refetch-confirm records reconciled disposition:
  perform public.claim_stripe_event('eR', 'invoice.paid', false);
  d := public.apply_stripe_grant('eR', u, 'sW', 'c1', 'investor', 'active', 'active',
        timestamptz '2026-11-25T00:00:00Z', false, 28, timestamptz '2026-08-25T12:00:10Z', true);
  assert d = 'reconciled_after_ambiguity', 'C3: ' || d;
  select apply_disposition into d from public.stripe_events where event_id = 'eR' and livemode = false;
  assert d = 'reconciled_after_ambiguity', 'C4 durable disposition';
  -- grace episode + recovery under enforcement:
  d := public.apply_stripe_grant(null, u, 'sG', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T1, false);
  d := public.apply_stripe_grant(null, u, 'sG', 'c1', 'pro', 'past_due', 'grace',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T2, false);
  assert d = 'applied', 'G1 grace entry';
  select grace_until into v_g1 from public.entitlement_grants where stripe_subscription_id = 'sG';
  d := public.apply_stripe_grant(null, u, 'sG', 'c1', 'pro', 'past_due', 'grace',
        timestamptz '2026-09-25T00:00:00Z', false, 28, T3, false);
  assert d = 'noop_same_state', 'G2 staying in grace noops (and advances watermark)';
  select grace_until, state_at into v_g2, v_sa from public.entitlement_grants where stripe_subscription_id = 'sG';
  assert v_g2 = v_g1, 'G3 episode deadline not restamped';
  assert v_sa = T3, 'G4 watermark advanced by identical grace heartbeat';
  d := public.apply_stripe_grant(null, u, 'sG', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, timestamptz '2026-08-25T12:00:08Z', false);
  assert d = 'applied', 'G5 recovery applies';
  select status, grace_until into v_status, v_g2 from public.entitlement_grants where stripe_subscription_id = 'sG';
  assert v_status = 'active' and v_g2 is null, 'G6 recovery clears grace';
  raise notice 'K5 v1.3 PHASE 1-3 CORE: ALL ASSERTIONS PASSED';
end $$;

do $$
declare
  u2 uuid := gen_random_uuid();
  d text;
  Tz timestamptz := timestamptz '2026-08-25T12:00:20Z';
begin
  insert into auth.users (id, email) values (u2, 'k5v13b@example.test');
  update public.payment_config set freshness_enforced = true where id = 1;
  d := public.apply_stripe_grant(null, u2, 'sE', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, Tz, false);
  d := public.apply_stripe_grant(null, u2, 'sE', 'c1', 'pro', 'canceled', 'ended',
        timestamptz '2026-10-25T00:00:00Z', false, 28, Tz + interval '1 second', false);
  assert d = 'applied', 'E1b: ' || d;
  d := public.apply_stripe_grant(null, u2, 'sE', 'c1', 'pro', 'active', 'active',
        timestamptz '2026-10-25T00:00:00Z', false, 28, Tz + interval '99 seconds', false);
  assert d = 'skipped_ended', 'E2 ended cannot resurrect with newest stamp: ' || d;
  raise notice 'K5 v1.3 PROOFS: ALL ASSERTIONS PASSED';
end $$;
rollback;
