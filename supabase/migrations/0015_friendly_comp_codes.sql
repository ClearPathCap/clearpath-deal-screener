-- ───────────────────────────────────────────────────────────────────────────
-- Deal Screener · Friendly comp codes (owner-reported adoption defect)
-- ───────────────────────────────────────────────────────────────────────────
-- REAL-WORLD EVIDENCE: issued Aspire codes were 26-character hex strings
-- ('CPC-A-' + 20 hex). Recipients were failing to type them in, so codes sat
-- unredeemed. Three changes, no law changes:
--
--   1. FRIENDLY DEFAULT FORMAT — <POOL>-XXXX-XXXX (e.g. ASPIRE-7KDM-Q4RP),
--      8 characters from an unambiguous alphabet (no I/L/O/0/1): ~39.6 bits of
--      entropy, still far beyond online-guessing reach behind the
--      authenticated, non-oracling redeem RPC — and actually typeable.
--   2. PERSONALIZED CODES (security-amended) — issue_comp_code/rotate_comp_code
--      gain OPTIONAL p_code treated as a FRIENDLY PREFIX, never the whole
--      secret: the server appends '-' + EXACTLY 4 random unambiguous chars
--      (owner ruling), e.g. p_code 'Ryan' → 'Ryan-7KDM'. The prefix makes the
--      code recognizable; the random suffix remains the secret. Uniqueness via
--      the code_hash primary key, with generation retried on collision.
--   3. FORGIVING REDEMPTION — matching now ignores case, spaces, and dashes
--      ('aspire investor ryan' redeems 'Aspire-Investor-Ryan'). Implemented as
--      a NEW normalization (hash_comp_code_v2: strip every non-alphanumeric,
--      uppercase, sha256) used for all NEW issuance, with redemption falling
--      back to the legacy hash (upper/trim only) so every already-issued code
--      keeps working unchanged. hash_comp_code itself is untouched.
--   4. BRUTE-FORCE THROTTLE (material-finding remediation): with 4-char random
--      suffixes (~923k combinations per known prefix) the un-throttled redeem
--      RPC would permit practical online guessing from any free account. Failed
--      redemptions are now counted per user; more than 10 failures in an hour
--      refuses further attempts with a uniform message. 240 guesses/day/account
--      pushes expected time-to-hit past a decade per prefix per account.
--
-- Unchanged, deliberately: pool inventory (25/10/10), tier mappings, the K-1
-- forced Aspire expiry, the K-2 generic-expiry laws, slot mechanics, the
-- single-generic-refusal message, RLS, and the owner-only privilege posture.
-- Rollback posture: drop the 4-arg issue_comp_code / recreate the 0013 3-arg
-- body, recreate the 0008 redeem_comp_code, drop hash_comp_code_v2. Forward-
-- fix remains the house rule; this is documentation.
-- ───────────────────────────────────────────────────────────────────────────

-- ── normalization v2: what humans type is what matches ───────────────────────
create or replace function public.hash_comp_code_v2(p_code text)
returns text language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(
           convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8'),
           'sha256'), 'hex');
$$;
revoke all on function public.hash_comp_code_v2(text) from public, anon, authenticated, service_role;

-- ── ONE canonical plaintext builder (issuance AND rotation call this) ────────
-- p_code null  → friendly generated <POOL>-XXXX-XXXX (8 random chars).
-- p_code given → FRIENDLY PREFIX + '-' + exactly 4 random chars (owner ruling:
--                RYAN-7KDM, never a fully predictable bearer string).
-- No second copy of either rule may exist anywhere.
create or replace function public.comp_code_plaintext(p_pool text, p_code text default null)
returns text language plpgsql
set search_path = ''
as $$
declare
  v_norm  text;
  v_word  text;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no I/L/O/0/1
  v_bytes bytea;
  v_body  text := '';
  v_len   integer;
