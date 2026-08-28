-- ───────────────────────────────────────────────────────────────────────────
-- UX wave · deal share links — LOCAL-ONLY suite (migration 0014).
-- Run against a LOCAL stack AFTER applying 0001–0014. One transaction, ends in
-- ROLLBACK — zero persistent state. NEVER run against the live project.
--
-- Law under test: opaque 128-bit tokens; owner-only + investor/pro-gated
-- minting; idempotent per (user, deal); anon read of a WHITELISTED projection
-- with live latest-saved semantics; deleting the deal or revoking the link is
-- an immediate, truthful not_found; notes never leave the server.
-- ───────────────────────────────────────────────────────────────────────────
begin;

do $$
declare
  u1 uuid := gen_random_uuid();   -- investor owner
  u2 uuid := gen_random_uuid();   -- starter (gate check)
  v jsonb;
  v2 jsonb;
  v_token text;
  n integer;
begin
  insert into auth.users (id, email) values
    (u1, 'share-owner@example.test'),
    (u2, 'share-starter@example.test');

  -- investor grant for u1 (same shape verify_grants_local uses)
  insert into public.entitlement_grants (user_id, tier, source, purpose, status)
  values (u1, 'investor', 'comp', 'business', 'active');

  -- a pipeline holding two deals for u1 (id 1111 has private notes)
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform public.save_pipeline(jsonb_build_array(
    jsonb_build_object('id', 1111, 'name', '417 Saddlebrooke Rd — Lake Murray', 'type', 'flip',
      'verdict', 'Counter at Max Offer — Walk Away', 'cls', 'pass',
      'notes', 'PRIVATE seller intel — must never leave the server',
      'date', 'Aug 26, 2026', 'marketLabel', 'Lake Murray SC',
      'data', jsonb_build_object('ask', 289000, 'arv', 365000, 'rep', 98000, 'profit', -56780),
      'stats', jsonb_build_array(jsonb_build_object('l', 'Profit', 'v', '-$56,780'))),
    jsonb_build_object('id', 2222, 'name', 'Other Deal', 'type', 'flip',
      'verdict', 'Dig Deeper & Negotiate', 'cls', 'warm', 'notes', '',
      'date', 'Aug 20, 2026', 'data', jsonb_build_object('ask', 100000))
  ));

  -- ══ 1. signed-out mint refused ═════════════════════════════════════════════
  perform set_config('request.jwt.claim.sub', '', true);
  v := public.create_deal_share(1111);
  assert (v->>'ok')::boolean = false, 'S1: signed-out create refused';

  -- ══ 2. starter mint refused (tier gate is server-side, not just UI) ════════
  perform set_config('request.jwt.claim.sub', u2::text, true);
  v := public.create_deal_share(1111);
  assert (v->>'ok')::boolean = false, 'S2a: starter create refused';
  assert position('Investor' in v->>'msg') > 0, 'S2b: refusal names the tier law';

  -- ══ 3. owner mints; token is 32-hex opaque; idempotent ═════════════════════
  perform set_config('request.jwt.claim.sub', u1::text, true);
  v := public.create_deal_share(1111);
  assert (v->>'ok')::boolean = true, 'S3a: investor owner mints';
  v_token := v->>'token';
  assert v_token ~ '^[0-9a-f]{32}$', 'S3b: token is 32 lowercase hex chars (128-bit opaque)';
  v2 := public.create_deal_share(1111);
  assert v2->>'token' = v_token, 'S3c: re-share returns the SAME token (idempotent)';
  select count(*) into n from public.deal_share_links where user_id = u1;
  assert n = 1, 'S3d: exactly one link row per (user, deal)';

  -- ══ 4. a deal you don't have can't be shared ═══════════════════════════════
  v := public.create_deal_share(9999);
  assert (v->>'ok')::boolean = false, 'S4: nonexistent deal refused';

  -- ══ 5. anon read: whitelisted projection, notes NEVER leak ═════════════════
  perform set_config('request.jwt.claim.sub', '', true);
  v := public.get_shared_deal(v_token);
  assert (v->>'ok')::boolean = true, 'S5a: anon reads a live link';
  assert v->'deal'->>'name' = '417 Saddlebrooke Rd — Lake Murray', 'S5b: name present';
  assert (v->'deal'->'data'->>'profit')::numeric = -56780, 'S5c: underwriting numbers present';
  assert v->'deal'->>'marketLabel' = 'Lake Murray SC', 'S5d: underwritten market present';
  assert v->'deal' ? 'notes' = false, 'S5e: NOTES ARE NOT IN THE PROJECTION';
  assert position('PRIVATE seller intel' in v::text) = 0, 'S5f: notes text absent from the entire payload';
  assert position(u1::text in v::text) = 0, 'S5g: owner user id absent from the payload';
  assert position('share-owner@example.test' in v::text) = 0, 'S5h: owner email absent from the payload';

  -- ══ 6. live latest-saved semantics: owner edit shows on next read ══════════
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform public.save_pipeline(jsonb_build_array(
    jsonb_build_object('id', 1111, 'name', '417 Saddlebrooke Rd — Lake Murray', 'type', 'flip',
      'verdict', 'Dig Deeper & Negotiate', 'cls', 'warm', 'notes', 'still private',
      'date', 'Aug 26, 2026', 'updated', 'Aug 27, 2026',
      'data', jsonb_build_object('ask', 265000, 'arv', 365000, 'rep', 88000, 'profit', -21000)),
    jsonb_build_object('id', 2222, 'name', 'Other Deal', 'type', 'flip',
      'verdict', 'Dig Deeper & Negotiate', 'cls', 'warm', 'notes', '', 'date', 'Aug 20, 2026',
      'data', jsonb_build_object('ask', 100000))
  ));
  perform set_config('request.jwt.claim.sub', '', true);
  v := public.get_shared_deal(v_token);
  assert (v->'deal'->'data'->>'ask')::numeric = 265000, 'S6a: recipient sees the LATEST saved state';
  assert v->'deal'->>'updated' = 'Aug 27, 2026', 'S6b: updated stamp travels';

  -- ══ 7. garbage/unknown tokens are a uniform not_found ══════════════════════
  v := public.get_shared_deal('00000000000000000000000000000000');
  assert (v->>'ok')::boolean = false, 'S7a: unknown token not_found';
  v := public.get_shared_deal('short');
  assert (v->>'ok')::boolean = false, 'S7b: malformed token not_found';
  v := public.get_shared_deal(null);
  assert (v->>'ok')::boolean = false, 'S7c: null token not_found';

  -- ══ 8. deleting the deal kills the link (no orphaned exposure) ═════════════
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform public.save_pipeline(jsonb_build_array(
    jsonb_build_object('id', 2222, 'name', 'Other Deal', 'type', 'flip',
      'verdict', 'Dig Deeper & Negotiate', 'cls', 'warm', 'notes', '', 'date', 'Aug 20, 2026',
      'data', jsonb_build_object('ask', 100000))
  ));
  perform set_config('request.jwt.claim.sub', '', true);
  v := public.get_shared_deal(v_token);
  assert (v->>'ok')::boolean = false, 'S8: deleted deal -> link is dead';

  -- ══ 9. revoke is immediate; re-share re-arms the SAME token ════════════════
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform public.save_pipeline(jsonb_build_array(
    jsonb_build_object('id', 1111, 'name', 'Back', 'type', 'flip', 'verdict', 'X', 'cls', 'warm',
      'notes', '', 'date', 'Aug 26, 2026', 'data', jsonb_build_object('ask', 1)),
    jsonb_build_object('id', 2222, 'name', 'Other Deal', 'type', 'flip', 'verdict', 'Y', 'cls', 'warm',
      'notes', '', 'date', 'Aug 20, 2026', 'data', jsonb_build_object('ask', 100000))
  ));
  v := public.create_deal_share(1111);
  assert v->>'token' = v_token, 'S9a: token stable across deal delete/recreate of same id';
  perform public.revoke_deal_share(1111);
  perform set_config('request.jwt.claim.sub', '', true);
  v := public.get_shared_deal(v_token);
  assert (v->>'ok')::boolean = false, 'S9b: revoked link is dead immediately';
  perform set_config('request.jwt.claim.sub', u1::text, true);
  v := public.create_deal_share(1111);
  assert (v->>'ok')::boolean = true and v->>'token' = v_token, 'S9c: re-share re-arms the same token';

  -- ══ 10. privilege posture ══════════════════════════════════════════════════
  assert has_function_privilege('anon', 'public.get_shared_deal(text)', 'execute'),
    'S10a: anon may execute get_shared_deal';
  assert not has_function_privilege('anon', 'public.create_deal_share(bigint)', 'execute'),
    'S10b: anon may NOT mint links';
  assert not has_function_privilege('anon', 'public.revoke_deal_share(bigint)', 'execute'),
    'S10c: anon may NOT revoke links';
  assert has_function_privilege('authenticated', 'public.create_deal_share(bigint)', 'execute'),
    'S10d: authenticated may mint';
  assert not has_function_privilege('service_role', 'public.create_deal_share(bigint)', 'execute'),
    'S10e: service_role holds no share EXECUTE (matrix parity)';
  -- RLS: no write policy exists on the table; select is owner-only
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'deal_share_links';
  assert n = 1, 'S10f: exactly one (select-own) policy on deal_share_links';

  raise notice 'verify_share_local: ALL ASSERTIONS PASSED';
end $$;

rollback;
