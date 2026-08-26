-- ─── 0013 · K-2 generic comp-code expiry law ─────────────────────────────────
-- K-2A proved both generic pools are pristine (0 issued, 0 redeemed, 0 grants,
-- 10/10 available each), so this is a forward-only rule with no backfill.
--
-- GOVERNED RULING (asymmetric by design):
--   generic_investor — an explicit expiry is REQUIRED. NULL raises. A supplied
--                      expiry must be strictly in the future at issuance time.
--   generic_pro      — MAY be permanent: NULL is governed, valid, and keeps the
--                      existing perpetual comp-entitlement behavior (redeem
--                      accepts NULL forever → grant carries NULL
--                      current_period_end → resolver treats comp+NULL as valid
--                      indefinitely). A supplied expiry must be strictly future.
--   aspire           — UNCHANGED: forced to timestamptz '2027-01-01T10:00:00Z'
--                      (K-1 closed; not reopened here).
--   qa               — unchanged (label-driven tier, NULL expiry, no slot).
--
-- The future-date rule is enforced in the issuance function because it is
-- time-relative; a CHECK constraint cannot express it. The at-rest CHECK below
-- covers only the time-independent half — that a generic_investor row can never
-- exist with a NULL expiry, whatever path attempts to create it.
--
-- Preserved verbatim: slot accounting (claim under FOR UPDATE SKIP LOCKED, then
-- state='issued' with current_code_hash), hash-at-rest, single-use
-- (max_redemptions = 1), labels, tier mapping, 25/10/10 capacity messaging,
-- owner-only privilege posture (SECURITY DEFINER, search_path='', revoked from
-- every API role).

create or replace function public.issue_comp_code(
  p_pool text, p_expires timestamptz default null, p_label text default null)
returns table (code text, pool text, slot_no integer, tier text, expires_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tier    text;
  v_expires timestamptz := p_expires;
  v_slot    integer;
  v_plain   text;
  v_hash    text;
begin
  if p_pool not in ('aspire','generic_investor','generic_pro','qa') then
    raise exception 'unknown pool %', p_pool;
  end if;

  v_tier := case p_pool
              when 'aspire' then 'investor'
              when 'generic_investor' then 'investor'
              when 'generic_pro' then 'pro'
              else null end;
  if p_pool = 'qa' then
    -- QA codes name their tier in the label convention: 'qa:investor'/'qa:pro'.
    v_tier := case when p_label like '%pro%' then 'pro' else 'investor' end;
  end if;
  if p_pool = 'aspire' then
    -- K-1: forced, never caller-overridable (governed exact instant).
    v_expires := timestamptz '2027-01-01T10:00:00Z';
  end if;

  -- K-2: generic expiry law. Investor must be dated; Pro may be permanent;
  -- either, when dated, must expire strictly after the issuance instant.
  if p_pool = 'generic_investor' and p_expires is null then
    raise exception 'generic_investor requires an explicit expiry — permanent investor codes are not governed';
  end if;
  if p_pool in ('generic_investor','generic_pro')
     and p_expires is not null and p_expires <= now() then
    raise exception 'generic comp expiry must be strictly in the future (got %)', p_expires;
  end if;

  if p_pool <> 'qa' then
    select s.slot_no into v_slot
      from public.campaign_slots s
     where s.pool = p_pool and s.state = 'available'
     order by s.slot_no
     limit 1
     for update skip locked;
    if v_slot is null then
      raise exception 'no available % slot — business inventory is fixed at 25/10/10 by owner ruling', p_pool;
    end if;
  end if;

  v_plain := 'CPC-' || upper(left(p_pool, 1)) || '-' ||
             upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_hash  := public.hash_comp_code(v_plain);

  insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
  values (v_hash, v_tier, p_pool, true, 1, v_expires, p_label);

  if p_pool <> 'qa' then
    update public.campaign_slots s
       set state = 'issued', current_code_hash = v_hash, updated_at = now()
     where s.pool = p_pool and s.slot_no = v_slot;
  end if;

  return query select v_plain, p_pool, v_slot, v_tier, v_expires;
end;
$$;
revoke all on function public.issue_comp_code(text, timestamptz, text) from public, anon, authenticated, service_role;

-- At-rest half of the law: no generic_investor code may exist without an
-- expiry, by ANY path. Time-independent, so a CHECK is safe here; the
-- strictly-future rule stays in the function. Both generic pools are empty, so
-- this validates against zero rows.
alter table public.comp_codes_v2
  add constraint cc2_generic_investor_requires_expiry
  check (pool <> 'generic_investor' or expires_at is not null);
