-- ───────────────────────────────────────────────────────────────────────────
-- Friendly comp codes — LOCAL-ONLY suite (migration 0015).
-- Run against a LOCAL stack AFTER applying 0001–0015. One transaction, ends in
-- ROLLBACK — zero persistent state. NEVER run against the live project.
--
-- Law under test: friendly <POOL>-XXXX-XXXX defaults (unambiguous alphabet);
-- optional vanity codes with a 10-alphanumeric floor and PK-enforced
-- uniqueness; forgiving redemption (case/space/dash-insensitive) via
-- hash_comp_code_v2 with a LEGACY-hash fallback so pre-0015 codes still
-- redeem; rotation shares the one canonical builder; every K-1/K-2 law and the
-- owner-only posture unchanged.
-- ───────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  v_code text;
  v_code2 text;
  v jsonb;
  v_exp timestamptz;
  n integer;
begin
  insert into auth.users (id, email) values
    (u1, 'ux1@example.test'), (u2, 'ux2@example.test'), (u3, 'ux3@example.test');

  -- ══ 1. friendly default format, per pool ═══════════════════════════════════
  select code, expires_at into v_code, v_exp from public.issue_comp_code('aspire', null, 'ux:aspire-1');
  assert v_code ~ '^ASPIRE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'F1a: aspire friendly format';
  assert v_exp = timestamptz '2027-01-01T10:00:00Z', 'F1b: K-1 forced expiry intact on friendly codes';
  -- The POOL WORD may legitimately contain I/O ('ASPIRE'); the ambiguity rule
  -- governs the RANDOM BODY only.
  assert substr(v_code, 8) !~ '[ILO01]', 'F1c: no ambiguous characters in the random body';

  -- ══ 2. forgiving redemption: lowercase, spaces, no dashes ══════════════════
  perform set_config('request.jwt.claim.sub', u1::text, true);
  v := public.redeem_comp_code(lower(replace(v_code, '-', ' ')));
  assert (v->>'ok')::boolean, 'F2a: lowercase+spaces redeems';
  assert v->>'tier' = 'investor', 'F2b: aspire tier mapping intact';
  select count(*) into n from public.campaign_slots where pool = 'aspire' and state = 'redeemed';
  assert n = 1, 'F2c: slot consumed exactly once';

  -- ══ 3. vanity codes: owner wording, floor, uniqueness ══════════════════════
  select code into v_code from public.issue_comp_code('aspire', null, 'ux:aspire-2', 'Aspire-Investor-TestFive');
  assert v_code = 'Aspire-Investor-TestFive', 'F3a: vanity returns the owner''s wording';
  begin
    perform public.issue_comp_code('aspire', null, 'ux:aspire-dup', 'aspire investor testfive');
    raise exception 'F3b FAIL: normalization-equal vanity accepted twice';
  exception when others then
    if position('already in use' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.issue_comp_code('aspire', null, 'ux:aspire-short', 'Ryan-1');
    raise exception 'F3c FAIL: sub-floor vanity accepted';
  exception when others then
    if position('too short' in sqlerrm) = 0 then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', u2::text, true);
  v := public.redeem_comp_code('  aspire INVESTOR test-five ');
  assert (v->>'ok')::boolean, 'F3d: sloppy vanity input redeems';

  -- ══ 4. LEGACY pre-0015 codes still redeem (dual-hash fallback) ═════════════
  -- Simulate an old row exactly as 0013 stored it: legacy hash (upper/trim,
  -- dashes significant) of the old CPC- format. qa pool: no slot involvement.
  insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
  values (public.hash_comp_code('CPC-Q-ABCDEF1234567890ABCD'), 'investor', 'qa', true, 1, null, 'qa:legacy-compat');
  perform set_config('request.jwt.claim.sub', u3::text, true);
  v := public.redeem_comp_code('cpc-q-abcdef1234567890abcd');
  assert (v->>'ok')::boolean, 'F4a: legacy-format code still redeems (case-insensitive as before)';
  -- The legacy normalization kept dashes significant; the v2 path must not
  -- have silently changed what legacy rows match on their own terms.
  assert (select count(*) from public.redemptions_v2 r
           join public.comp_codes_v2 c on c.code_hash = r.code_hash
          where c.label = 'qa:legacy-compat') = 1, 'F4b: exactly one legacy redemption row';

  -- ══ 5. non-oracling refusals unchanged ═════════════════════════════════════
  v := public.redeem_comp_code('TOTALLY-MADE-UP-CODE');
  assert (v->>'ok')::boolean = false and v->>'msg' = 'That code isn''t valid.', 'F5: one generic refusal';

  -- ══ 6. rotation uses the same builder: friendly + vanity ═══════════════════
  select code into v_code from public.issue_comp_code('generic_pro', null, 'ux:rot-1');
  select s.slot_no into n from public.campaign_slots s where s.pool = 'generic_pro' and s.state = 'issued' limit 1;
  select code into v_code2 from public.rotate_comp_code('generic_pro', n);
  assert v_code2 ~ '^PRO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'F6a: rotation mints friendly format';
  assert v_code2 <> v_code, 'F6b: rotation is a new credential';
  select code into v_code2 from public.rotate_comp_code('generic_pro', n, 'Pro-Partner-Replacement');
  assert v_code2 = 'Pro-Partner-Replacement', 'F6c: rotation accepts vanity wording';

  -- ══ 7. K-2 laws hold through the 4-arg signature ═══════════════════════════
  begin
    perform public.issue_comp_code('generic_investor', null, 'ux:k2', 'Investor-Vanity-Check');
    raise exception 'F7 FAIL: generic_investor NULL expiry accepted via vanity path';
  exception when others then
    if position('requires an explicit expiry' in sqlerrm) = 0 then raise; end if;
  end;

  -- ══ 8. owner-only posture on every touched function ════════════════════════
  assert not has_function_privilege('authenticated', 'public.issue_comp_code(text, timestamptz, text, text)', 'execute'),
    'F8a: issue stays owner-only';
  assert not has_function_privilege('service_role', 'public.rotate_comp_code(text, integer, text)', 'execute'),
    'F8b: rotate stays owner-only';
  assert not has_function_privilege('anon', 'public.comp_code_plaintext(text, text)', 'execute'),
    'F8c: builder is owner-only';
  assert not has_function_privilege('authenticated', 'public.hash_comp_code_v2(text)', 'execute'),
    'F8d: v2 hash is owner-only';
  assert has_function_privilege('authenticated', 'public.redeem_comp_code(text)', 'execute'),
    'F8e: redeem stays authenticated';
  assert not has_function_privilege('anon', 'public.redeem_comp_code(text)', 'execute'),
    'F8f: redeem never anon';

  raise notice 'verify_comp_ux_local: ALL ASSERTIONS PASSED';
end $$;

rollback;
