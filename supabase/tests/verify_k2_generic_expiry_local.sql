-- ───────────────────────────────────────────────────────────────────────────
-- K-2 · generic comp-code expiry law — LOCAL-ONLY suite (migration 0013).
-- Run against a LOCAL stack AFTER applying 0001–0013. One transaction, ends in
-- ROLLBACK — zero persistent state. NEVER run against the live project.
--
-- Governed asymmetry: generic_investor MUST carry an explicit, strictly-future
-- expiry; generic_pro MAY be permanent (NULL) and keeps the perpetual comp
-- entitlement behavior, but a supplied expiry must also be strictly future.
-- Aspire stays forced to 2027-01-01T10:00:00Z (K-1, not reopened).
-- ───────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  u uuid := gen_random_uuid();
  v_exp timestamptz;
  v_code text;
  v_hash text;
  n integer;
  v_future timestamptz := now() + interval '90 days';
begin
  insert into auth.users (id, email) values (u, 'k2-local@example.test');

  -- ══ 1. generic_investor + NULL expiry RAISES ═══════════════════════════════
  begin
    perform public.issue_comp_code('generic_investor', null, 'k2-gi-null');
    raise exception 'K2-1 FAIL: generic_investor NULL expiry was accepted';
  exception when others then
    if position('generic_investor requires an explicit expiry' in sqlerrm) = 0 then raise; end if;
  end;

  -- ══ 2. generic_investor + past/present expiry RAISES ═══════════════════════
  begin
    perform public.issue_comp_code('generic_investor', now() - interval '1 day', 'k2-gi-past');
    raise exception 'K2-2a FAIL: generic_investor past expiry was accepted';
  exception when others then
    if position('strictly in the future' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.issue_comp_code('generic_investor', now(), 'k2-gi-now');
    raise exception 'K2-2b FAIL: generic_investor present expiry was accepted';
  exception when others then
    if position('strictly in the future' in sqlerrm) = 0 then raise; end if;
  end;

  -- ══ 3. generic_investor + future expiry round-trips EXACTLY ════════════════
  select t.expires_at, t.tier into v_exp, v_code
    from public.issue_comp_code('generic_investor', v_future, 'k2-gi-ok') t;
  assert v_exp = v_future, 'K2-3a: generic_investor future expiry round-trips exactly';
  assert v_code = 'investor', 'K2-3b: generic_investor tier mapping intact';
  select expires_at into v_exp from public.comp_codes_v2 where label = 'k2-gi-ok';
  assert v_exp = v_future, 'K2-3c: the exact expiry is what is stored at rest';

  -- ══ 4. generic_pro + NULL expiry remains NULL — governed PERMANENT ═════════
  select t.code, t.expires_at, t.tier into v_code, v_exp, v_hash
    from public.issue_comp_code('generic_pro', null, 'k2-gp-null') t;
  assert v_exp is null, 'K2-4a: generic_pro NULL expiry is preserved (governed permanent)';
  assert v_hash = 'pro', 'K2-4b: generic_pro tier mapping intact';
  select expires_at into v_exp from public.comp_codes_v2 where label = 'k2-gp-null';
  assert v_exp is null, 'K2-4c: permanence persists at rest';

  -- ══ 5. generic_pro + past/present explicit expiry RAISES ═══════════════════
  begin
    perform public.issue_comp_code('generic_pro', now() - interval '1 hour', 'k2-gp-past');
    raise exception 'K2-5a FAIL: generic_pro past expiry was accepted';
  exception when others then
    if position('strictly in the future' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.issue_comp_code('generic_pro', now(), 'k2-gp-now');
    raise exception 'K2-5b FAIL: generic_pro present expiry was accepted';
  exception when others then
    if position('strictly in the future' in sqlerrm) = 0 then raise; end if;
  end;

  -- ══ 6. generic_pro + future expiry round-trips EXACTLY ═════════════════════
  select t.expires_at into v_exp
    from public.issue_comp_code('generic_pro', v_future, 'k2-gp-ok') t;
  assert v_exp = v_future, 'K2-6: generic_pro future expiry round-trips exactly';

  -- ══ 7. Aspire remains forced (K-1 untouched; NULL and override both) ═══════
  select t.expires_at into v_exp from public.issue_comp_code('aspire', null, 'k2-asp-null') t;
  assert v_exp = timestamptz '2027-01-01T10:00:00Z', 'K2-7a: aspire NULL still forced to the governed instant';
  select t.expires_at into v_exp
    from public.issue_comp_code('aspire', timestamptz '2030-01-01T00:00:00Z', 'k2-asp-override') t;
  assert v_exp = timestamptz '2027-01-01T10:00:00Z', 'K2-7b: aspire caller override still ignored';
  -- and a PAST aspire expiry is still accepted-and-overridden, never raised:
  select t.expires_at into v_exp
    from public.issue_comp_code('aspire', now() - interval '1 day', 'k2-asp-past') t;
  assert v_exp = timestamptz '2027-01-01T10:00:00Z',
    'K2-7c: the generic future-date rule does NOT leak into aspire';

  -- ══ 8. Generic slot accounting unchanged (10/10, one slot per issuance) ════
  select count(*) into n from public.campaign_slots where pool = 'generic_investor';
  assert n = 10, 'K2-8a: generic_investor pool is still 10 slots';
  select count(*) into n from public.campaign_slots where pool = 'generic_pro';
  assert n = 10, 'K2-8b: generic_pro pool is still 10 slots';
  select count(*) into n from public.campaign_slots where pool = 'generic_investor' and state = 'issued';
  assert n = 1, 'K2-8c: exactly one generic_investor slot consumed by the one successful issuance';
  select count(*) into n from public.campaign_slots where pool = 'generic_pro' and state = 'issued';
  assert n = 2, 'K2-8d: exactly two generic_pro slots consumed (NULL + future)';
  -- RAISED issuances consumed nothing: 4 generic failures above left no slots.
  select count(*) into n from public.campaign_slots
   where pool in ('generic_investor','generic_pro') and state = 'available';
  assert n = 17, 'K2-8e: refused issuances consumed no slot (20 - 3 issued = 17 available)';

  -- ══ 9. No cross-pool leakage ══════════════════════════════════════════════
  select count(*) into n from public.comp_codes_v2 where pool = 'aspire' and expires_at is null;
  assert n = 0, 'K2-9a: no aspire code is permanent';
  select count(*) into n from public.comp_codes_v2 where pool = 'generic_investor' and expires_at is null;
  assert n = 0, 'K2-9b: no generic_investor code is permanent';
  -- qa law untouched by K-2: NULL expiry still allowed, label-driven tier, no slot
  select t.expires_at, t.tier, t.slot_no into v_exp, v_code, n
    from public.issue_comp_code('qa', null, 'qa:pro-k2') t;
  assert v_exp is null and v_code = 'pro' and n is null, 'K2-9c: qa pool untouched by the generic rule';

  -- ══ 10. Permanent Pro comp still produces a perpetual entitlement ═════════
  -- The permanent Pro code's plaintext is deliberately unrecoverable (hash at
  -- rest), so bind the grant to its stored hash and assert what the resolver
  -- actually reads: a comp grant with a NULL period.
  select code_hash into v_hash from public.comp_codes_v2 where label = 'k2-gp-null';
  insert into public.entitlement_grants
        (user_id, tier, source, purpose, status, current_period_end, comp_code_hash)
  values (u, 'pro', 'comp', 'business', 'active', null, v_hash);
  assert public.effective_tier_for(u) = 'pro',
    'K2-10a: a permanent (NULL-period) Pro comp grant entitles';
  update public.payment_config set mode = 'live' where id = 1;
  assert public.effective_tier_for(u) = 'pro',
    'K2-10b: business-purpose comp permanence holds in LIVE mode too (unlike qa grants)';
  update public.payment_config set mode = 'test' where id = 1;

  raise notice 'K2 GENERIC EXPIRY SUITE: ALL ASSERTIONS PASSED';
end $$;

-- ══ At-rest CHECK: direct creation of a permanent generic_investor row is
--    rejected regardless of the issuance path used.
do $$
begin
  begin
    insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
    values ('k2-direct-hash', 'investor', 'generic_investor', true, 1, null, 'k2-direct');
    raise exception 'K2-CHECK FAIL: a permanent generic_investor row was accepted';
  exception when check_violation then
    raise notice 'K2 AT-REST CHECK: permanent generic_investor row rejected as governed';
  end;
end $$;

rollback;
