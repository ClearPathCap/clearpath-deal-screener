-- ─── 0010 · K-1 canonical reconciliation: Aspire hardening ───────────────────
-- Encodes the ALREADY-LIVE governed state so no future migration/deploy can
-- overwrite it. Applying this on the live database is a semantic no-op (the
-- function body matches the live definition verbatim; the guarded top-up
-- inserts nothing where all 25 aspire rows already exist).
--
-- Governed state (rulings resolved 2026-08-25):
--   • Aspire capacity = 25 (rows 13–25 topped up additively below).
--   • Aspire expiry FORCED to timestamptz '2027-01-01T10:00:00Z' — INTENTIONAL
--     AND EXACT, do not normalize to 00:00:00Z: the extra hours guarantee
--     "through December 31, 2026" is never cut short in any U.S. timezone
--     (10:00Z = end of Dec 31 in UTC-10).
--   • The caller cannot override Aspire expiry (0008 honored a caller value).
--   • Exhaustion/capacity message reads 25/10/10.
-- Explicitly UNCHANGED: generic_investor/generic_pro expiry (caller-supplied;
-- K-2 out of scope), generic capacity, qa pool law, hash-at-rest, single-use
-- redemption, slot accounting mechanism, DEFINER/search_path/owner-only ACL.

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

-- Aspire pool top-up 12 → 25 (owner ruling; live already holds 25).
-- Additive and idempotent: inserts only missing slot numbers, preserves
-- existing rows, no-op where all 25 exist.
insert into public.campaign_slots (pool, slot_no, state)
select 'aspire', n, 'available'
  from generate_series(13, 25) as n
 where not exists (select 1 from public.campaign_slots s
                    where s.pool = 'aspire' and s.slot_no = n);
