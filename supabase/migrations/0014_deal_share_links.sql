-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · UX wave finding 5: server-backed read-only deal share links
-- ───────────────────────────────────────────────────────────────────────────
-- The share message promises "view the deal in DealFit", so the link must
-- identify an actual deal. Design (smallest durable shape):
--
--   · one row per (owner, deal): an OPAQUE 128-bit token — never a sequential
--     or enumerable id — pointing at a deal id inside the owner's user_pipeline
--     JSONB. Idempotent: re-sharing the same deal returns the same token.
--   · the shared view reads the CURRENT saved deal at fetch time (live
--     semantics, per dispatch preference): the owner edits and saves → the
--     recipient sees the latest saved state on next load.
--   · deleting the deal kills the link (the JSONB lookup misses → not_found),
--     and revoke_deal_share gives the owner an explicit kill switch — no
--     uncontrolled permanent exposure path exists.
--   · the reader RPC returns a WHITELISTED projection. Notes are deliberately
--     excluded (seller/negotiation intel is private); no account identifier,
--     email, or user id ever leaves the server.
--   · recipients need no account: get_shared_deal is executable by anon.
--
-- Additive only: no existing table, function, policy, or grant is modified.
-- Rollback posture: drop function public.get_shared_deal(text) /
-- create_deal_share(bigint) / revoke_deal_share(bigint), drop table
-- public.deal_share_links — nothing else references them. Forward-fix remains
-- the house rule; this is documentation, not an invitation.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.deal_share_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  deal_id    bigint not null,
  token      text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, deal_id)
);

alter table public.deal_share_links enable row level security;
create policy "read own share links"
  on public.deal_share_links for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies — writes go only through the definer RPCs.

-- ── create_deal_share(p_deal_id) ─────────────────────────────────────────────
-- Owner-only, tier-gated exactly like the client Share control (investor/pro —
-- the same product law tierlaw pins client-side, enforced server-side so a
-- crafted call can't mint links on Starter). Verifies the deal actually exists
-- in the caller's pipeline before minting. Idempotent per (user, deal); a
-- previously revoked link is re-armed with the SAME token (the owner chose to
-- share this deal again).
create or replace function public.create_deal_share(p_deal_id bigint)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tier text;
  v_token text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first.');
  end if;

  v_tier := public.current_tier();
  if v_tier not in ('investor', 'pro') then
    return jsonb_build_object('ok', false, 'msg', 'Deal sharing is an Investor feature.');
  end if;

  if not exists (
    select 1
    from public.user_pipeline up,
         jsonb_array_elements(up.deals) as d
    where up.user_id = v_user
      and (d->>'id')::bigint = p_deal_id
  ) then
    return jsonb_build_object('ok', false, 'msg', 'Deal not found in your pipeline.');
  end if;

  insert into public.deal_share_links (user_id, deal_id)
  values (v_user, p_deal_id)
  on conflict (user_id, deal_id)
    do update set revoked_at = null
  returning token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;
revoke all on function public.create_deal_share(bigint) from public, anon, authenticated, service_role;
grant execute on function public.create_deal_share(bigint) to authenticated;

-- ── get_shared_deal(p_token) ─────────────────────────────────────────────────
-- The recipient's read path: anon-executable, read-only, whitelisted output.
-- Live semantics: reads the owner's CURRENT saved deal each call. A revoked
-- link, a deleted deal, or an unknown token are all the same truthful answer.
create or replace function public.get_shared_deal(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_link record;
  v_deal jsonb;
begin
  if p_token is null or length(p_token) <> 32 then
    return jsonb_build_object('ok', false, 'msg', 'not_found');
  end if;

  select user_id, deal_id into v_link
  from public.deal_share_links
  where token = p_token and revoked_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'not_found');
  end if;

  select d into v_deal
  from public.user_pipeline up,
       jsonb_array_elements(up.deals) as d
  where up.user_id = v_link.user_id
    and (d->>'id')::bigint = v_link.deal_id
  limit 1;
  if v_deal is null then
    return jsonb_build_object('ok', false, 'msg', 'not_found');
  end if;

  -- Whitelist, never passthrough: notes (private negotiation intel), the raw
  -- deal id, and every account-level field stay server-side.
  return jsonb_build_object(
    'ok', true,
    'deal', jsonb_build_object(
      'name',        v_deal->'name',
      'type',        v_deal->'type',
      'verdict',     v_deal->'verdict',
      'cls',         v_deal->'cls',
      'date',        v_deal->'date',
      'updated',     v_deal->'updated',
      'marketLabel', v_deal->'marketLabel',
      'stats',       v_deal->'stats',
      'data',        v_deal->'data'
    )
  );
end;
$$;
revoke all on function public.get_shared_deal(text) from public, anon, authenticated, service_role;
grant execute on function public.get_shared_deal(text) to anon, authenticated;

-- ── revoke_deal_share(p_deal_id) ─────────────────────────────────────────────
-- Owner kill switch. Kept deliberately simple: stamping revoked_at makes
-- get_shared_deal answer not_found immediately; create_deal_share re-arms the
-- same token if the owner shares again.
create or replace function public.revoke_deal_share(p_deal_id bigint)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first.');
  end if;
  update public.deal_share_links
     set revoked_at = now()
   where user_id = v_user and deal_id = p_deal_id and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.revoke_deal_share(bigint) from public, anon, authenticated, service_role;
grant execute on function public.revoke_deal_share(bigint) to authenticated;
