// ─── Wave 5 · Edge Function: checkout ─────────────────────────────────────────
// Authenticated Checkout session creation. AUTHOR-ONLY in Phase 4 — not
// deployed. Trust chain: verified Supabase JWT → server-side refusals
// (payment gate → same-tier law → one-live-attempt) → Stripe hosted Checkout.
// The client supplies ONLY an abstract tier name; prices are server-selected;
// no client value is entitlement authority.
import Stripe from 'npm:stripe@22.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadConfig } from '../_shared/stripe_config.mjs';

const CORS = {
  'Access-Control-Allow-Origin': 'https://dealfit.clearpathcapfunding.com',
  // R1 attempt-2 fix: supabase-js sends x-client-info on every Functions call
  // and apikey on authenticated ones — omitting either fails CORS preflight
  // and blocks the POST before the server gate is ever consulted.
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const cfg = loadConfig(Deno.env.toObject());
  const stripe = new Stripe(cfg.stripeSecretKey, { apiVersion: cfg.apiVersion });
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1. Authenticate the caller with their own JWT.
  const authHeader = req.headers.get('authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'sign_in_required' });
  const user = userData.user;

  const { tier } = await req.json().catch(() => ({}));
  if (tier !== 'investor' && tier !== 'pro') return json(400, { error: 'bad_tier' });

  // 1b. LAUNCH BLOCKER (paid→paid): gate first, then paid-state — both BEFORE
  // any attempt/customer/session side effect. The gate pre-check mirrors
  // begin_checkout_attempt's own law (which still re-checks, defense in depth)
  // so a non-allowlisted caller sees exactly the pre-fix 403 and never becomes
  // a paid-state oracle.
  const { data: cfgRow, error: cfgErr } = await service.from('payment_config')
    .select('mode, checkout_enabled, allowlist').eq('id', 1).single();
  if (cfgErr || !cfgRow) return json(500, { error: 'attempt_begin_failed' });
  if (!(cfgRow.checkout_enabled || (cfgRow.allowlist ?? []).includes(user.id))) {
    return json(403, { error: 'checkout_not_open' });
  }
  const mode = cfgRow.mode === 'live' ? 'live' : 'test';

  // One active/grace Stripe subscription per user (Amendment 1: plan switching
  // is deferred — a second Checkout would create a SECOND Stripe subscription,
  // not a switch). Validity mirrors effective_tier_for's stripe branches:
  // mode-matched; active needs a future period; grace needs a future
  // grace_until. A stripe_customers mapping alone, or an ended/canceled/
  // revoked grant, never blocks — only a currently-contributing subscription.
  const nowIso = new Date().toISOString();
  const { data: paidGrants, error: paidErr } = await service.from('entitlement_grants')
    .select('id')
    .eq('user_id', user.id).eq('source', 'stripe').eq('livemode', mode === 'live')
    .or(`and(status.eq.active,current_period_end.gt.${nowIso}),and(status.eq.grace,grace_until.gt.${nowIso})`)
    .limit(1);
  if (paidErr) return json(500, { error: 'entitlement_check_failed' }); // fail closed: never risk a double charge
  if (paidGrants && paidGrants.length > 0) {
    return json(409, { error: 'plan_change_unavailable' });
  }

  // 2. Server-side refusals + logical-attempt claim (single definer call:
  //    gate → same-tier law → one live attempt per user).
  const { data: begin, error: beginErr } = await service.rpc('begin_checkout_attempt', {
    p_user: user.id, p_tier: tier,
  });
  if (beginErr) return json(500, { error: 'attempt_begin_failed' });

  switch (begin.outcome) {
    case 'refused_gate':
      return json(403, { error: 'checkout_not_open' });
    case 'refused_same_tier':
      return json(409, { error: 'already_entitled', effective_tier: begin.effective_tier });
    case 'reuse':
      { // Converge on the existing open session.
        const existing = await stripe.checkout.sessions.retrieve(begin.session_id);
        if (existing?.url && existing.status === 'open') return json(200, { url: existing.url });
        // Stale on Stripe's side: expire our attempt; caller retries fresh.
        await service.rpc('expire_checkout_attempt', { p_attempt: begin.attempt_id, p_reason: 'expired' });
        return json(409, { error: 'retry' });
      }
    case 'busy':
      return json(429, { error: 'attempt_in_flight' }); // NEVER supersede a fresh creating row (pin 1)
    case 'claimed':
      break;
    default:
      return json(500, { error: 'unexpected_outcome' });
  }

  try {
    // 3. Customer mapping (per mode) — reuse, else create. `mode` was read in
    // step 1b from the same payment_config row this request already gated on.
    const { data: mapped } = await service.from('stripe_customers')
      .select('stripe_customer_id').eq('user_id', user.id).eq('mode', mode).maybeSingle();
    let customerId = mapped?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email ?? undefined, metadata: { dealfit_user_id: user.id } },
        { idempotencyKey: `cust-${mode}-${user.id}` },
      );
      customerId = customer.id;
      await service.rpc('upsert_stripe_customer', { p_user: user.id, p_mode: mode, p_customer_id: customerId });
    }

    // 4. Server-selected price; idempotency key = the logical attempt id.
    const price = tier === 'pro' ? cfg.priceProMonthly : cfg.priceInvestorMonthly;
    if (!price) throw new Error('price_not_configured');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],       // exactly ONE recurring item (period-contract invariant)
      success_url: 'https://dealfit.clearpathcapfunding.com/?checkout=success',
      cancel_url: 'https://dealfit.clearpathcapfunding.com/?checkout=cancel',
      subscription_data: { metadata: { dealfit_user_id: user.id } },
      // K-4C2: Stripe-native pre-charge Terms acceptance. Stripe renders the
      // checkbox and links the Terms URL stored in the account's Public
      // Business Information (K-4C1) — DealFit builds no custom checkbox and
      // duplicates no legal text. The Customer Portal inherits the same
      // account-level URLs; its per-configuration legal fields stay NULL.
      consent_collection: { terms_of_service: 'required' },
      // NO trial configuration at launch (pin 7); no pause feature (pin 8).
    }, { idempotencyKey: begin.attempt_id });

    await service.rpc('finalize_checkout_attempt', { p_attempt: begin.attempt_id, p_session_id: session.id });
    return json(200, { url: session.url });
  } catch (e) {
    await service.rpc('expire_checkout_attempt', { p_attempt: begin.attempt_id, p_reason: 'expired' });
    return json(502, { error: 'stripe_create_failed', detail: String(e).slice(0, 200) });
  }
});