begin
  v_len := case when p_code is not null then 4 else 8 end;
  v_bytes := extensions.gen_random_bytes(v_len);
  for i in 0..(v_len - 1) loop
    v_body := v_body || substr(v_alpha, (get_byte(v_bytes, i) % length(v_alpha)) + 1, 1);
  end loop;

  if p_code is not null then
    v_norm := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
    if length(v_norm) < 2 then
      raise exception 'personalized prefix too short — need at least 2 letters/digits';
    end if;
    if length(v_norm) > 30 then
      raise exception 'personalized prefix too long — at most 30 letters/digits';
    end if;
    return trim(p_code) || '-' || v_body;
  end if;

  v_word := case p_pool when 'aspire' then 'ASPIRE'
                        when 'generic_investor' then 'INVESTOR'
                        when 'generic_pro' then 'PRO'
                        else 'QA' end;
  return v_word || '-' || substr(v_body, 1, 4) || '-' || substr(v_body, 5, 4);
end;
$$;
revoke all on function public.comp_code_plaintext(text, text) from public, anon, authenticated, service_role;

-- ── issuance: friendly defaults + optional vanity ────────────────────────────
-- Signature grows a 4th defaulted arg → DROP + CREATE (create-or-replace cannot
-- change an argument list), then the full owner-only revoke re-declared.
drop function public.issue_comp_code(text, timestamptz, text);

create function public.issue_comp_code(
  p_pool text, p_expires timestamptz default null, p_label text default null,
  p_code text default null)
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

  -- Every minted code carries a random component, so a hash collision is a
  -- re-roll, never a user error. Three attempts is astronomically sufficient.
  for attempt in 1..3 loop
    v_plain := public.comp_code_plaintext(p_pool, p_code);
    v_hash  := public.hash_comp_code_v2(v_plain);
    begin
      insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
      values (v_hash, v_tier, p_pool, true, 1, v_expires, p_label);
      exit;
    exception when unique_violation then
      if attempt = 3 then
        raise exception 'could not mint a unique code after 3 attempts';
      end if;
    end;
  end loop;

  if p_pool <> 'qa' then
    update public.campaign_slots s
       set state = 'issued', current_code_hash = v_hash, updated_at = now()
     where s.pool = p_pool and s.slot_no = v_slot;
  end if;

  return query select v_plain, p_pool, v_slot, v_tier, v_expires;
end;
$$;
revoke all on function public.issue_comp_code(text, timestamptz, text, text) from public, anon, authenticated, service_role;

-- ── rotation: same friendly/vanity rules, same one builder ───────────────────
-- Signature grows the optional vanity arg → DROP + CREATE + owner-only revoke.
drop function public.rotate_comp_code(text, integer);

