-- ───────────────────────────────────────────────────────────────────────────
-- DealFit · Account-verified events for CPC's CRM (outbox) — LOCAL DRAFT
-- Overnight wave 2026-11-24, Workstream C. NOT APPLIED ANYWHERE. Activation is a separate
-- owner decision (privacy disclosure, CPC receiver, relay secret, schedule) — see
-- _Records\Owner_Decisions_and_Ratifications\DEALFIT_CPC_CRM_ACCOUNT_EVENTS_CONTRACT_2026-11-24.md.
-- ───────────────────────────────────────────────────────────────────────────
-- Owner requirement: when someone successfully creates AND VERIFIES a DealFit account, that
-- person appears in CPC's custom CRM with a source identifying DealFit.
--
-- Design: a trusted, server-side event. The browser never writes it and cannot read it.
--   • An AFTER trigger on auth.users records ONE 'account_verified' event the first time a user
--     with a CONFIRMED email actually SIGNS IN (last_sign_in_at null → set). N24 review F7: keying
--     on the first sign-in, not on email_confirmed_at alone, means an address is never recorded
--     merely because a code was sent — even if the project auto-confirms emails. A returning user
--     signing in again changes nothing → no event.
--   • N24 F6: the trigger can NEVER block sign-up or sign-in — any failure to record is caught and
--     raised as a WARNING only (auth proceeds; the account simply has no event).
--   • N24 F8: deleting the auth user deletes its outbox row (ON DELETE CASCADE). APPLYING THIS
--     MIGRATION STARTS CAPTURE (the flag only gates sending), so applying it is activation.
--   • Idempotent by construction: one row per (user, event type), unique idempotency key
--     'dealfit:account_verified:<user id>'; ON CONFLICT DO NOTHING.
--   • Minimal data: the account id, the email (lower-cased) and the verification time. No deal
--     data, property data, codes, tokens or IP addresses.
--   • The crm-relay Edge Function (service role) drains the outbox to CPC with an HMAC-signed
--     request and records delivery / retry / dead-letter. Rows are kept for audit; an operator
--     can re-queue a dead row by setting status 'pending'.
--   • Users who registered BEFORE activation get no event (a backfill is an owner decision).
-- Default-deny: RLS on with no policies; nothing granted to anon / authenticated.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.account_event_outbox (
  id               bigint generated always as identity primary key,
  event_type       text        not null,
  user_id          uuid        not null references auth.users(id) on delete cascade,
  email            text        not null,
  occurred_at      timestamptz not null,
  idempotency_key  text        not null,
  status           text        not null default 'pending',
  attempts         integer     not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_status      integer     null,
  last_error       text        null,
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz null,
  constraint account_event_outbox_type_chk   check (event_type in ('account_verified')),
  constraint account_event_outbox_status_chk check (status in ('pending', 'delivered', 'dead')),
  constraint account_event_outbox_email_chk  check (email = lower(email) and position('@' in email) > 1 and length(email) <= 320),
  constraint account_event_outbox_idem_chk   check (idempotency_key = 'dealfit:' || event_type || ':' || user_id::text),
  constraint account_event_outbox_error_chk  check (last_error is null or length(last_error) <= 300)
);
create unique index if not exists account_event_outbox_user_type_uniq on public.account_event_outbox (user_id, event_type);
create unique index if not exists account_event_outbox_idem_uniq on public.account_event_outbox (idempotency_key);
create index if not exists account_event_outbox_due_idx on public.account_event_outbox (next_attempt_at) where status = 'pending';

alter table public.account_event_outbox enable row level security;   -- no policies: no client access
revoke all on table public.account_event_outbox from public, anon, authenticated;

create or replace function public.record_account_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and new.email_confirmed_at is not null
     and new.last_sign_in_at is not null
     and (tg_op = 'INSERT' or old.last_sign_in_at is null or old.email_confirmed_at is null) then
    begin
      insert into public.account_event_outbox (event_type, user_id, email, occurred_at, idempotency_key)
      values ('account_verified', new.id, lower(new.email), new.email_confirmed_at,
              'dealfit:account_verified:' || new.id::text)
      on conflict do nothing;
    exception when others then
      raise warning 'dealfit account event not recorded for %: %', new.id, sqlstate;   -- never blocks auth
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.record_account_verified() from public, anon, authenticated;

drop trigger if exists dealfit_account_verified on auth.users;
create trigger dealfit_account_verified
  after insert or update of email_confirmed_at, last_sign_in_at on auth.users
  for each row execute function public.record_account_verified();

-- Relay claim: the due rows, locked so two overlapping relay runs never send the same row.
create or replace function public.claim_account_events(p_limit integer default 25)
returns setof public.account_event_outbox
language sql
security definer
set search_path = public
as $$
  update public.account_event_outbox o
     set next_attempt_at = now() + interval '5 minutes'   -- lease; the relay sets the real outcome
   where o.id in (select id from public.account_event_outbox
                   where status = 'pending' and next_attempt_at <= now()
                   order by id
                   for update skip locked
                   limit greatest(1, least(p_limit, 25)))   -- N24 F12: 25 × 10 s timeout < the 5-minute lease
  returning o.*;
$$;
revoke all on function public.claim_account_events(integer) from public, anon, authenticated;
grant execute on function public.claim_account_events(integer) to service_role;
