-- ─── K-1 focused suite · Aspire hardening (run AFTER draft 0010 is applied) ──
-- BEGIN…ROLLBACK: leaves no state. Proves the provider-proven hardening:
-- aspire expiry is forced (caller cannot override), 25-slot capacity/message,
-- and that generic/qa behavior is byte-unchanged from 0008 law.
begin;

do $$
declare
  v_exp timestamptz;
  v_code text;
  v_n integer;
  v_msg text;
begin
  -- 1/2. Aspire: caller-supplied expiry is IGNORED — forced instant returned…
  select t.expires_at into v_exp
    from public.issue_comp_code('aspire', timestamptz '2028-06-01T00:00:00Z', 'k1-override-attempt') t;
  if v_exp <> timestamptz '2027-01-01T10:00:00Z' then
    raise exception 'K1-1 FAIL: aspire caller override not ignored (got %)', v_exp;
  end if;
  -- …and NULL gets the same forced instant.
  select t.expires_at into v_exp
    from public.issue_comp_code('aspire', null, 'k1-null') t;
  if v_exp <> timestamptz '2027-01-01T10:00:00Z' then
    raise exception 'K1-2 FAIL: aspire null-expiry not forced (got %)', v_exp;
  end if;

  -- 3. The forced value is what is AT REST, not just returned.
  select c.expires_at into v_exp from public.comp_codes_v2 c
   where c.label = 'k1-override-attempt';
  if v_exp <> timestamptz '2027-01-01T10:00:00Z' then
    raise exception 'K1-3 FAIL: stored aspire expiry differs (got %)', v_exp;
  end if;

  -- 4/5. generic_investor UNCHANGED: caller expiry honored; NULL stays NULL.
  select t.expires_at into v_exp
    from public.issue_comp_code('generic_investor', timestamptz '2028-06-01T00:00:00Z', 'k1-gi-exp') t;
  if v_exp <> timestamptz '2028-06-01T00:00:00Z' then
    raise exception 'K1-4 FAIL: generic_investor caller expiry not honored (got %)', v_exp;
  end if;
  select t.expires_at into v_exp
    from public.issue_comp_code('generic_investor', null, 'k1-gi-null') t;
  if v_exp is not null then
    raise exception 'K1-5 FAIL: generic_investor null expiry mutated (got %)', v_exp;
  end if;

  -- 6. generic_pro UNCHANGED: caller expiry honored.
  select t.expires_at into v_exp
    from public.issue_comp_code('generic_pro', timestamptz '2029-01-01T00:00:00Z', 'k1-gp-exp') t;
  if v_exp <> timestamptz '2029-01-01T00:00:00Z' then
    raise exception 'K1-6 FAIL: generic_pro caller expiry not honored (got %)', v_exp;
  end if;

  -- 7. qa pool UNCHANGED: label-driven tier, NULL expiry honored, no slot.
  select t.tier, t.expires_at into v_code, v_exp
    from public.issue_comp_code('qa', null, 'qa:pro-k1') t;
  if v_code <> 'pro' or v_exp is not null then
    raise exception 'K1-7 FAIL: qa law drifted (tier %, exp %)', v_code, v_exp;
  end if;

  -- 8. Aspire pool is 25 slots after the guarded top-up.
  select count(*) into v_n from public.campaign_slots where pool = 'aspire';
  if v_n <> 25 then
    raise exception 'K1-8 FAIL: aspire pool is % slots, expected 25', v_n;
  end if;

  -- 9. Ceiling + message: consume the remaining aspire slots (2 used above),
  --    then the next issuance must refuse with the 25/10/10 message.
  for v_n in 1..23 loop
    perform public.issue_comp_code('aspire', null, 'k1-drain-' || v_n);
  end loop;
  begin
    perform public.issue_comp_code('aspire', null, 'k1-overflow');
    raise exception 'K1-9 FAIL: aspire ceiling did not enforce at 25';
  exception when others then
    v_msg := sqlerrm;
    if position('25/10/10' in v_msg) = 0 then
      raise exception 'K1-9 FAIL: exhaustion message lacks 25/10/10 (%).', v_msg;
    end if;
  end;

  raise notice 'K1 ASPIRE SUITE: ALL 9 ASSERTIONS PASSED';
end $$;

rollback;
