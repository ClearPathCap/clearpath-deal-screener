-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · Unit C: server-side pipeline (saved deals follow the account)
-- ───────────────────────────────────────────────────────────────────────────
-- A signed-in user's saved deals live here as one JSONB blob (the client already
-- works on the whole array via storage.js getDeals/saveDeals, so one row per user
-- maps cleanly). This makes the pipeline sync across devices and survive a browser
-- clear — and, with lock-don't-delete, a downgraded user keeps their deals.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste → Run. (After 0001–0005.)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.user_pipeline (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  deals      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_pipeline enable row level security;
create policy "read own pipeline"
  on public.user_pipeline for select
  using (auth.uid() = user_id);
-- Writes go only through save_pipeline() (definer); no direct client write policy.

-- Read the caller's saved deals (empty array when none / signed out).
create or replace function public.get_pipeline()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select deals from public.user_pipeline where user_id = auth.uid()), '[]'::jsonb);
$$;
revoke all on function public.get_pipeline() from public, anon;
grant execute on function public.get_pipeline() to authenticated;

-- Replace the caller's pipeline with the given array (the client sends the whole set).
create or replace function public.save_pipeline(p_deals jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok', false, 'msg', 'Not signed in.'); end if;
  insert into public.user_pipeline (user_id, deals, updated_at)
  values (v_user, coalesce(p_deals, '[]'::jsonb), now())
  on conflict (user_id) do update set deals = excluded.deals, updated_at = now();
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.save_pipeline(jsonb) from public, anon;
grant execute on function public.save_pipeline(jsonb) to authenticated;
