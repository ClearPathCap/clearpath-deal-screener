-- ───────────────────────────────────────────────────────────────────────────
-- Wave 5 · LOCAL-ONLY environment shim (Phase 5). Run ONCE on a fresh plain
-- PostgreSQL cluster BEFORE applying migrations 0001–0009, so the migrations
-- execute against a Supabase-shaped environment:
--   · the three API roles;
--   · Supabase's default function privileges (new functions are auto-granted
--     to anon/authenticated/service_role — this makes the migrations' explicit
--     REVOKEs load-bearing here exactly as they are in the live project);
--   · the auth schema with a minimal users table and an auth.uid() stub;
--   · pgcrypto in the `extensions` schema (Supabase's placement).
-- NEVER run any part of this against the live project — it exists there already.
-- ───────────────────────────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- Supabase-parity default privileges: functions created by the migration role
-- are executable by the API roles unless explicitly revoked.
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

-- Supabase resolves auth.uid() from the request JWT; locally we read a session
-- setting (unset → NULL, i.e. "not signed in").
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
