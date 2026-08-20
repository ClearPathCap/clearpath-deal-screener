-- ───────────────────────────────────────────────────────────────────────────
-- Wave 5 · LOCAL-ONLY verification suite (plan v1.1 C-10 / Phase-4 pin 10).
-- Run against a LOCAL Supabase/Postgres stack (supabase start, or any local
-- Postgres with the auth schema stubbed) AFTER applying 0001–0009.
--
--   NEVER run against the live project. Everything here runs inside ONE
--   transaction and ends with ROLLBACK — zero persistent state even locally.
--
-- Covers: §5.1 grant-source cases A–G via effective_tier_for() · comp-code
-- atomic one-time claim · campaign-slot issue/rotate/redeem accounting · QA
-- pool isolation · test/live mode isolation · grace predicate · stripe_events
-- claim machine · checkout_attempts machine (incl. the pin-1 'creating'
-- protection) · SECURITY DEFINER privilege posture.
--
-- What this file deliberately does NOT cover: redeem_comp_code()'s auth.uid()
-- resolution (needs a real authenticated session — covered in Phase 6 against
-- the deployed project with synthetic identities) and true multi-connection
-- races (row-lock semantics make the guarded UPDATE atomic by construction;
-- the two-session script in supabase/tests/concurrency_notes.md exercises it).
-- ───────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  v_code  text;
  v_code2 text;
  v_hash  text;
  v_grant uuid;
  v_grant2 uuid;
  v_out   text;
  v_j     jsonb;
  n int;
