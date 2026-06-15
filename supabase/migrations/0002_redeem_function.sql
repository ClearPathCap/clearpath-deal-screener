-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · Phase 1: server-side comp-code redemption
-- ───────────────────────────────────────────────────────────────────────────
-- A SECURITY DEFINER function so the app can redeem a code WITHOUT an edge
-- function and WITHOUT the secret key. It runs with elevated rights (bypassing
-- RLS) to validate the code, enforce its cap, record the redemption, and grant
-- the entitlement — but it only ever acts for the signed-in caller (auth.uid()).
--
-- The website calls it with: supabase.rpc('redeem_comp_code', { p_code })
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query → paste → Run.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.redeem_comp_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_code  public.comp_codes%rowtype;
  v_label text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first to redeem a code.');
  end if;

  select * into v_code
    from public.comp_codes
   where code = upper(trim(p_code)) and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'That code isn''t valid.');
  end if;

  -- New redemption? (idempotent — re-redeeming your own code just re-grants)
  if not exists (
        select 1 from public.redemptions
         where code = v_code.code and user_id = v_user) then

    -- Enforce the cap (null max_redemptions = unlimited)
    if v_code.max_redemptions is not null
       and v_code.redeemed_count >= v_code.max_redemptions then
      return jsonb_build_object('ok', false, 'msg', 'This code has reached its limit.');
    end if;

    insert into public.redemptions (code, user_id) values (v_code.code, v_user);
    update public.comp_codes
       set redeemed_count = redeemed_count + 1
     where code = v_code.code;
  end if;

  -- Grant / refresh the entitlement (one row per user)
  insert into public.entitlements (user_id, tier, source, status, updated_at)
  values (v_user, v_code.tier, 'comp', 'active', now())
  on conflict (user_id) do update
    set tier       = excluded.tier,
        source     = 'comp',
        status     = 'active',
        updated_at = now();

  v_label := initcap(v_code.tier);
  return jsonb_build_object('ok', true, 'tier', v_code.tier, 'msg', 'Unlocked ' || v_label || '.');
end;
$$;

-- Only signed-in users may call it; never anon or the public role.
revoke all on function public.redeem_comp_code(text) from public, anon;
grant execute on function public.redeem_comp_code(text) to authenticated;
