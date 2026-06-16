-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · Expiring comp codes (Aspire push) + the Aspire4More code
-- ───────────────────────────────────────────────────────────────────────────
-- A comp code can now carry an `expires_at`. Redeeming it stamps the granted
-- entitlement's `current_period_end`, and tier resolution treats an expired comp
-- as starter — so a time-boxed grant (e.g. "Investor through 2026") auto-reverts
-- with no manual cleanup. Perpetual codes (expires_at NULL) are unchanged.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste → Run. (After 0001–0003.)
-- ───────────────────────────────────────────────────────────────────────────

alter table public.comp_codes add column if not exists expires_at timestamptz;

-- tier resolution now honors an entitlement's expiry (NULL = never expires).
create or replace function public.current_tier()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.tier
       from public.entitlements e
      where e.user_id = auth.uid()
        and e.status = 'active'
        and e.tier in ('investor','pro')
        and (e.current_period_end is null or e.current_period_end > now())
      limit 1),
    'starter');
$$;
revoke all on function public.current_tier() from public, anon;
grant execute on function public.current_tier() to authenticated;

-- redeem now rejects an expired code and stamps the grant's end date.
create or replace function public.redeem_comp_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_code  public.comp_codes%rowtype;
  v_label text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first to redeem a code.');
  end if;

  select * into v_code from public.comp_codes
   where code = upper(trim(p_code)) and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'That code isn''t valid.');
  end if;

  if v_code.expires_at is not null and now() >= v_code.expires_at then
    return jsonb_build_object('ok', false, 'msg', 'This code has expired.');
  end if;

  if not exists (select 1 from public.redemptions where code = v_code.code and user_id = v_user) then
    if v_code.max_redemptions is not null and v_code.redeemed_count >= v_code.max_redemptions then
      return jsonb_build_object('ok', false, 'msg', 'This code has reached its limit.');
    end if;
    insert into public.redemptions (code, user_id) values (v_code.code, v_user);
    update public.comp_codes set redeemed_count = redeemed_count + 1 where code = v_code.code;
  end if;

  -- Grant / refresh entitlement; current_period_end = the code's expiry (or NULL = perpetual).
  insert into public.entitlements (user_id, tier, source, status, current_period_end, updated_at)
  values (v_user, v_code.tier, 'comp', 'active', v_code.expires_at, now())
  on conflict (user_id) do update
    set tier               = excluded.tier,
        source             = 'comp',
        status             = 'active',
        current_period_end = excluded.current_period_end,
        updated_at         = now();

  v_label := initcap(v_code.tier);
  return jsonb_build_object('ok', true, 'tier', v_code.tier, 'msg', 'Unlocked ' || v_label || '.');
end;
$$;
revoke all on function public.redeem_comp_code(text) from public, anon;
grant execute on function public.redeem_comp_code(text) to authenticated;

-- ── The Aspire community push code: Investor, 12 redemptions, through end of 2026.
insert into public.comp_codes (code, tier, active, max_redemptions, expires_at) values
  ('ASPIRE4MORE-INVESTOR', 'investor', true, 12, '2026-12-31T23:59:59Z')
on conflict (code) do update
  set tier = excluded.tier, active = excluded.active,
      max_redemptions = excluded.max_redemptions, expires_at = excluded.expires_at;