begin
  -- Local fixture users (auth.users exists in the local stack).
  insert into auth.users (id, email) values (u1, 'w5-local-a@example.test');
  insert into auth.users (id, email) values (u2, 'w5-local-b@example.test');

  -- Zero-grant baseline (pins the Phase-5-caught empty-aggregate defect: a
  -- user with NO grants must be starter, never investor).
  assert public.effective_tier_for(u1) = 'starter', 'baseline: zero grants = starter';

  -- ── §5.1 cases A–G via the resolver core ───────────────────────────────────
  -- Case A: Investor comp + Stripe Pro → pro
  insert into public.entitlement_grants (user_id, tier, source, purpose, status)
  values (u1, 'investor', 'comp', 'business', 'active');
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, livemode, stripe_subscription_id, provider_status, current_period_end)
  values (u1, 'pro', 'stripe', 'business', 'active', false, 'sub_A', 'active', now() + interval '30 days');
  assert public.effective_tier_for(u1) = 'pro', 'A: investor comp + stripe pro should resolve pro';

  -- Case E: Stripe cancellation while comp remains → investor (not starter)
  update public.entitlement_grants set status = 'ended', provider_status = 'canceled'
   where stripe_subscription_id = 'sub_A';
  assert public.effective_tier_for(u1) = 'investor', 'E: ending stripe must reveal the comp, not starter';

  -- Case G: resubscription (new sub id) → pro again; comp untouched
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, livemode, stripe_subscription_id, provider_status, current_period_end)
  values (u1, 'pro', 'stripe', 'business', 'active', false, 'sub_B', 'active', now() + interval '30 days');
  assert public.effective_tier_for(u1) = 'pro', 'G: resubscribe restores pro';
  assert (select count(*) from public.entitlement_grants where user_id = u1 and source = 'comp' and status = 'active') = 1,
    'G: comp row untouched by stripe lifecycle';

  -- Case F: comp revocation while Stripe stays → pro; history preserved
  update public.entitlement_grants set status = 'revoked', revoked_at = now()
   where user_id = u1 and source = 'comp';
  assert public.effective_tier_for(u1) = 'pro', 'F: revoking comp must not disturb stripe';

  -- Case B: Pro comp + Stripe Investor → pro
  insert into public.entitlement_grants (user_id, tier, source, purpose, status)
  values (u2, 'pro', 'comp', 'business', 'active');
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, livemode, stripe_subscription_id, provider_status, current_period_end)
  values (u2, 'investor', 'stripe', 'business', 'active', false, 'sub_C', 'active', now() + interval '30 days');
  assert public.effective_tier_for(u2) = 'pro', 'B: pro comp outranks stripe investor';

  -- Case C/D analogue: second, lower comp grant coexists; pro still wins; ending
  -- the pro comp reveals the investor grant.
  insert into public.entitlement_grants (user_id, tier, source, purpose, status)
  values (u2, 'investor', 'comp', 'business', 'active');
  assert public.effective_tier_for(u2) = 'pro', 'C/D: multiple comps coexist, max wins';
  update public.entitlement_grants set status = 'revoked', revoked_at = now()
   where user_id = u2 and source = 'comp' and tier = 'pro';
  update public.entitlement_grants set status = 'ended'
   where stripe_subscription_id = 'sub_C';
  assert public.effective_tier_for(u2) = 'investor', 'D: revoking pro comp reveals investor comp';

  -- Expiry: an expired comp reads starter (period predicate)
  update public.entitlement_grants
     set current_period_end = now() - interval '1 second'
   where user_id = u2 and source = 'comp' and status = 'active';
  update public.entitlement_grants set status = 'ended' where user_id = u2 and source = 'stripe';
  assert public.effective_tier_for(u2) = 'starter', 'expiry: expired comp falls to starter';

  -- ── grace predicate (spec §4): grace ignores current_period_end, honors grace_until
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, provider_status,
         current_period_end, grace_until, livemode, stripe_subscription_id)
  values (u2, 'pro', 'stripe', 'business', 'grace', 'past_due',
          now() - interval '1 day', now() + interval '10 days', false, 'sub_D');
  assert public.effective_tier_for(u2) = 'pro', 'grace: entitled past period end while grace_until holds';
  update public.entitlement_grants set grace_until = now() - interval '1 second'
   where stripe_subscription_id = 'sub_D';
  assert public.effective_tier_for(u2) = 'starter', 'grace: ceiling ends access';
  update public.entitlement_grants set status = 'ended' where stripe_subscription_id = 'sub_D';

  -- ── mode isolation (C-8): a test-mode grant cannot entitle live mode ────────
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, livemode, stripe_subscription_id, provider_status, current_period_end)
  values (u2, 'pro', 'stripe', 'business', 'active', false, 'sub_E', 'active', now() + interval '30 days');
  assert public.effective_tier_for(u2) = 'pro', 'mode: test grant entitles in test mode';
  update public.payment_config set mode = 'live' where id = 1;
  assert public.effective_tier_for(u2) = 'starter', 'mode: test grant is INERT in live mode';
  update public.payment_config set mode = 'test' where id = 1;

  -- ── QA purpose isolation (pin 6): qa grants entitle only in test mode ───────
  insert into public.entitlement_grants (user_id, tier, source, purpose, status)
  values (u1, 'investor', 'comp', 'qa', 'active');
  update public.entitlement_grants set status = 'ended' where user_id = u1 and source = 'stripe';
  update public.entitlement_grants set status = 'revoked' where user_id = u1 and source = 'comp' and purpose = 'business';
  assert public.effective_tier_for(u1) = 'investor', 'qa: qa grant entitles in test mode';
  update public.payment_config set mode = 'live' where id = 1;
  assert public.effective_tier_for(u1) = 'starter', 'qa: qa grant is INERT in live mode';
  update public.payment_config set mode = 'test' where id = 1;

  -- ── comp issuance / slots / rotation / one-time claim ──────────────────────
  select code into v_code from public.issue_comp_code('generic_pro', null, 'local-test-1');
  assert v_code like 'CPC-G-%', 'issue: code format';
  assert (select count(*) from public.campaign_slots where pool = 'generic_pro' and state = 'issued') = 1,
    'issue: one slot issued';
  -- Rotation reuses the slot, consumes nothing.
  select code into v_code2 from public.rotate_comp_code('generic_pro', (
    select slot_no from public.campaign_slots where pool = 'generic_pro' and state = 'issued' limit 1));
  assert v_code2 <> v_code, 'rotate: new credential';
  assert (select count(*) from public.campaign_slots where pool = 'generic_pro' and state = 'issued') = 1,
    'rotate: still exactly one issued slot';
  assert (select active from public.comp_codes_v2 where code_hash = public.hash_comp_code(v_code)) = false,
    'rotate: old code deactivated';
  -- Atomic one-time claim: first claim wins, second gets zero rows.
  v_hash := public.hash_comp_code(v_code2);
  update public.comp_codes_v2 c set redeemed_count = c.redeemed_count + 1
   where c.code_hash = v_hash and c.active and (c.expires_at is null or now() < c.expires_at)
     and c.redeemed_count < c.max_redemptions;
  get diagnostics n = row_count;
  assert n = 1, 'claim: first claim wins';
  update public.comp_codes_v2 c set redeemed_count = c.redeemed_count + 1
   where c.code_hash = v_hash and c.active and (c.expires_at is null or now() < c.expires_at)
     and c.redeemed_count < c.max_redemptions;
  get diagnostics n = row_count;
  assert n = 0, 'claim: second claim of a one-time code gets nothing';

  -- Aspire pool default expiry = the ratified instant.
  select code into v_code from public.issue_comp_code('aspire', null, 'local-aspire');
  assert (select expires_at from public.comp_codes_v2 where code_hash = public.hash_comp_code(v_code))
         = timestamptz '2027-01-01T00:00:00Z', 'aspire: default expiry is the ratified instant';

  -- Pool ceilings: issuing beyond the seeded slots must fail.
  begin
    for n in 1..12 loop
      perform public.issue_comp_code('aspire', null, 'overflow-' || n);
    end loop;
    raise exception 'aspire ceiling did not enforce';
  exception when others then
    if sqlerrm like '%business inventory is fixed%' then null;
    else raise; end if;
  end;

  -- ── stripe_events claim machine (C-1 / pin 9: 3 states, no dead vocab) ─────
  v_out := public.claim_stripe_event('evt_1', 'customer.subscription.updated', false);
  assert v_out = 'claimed', 'events: first claim';
  v_out := public.claim_stripe_event('evt_1', 'customer.subscription.updated', false);
  assert v_out = 'busy', 'events: fresh processing is protected';
  perform public.fail_stripe_event('evt_1', 'simulated failure');
  v_out := public.claim_stripe_event('evt_1', 'customer.subscription.updated', false);
  assert v_out = 'claimed', 'events: failed is retryable';
  -- Mode-mismatch anomaly fails closed.
  -- Phase 4.1 #3 re-pin (stale Phase-4 assert corrected): identity is
  -- mode-scoped, so the same textual id in the OTHER mode legitimately claims
  -- its own independent ledger row — the old fail-closed anomaly branch is
  -- structurally impossible and removed.
  v_out := public.claim_stripe_event('evt_1', 'customer.subscription.updated', true);
  assert v_out = 'claimed', 'events: same id in the other mode claims independently';
  -- apply_stripe_grant: grant + terminal state in one transaction.
  perform public.claim_stripe_event('evt_2', 'customer.subscription.updated', false);
  perform public.apply_stripe_grant('evt_2', u1, 'sub_F', 'cus_F', 'investor', 'active', 'active',
                                    now() + interval '30 days', false, 28);
  assert (select state from public.stripe_events where event_id = 'evt_2') = 'processed',
    'events: apply marks processed';
  v_out := public.claim_stripe_event('evt_2', 'customer.subscription.updated', false);
  assert v_out = 'already_processed', 'events: processed is the only terminal skip';
  -- Idempotent re-apply (reconcile path, no event id): converges, no duplicate.
  perform public.apply_stripe_grant(null, u1, 'sub_F', 'cus_F', 'investor', 'active', 'active',
                                    now() + interval '30 days', false, 28);
  assert (select count(*) from public.entitlement_grants where stripe_subscription_id = 'sub_F') = 1,
    'apply: state-based upsert never duplicates a subscription grant';

  -- ── Phase 6 entry Task A: stale-processing reclaim branch (explicit proof) ──
  -- Source contract (0009 claim_stripe_event): a 'processing' row whose
  -- claimed_at is older than 10 minutes is reclaimable — the claim returns
  -- 'claimed', increments attempts, refreshes claimed_at, and the row stays
  -- 'processing'; an immediate second claim then sees a FRESH processing row
  -- and returns 'busy'. NOTE: now() is transaction-frozen, so the 11-minute
  -- backdate is evaluated against the same instant claimed_at is refreshed to.
  insert into public.stripe_events (event_id, livemode, type, state, attempts, claimed_at)
  values ('evt_STALE', false, 'customer.subscription.updated', 'processing', 3, now() - interval '11 minutes');
  v_out := public.claim_stripe_event('evt_STALE', 'customer.subscription.updated', false);
  assert v_out = 'claimed', 'stale-reclaim (c): stale processing row is reclaimed with ''claimed''';
  assert (select attempts from public.stripe_events where event_id = 'evt_STALE' and livemode = false) = 4,
    'stale-reclaim (d): attempts incremented N -> N+1 (3 -> 4)';
  assert (select claimed_at from public.stripe_events where event_id = 'evt_STALE' and livemode = false) = now(),
    'stale-reclaim (e): claimed_at refreshed to the claim instant';
  assert (select state from public.stripe_events where event_id = 'evt_STALE' and livemode = false) = 'processing',
    'stale-reclaim (f): state remains processing after reclaim';
  v_out := public.claim_stripe_event('evt_STALE', 'customer.subscription.updated', false);
  assert v_out = 'busy', 'stale-reclaim (g): immediate re-claim of the fresh row is busy';

  -- ── checkout_attempts machine (C-7 + pin 1) ────────────────────────────────
  update public.payment_config set checkout_enabled = false, allowlist = array[u1] where id = 1;
  -- Gate: u2 (not allowlisted) refused; u1 (allowlisted) proceeds.
  v_j := public.begin_checkout_attempt(u2, 'pro');
  assert v_j->>'outcome' = 'refused_gate', 'attempts: gate refuses non-allowlisted while disabled';
  -- Same-tier law: u1 currently has an active qa investor grant (test mode) —
  -- investor checkout refused, pro allowed.
  v_j := public.begin_checkout_attempt(u1, 'investor');
  assert v_j->>'outcome' = 'refused_same_tier', 'attempts: same-tier refused (C-5)';
  v_j := public.begin_checkout_attempt(u1, 'pro');
  assert v_j->>'outcome' = 'claimed', 'attempts: higher tier claimed';
  v_grant := (v_j->>'attempt_id')::uuid;
  -- pin 1: a fresh creating attempt is protected — racing caller gets busy.
  v_j := public.begin_checkout_attempt(u1, 'pro');
  assert v_j->>'outcome' = 'busy', 'attempts: fresh creating row is never superseded';
  -- finalize → open; next request converges on the same session.
  perform public.finalize_checkout_attempt(v_grant, 'cs_test_123');
  v_j := public.begin_checkout_attempt(u1, 'pro');
  assert v_j->>'outcome' = 'reuse' and v_j->>'session_id' = 'cs_test_123',
    'attempts: open attempt is reused, one live purchase intent';
  -- expiry recovery: stale open attempt is reclaimed by the next request.
  update public.checkout_attempts set expires_at = now() - interval '1 minute' where id = v_grant;
  v_j := public.begin_checkout_attempt(u1, 'pro');
  assert v_j->>'outcome' = 'claimed', 'attempts: expired attempt yields a NEW attempt';
  assert (v_j->>'attempt_id')::uuid <> v_grant, 'attempts: new logical attempt = new id (new idempotency key)';

  -- ── Phase 4.1 corrections ──────────────────────────────────────────────────
  -- Harness hygiene: end every still-valid u2 grant from the sections above so
  -- the fail-closed asserts below start from a provably grantless state.
  update public.entitlement_grants set status = 'ended' where user_id = u2 and status in ('active','grace');
  assert public.effective_tier_for(u2) = 'starter', '4.1 baseline: u2 grantless before fail-closed checks';
  -- (#2) NULL Stripe period must FAIL CLOSED — never perpetual Stripe access.
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, livemode, stripe_subscription_id, provider_status)
  values (u2, 'pro', 'stripe', 'business', 'active', false, 'sub_NULLP', 'active');
  -- The shape check permits NULL period (historical/ended rows) — the RESOLVER must not honor it.
  assert public.effective_tier_for(u2) = 'starter', '4.1#2: active stripe with NULL period is NOT entitled';
  update public.entitlement_grants set status = 'ended' where stripe_subscription_id = 'sub_NULLP';
  -- (#2) grace with NULL grace_until is not entitled.
  insert into public.entitlement_grants (user_id, tier, source, purpose, status, livemode, stripe_subscription_id, provider_status, current_period_end)
  values (u2, 'pro', 'stripe', 'business', 'grace', false, 'sub_NULLG', 'past_due', now() + interval '5 days');
  assert public.effective_tier_for(u2) = 'starter', '4.1#2: grace with NULL grace_until is NOT entitled';
  update public.entitlement_grants set status = 'ended' where stripe_subscription_id = 'sub_NULLG';
  -- (#2) shape constraints: stripe without identity/mode is unrepresentable;
  -- comp cannot masquerade as stripe.
  begin
    insert into public.entitlement_grants (user_id, tier, source, purpose, status)
    values (u2, 'pro', 'stripe', 'business', 'active');
    raise exception '4.1#2: eg_stripe_shape did not enforce';
  exception when check_violation then null;
  end;
  begin
    insert into public.entitlement_grants (user_id, tier, source, purpose, status, stripe_subscription_id, livemode)
    values (u2, 'pro', 'comp', 'business', 'active', 'sub_MASQ', false);
    raise exception '4.1#2: eg_comp_shape did not enforce';
  exception when check_violation then null;
  end;
  -- (#3) mode-scoped EVENT identity: same textual id coexists across modes.
  v_out := public.claim_stripe_event('evt_X', 'customer.subscription.updated', false);
  assert v_out = 'claimed', '4.1#3: test-mode evt_X claims';
  v_out := public.claim_stripe_event('evt_X', 'customer.subscription.updated', true);
  assert v_out = 'claimed', '4.1#3: live-mode evt_X claims independently (two ledger rows)';
  assert (select count(*) from public.stripe_events where event_id = 'evt_X') = 2,
    '4.1#3: test/live event rows coexist';
  -- (#3) mode-scoped SUBSCRIPTION grants: same sub id in both modes = two rows.
  perform public.apply_stripe_grant(null, u2, 'sub_MODE', 'cus_T', 'investor', 'active', 'active',
                                    now() + interval '30 days', false, 28);
  perform public.apply_stripe_grant(null, u2, 'sub_MODE', 'cus_L', 'investor', 'active', 'active',
                                    now() + interval '30 days', true, 28);
  assert (select count(*) from public.entitlement_grants where stripe_subscription_id = 'sub_MODE') = 2,
    '4.1#3: test/live subscription grants do not collide';
  update public.entitlement_grants set status = 'ended' where stripe_subscription_id = 'sub_MODE';
  -- (#3) cross-mode attempts: an open TEST attempt must not block a LIVE attempt.
  update public.payment_config set checkout_enabled = false, allowlist = array[u2] where id = 1;
  update public.entitlement_grants set status = 'ended' where user_id = u2 and status in ('active','grace');
  v_j := public.begin_checkout_attempt(u2, 'pro');
  assert v_j->>'outcome' = 'claimed', '4.1#3: test-mode attempt claims';
  update public.payment_config set mode = 'live' where id = 1;
  v_j := public.begin_checkout_attempt(u2, 'pro');
  assert v_j->>'outcome' = 'claimed', '4.1#3: live-mode attempt claims DESPITE the open test attempt';
  v_j := public.begin_checkout_attempt(u2, 'pro');
  assert v_j->>'outcome' = 'busy', '4.1#3: same-mode race still converges (busy on fresh creating)';
  update public.payment_config set mode = 'test' where id = 1;
  -- Redemption-created comp rows always carry the credential hash (the
  -- grandfather clause is for the legacy copy only).
  assert not exists (select 1 from public.redemptions_v2 r
                      join public.entitlement_grants g on g.id = r.grant_id
                     where g.comp_code_hash is null),
    '4.1: every redemption-created grant carries its code hash';

  -- ── privilege posture (pin 4) ──────────────────────────────────────────────
  assert not has_function_privilege('anon', 'public.issue_comp_code(text,timestamptz,text)', 'execute'),
    'priv: anon cannot issue';
  assert not has_function_privilege('authenticated', 'public.issue_comp_code(text,timestamptz,text)', 'execute'),
    'priv: authenticated cannot issue';
  assert not has_function_privilege('authenticated', 'public.apply_stripe_grant(text,uuid,text,text,text,text,text,timestamptz,boolean,integer)', 'execute'),
    'priv: authenticated cannot apply grants';
  assert not has_function_privilege('authenticated', 'public.begin_checkout_attempt(uuid,text)', 'execute'),
    'priv: authenticated cannot call attempt helpers directly';
  assert has_function_privilege('authenticated', 'public.redeem_comp_code(text)', 'execute'),
    'priv: authenticated CAN redeem';
  assert not has_function_privilege('anon', 'public.redeem_comp_code(text)', 'execute'),
    'priv: anon cannot redeem';
  -- Phase 4.1 (#1): service_role matrix — Edge-called helpers YES, owner-only NO.
  assert has_function_privilege('service_role', 'public.claim_stripe_event(text,text,boolean)', 'execute'),
    '4.1#1: service_role CAN claim events';
  assert has_function_privilege('service_role', 'public.apply_stripe_grant(text,uuid,text,text,text,text,text,timestamptz,boolean,integer)', 'execute'),
    '4.1#1: service_role CAN apply grants';
  assert has_function_privilege('service_role', 'public.fail_stripe_event(text,text)', 'execute'),
    '4.1#1: service_role CAN fail events';
  assert has_function_privilege('service_role', 'public.begin_checkout_attempt(uuid,text)', 'execute'),
    '4.1#1: service_role CAN begin attempts';
  assert has_function_privilege('service_role', 'public.finalize_checkout_attempt(uuid,text)', 'execute'),
    '4.1#1: service_role CAN finalize attempts';
  assert has_function_privilege('service_role', 'public.expire_checkout_attempt(uuid,text)', 'execute'),
    '4.1#1: service_role CAN expire attempts';
  assert has_function_privilege('service_role', 'public.upsert_stripe_customer(uuid,text,text)', 'execute'),
    '4.1#1: service_role CAN upsert customer mapping';
  assert not has_function_privilege('service_role', 'public.issue_comp_code(text,timestamptz,text)', 'execute'),
    '4.1#1: service_role can NOT issue business codes';
  assert not has_function_privilege('service_role', 'public.rotate_comp_code(text,integer)', 'execute'),
    '4.1#1: service_role can NOT rotate codes';
  assert not has_function_privilege('service_role', 'public.revoke_grant(uuid)', 'execute'),
    '4.1#1: service_role can NOT revoke grants';
  assert not has_function_privilege('service_role', 'public.comp_code_status()', 'execute'),
    '4.1#1: service_role can NOT read campaign reporting';
  assert not has_function_privilege('service_role', 'public.effective_tier_for(uuid)', 'execute'),
    '4.1#1: service_role can NOT call the resolver directly';
  assert has_function_privilege('authenticated', 'public.current_tier()', 'execute'),
    'priv: authenticated CAN read current_tier';
  assert not has_function_privilege('anon', 'public.current_tier()', 'execute'),
    'priv: anon cannot read current_tier';

  raise notice 'W5 LOCAL VERIFICATION: ALL ASSERTIONS PASSED';
end $$;

rollback;