create function public.rotate_comp_code(p_pool text, p_slot integer, p_code text default null)
returns table (code text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_slot   public.campaign_slots%rowtype;
  v_old    public.comp_codes_v2%rowtype;
  v_plain  text;
  v_hash   text;
begin
  select * into v_slot from public.campaign_slots s
   where s.pool = p_pool and s.slot_no = p_slot
   for update;
  if not found or v_slot.state <> 'issued' then
    raise exception 'slot %/% is not in issued state', p_pool, p_slot;
  end if;
  select * into v_old from public.comp_codes_v2 c where c.code_hash = v_slot.current_code_hash;
  if v_old.redeemed_count > 0 then
    raise exception 'slot %/% code was already redeemed — rotation is for unredeemed credentials only', p_pool, p_slot;
  end if;

  update public.comp_codes_v2 set active = false where code_hash = v_old.code_hash;

  for attempt in 1..3 loop
    v_plain := public.comp_code_plaintext(p_pool, p_code);
    v_hash  := public.hash_comp_code_v2(v_plain);
    begin
      insert into public.comp_codes_v2 (code_hash, tier, pool, active, max_redemptions, expires_at, label)
      values (v_hash, v_old.tier, v_old.pool, true, 1, v_old.expires_at, v_old.label);
      exit;
    exception when unique_violation then
      if attempt = 3 then
        raise exception 'could not mint a unique code after 3 attempts';
      end if;
    end;
  end loop;

  update public.campaign_slots s
     set current_code_hash = v_hash, updated_at = now()
   where s.pool = p_pool and s.slot_no = p_slot;

  return query select v_plain;
end;
$$;
revoke all on function public.rotate_comp_code(text, integer, text) from public, anon, authenticated, service_role;

-- ── brute-force throttle ledger (material-finding remediation) ───────────────
-- Written ONLY by the definer redeem path; no client role can touch it. RLS on
-- with zero policies = invisible through the API surface entirely.
create table if not exists public.comp_redeem_failures (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists crf_user_time on public.comp_redeem_failures (user_id, attempted_at);
alter table public.comp_redeem_failures enable row level security;

-- ── redemption: new normalization first, legacy fallback second ──────────────
-- Every pre-0015 code was stored under hash_comp_code (upper/trim, dashes
-- significant); every new code under hash_comp_code_v2. Resolving the typed
-- input against both keeps all outstanding codes redeemable with zero rotation.
create or replace function public.redeem_comp_code(p_code text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_hash  text;
  v_code  public.comp_codes_v2%rowtype;
  v_grant uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'msg', 'Sign in first to redeem a code.');
  end if;

  -- Throttle: with 4-char personalized suffixes, unbounded guessing from a free
  -- account would be practical. Opportunistic cleanup, then a hard per-user cap
  -- of 10 FAILED attempts per hour. Uniform message — no oracle.
  delete from public.comp_redeem_failures f
   where f.user_id = v_user and f.attempted_at < now() - interval '1 hour';
  if (select count(*) from public.comp_redeem_failures f where f.user_id = v_user) >= 10 then
    return jsonb_build_object('ok', false, 'msg', 'Too many attempts — wait a few minutes and try again.');
  end if;

  -- Resolve which stored hash this input names: v2 normalization preferred,
  -- legacy exact-ish form as fallback. At most one can exist (PK).
  select c.code_hash into v_hash
    from public.comp_codes_v2 c
   where c.code_hash in (public.hash_comp_code_v2(p_code), public.hash_comp_code(p_code))
   limit 1;
  if v_hash is null then
    -- Same non-oracling answer as an inactive/expired/spent code below.
    v_hash := public.hash_comp_code_v2(p_code);
  end if;

  -- Idempotent repeat by the SAME user: report the existing grant, mutate nothing.
  select g.id into v_grant
    from public.entitlement_grants g
   where g.user_id = v_user and g.comp_code_hash = v_hash;
  if found then
    select * into v_code from public.comp_codes_v2 c where c.code_hash = v_hash;
    return jsonb_build_object('ok', true, 'tier', v_code.tier,
                              'msg', 'Already redeemed — ' || initcap(v_code.tier) || ' is on your account.');
  end if;

  -- Atomic claim: one UPDATE enforces active + unexpired + under-cap under lock.
  update public.comp_codes_v2 c
     set redeemed_count = c.redeemed_count + 1
   where c.code_hash = v_hash
     and c.active = true
     and (c.expires_at is null or now() < c.expires_at)
     and c.redeemed_count < c.max_redemptions
  returning * into v_code;

  if not found then
    -- Deliberately one generic message: do not oracle which check failed.
    insert into public.comp_redeem_failures (user_id) values (v_user);
    return jsonb_build_object('ok', false, 'msg', 'That code isn''t valid.');
  end if;

  insert into public.entitlement_grants
        (user_id, tier, source, purpose, status, current_period_end, comp_code_hash)
  values (v_user, v_code.tier, 'comp',
          case when v_code.pool = 'qa' then 'qa' else 'business' end,
          'active', v_code.expires_at, v_hash)
  returning id into v_grant;

  insert into public.redemptions_v2 (code_hash, user_id, grant_id)
  values (v_hash, v_user, v_grant);

  -- A business slot is consumed HERE and only here.
  update public.campaign_slots s
     set state = 'redeemed', grant_id = v_grant, updated_at = now()
   where s.current_code_hash = v_hash;

  return jsonb_build_object('ok', true, 'tier', v_code.tier,
                            'msg', 'Unlocked ' || initcap(v_code.tier) || '.');
end;
$$;
revoke all on function public.redeem_comp_code(text) from public, anon, service_role;
grant execute on function public.redeem_comp_code(text) to authenticated;
