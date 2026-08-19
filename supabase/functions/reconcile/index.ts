// ─── Wave 5 · Edge Function: reconcile ────────────────────────────────────────
// AUTHOR-ONLY in Phase 4 — not deployed. The server-side repair path for
// "payment succeeded but the entitlement write failed": reads AUTHORITATIVE
// subscription state from Stripe for the caller's mapped customer and
// converges entitlement_grants to it. syncEntitlement() is a reader and can
// never reconstruct an unwritten grant — this function can, because it writes.
// Uses the SAME normalization module as the webhook (one transition logic).
// Idempotent: state-based upserts converge no matter how many nets fire.
// Triggered by the client's checkout success/cancel return; also invocable by
// the owner via service role for make-good handling.
import Stripe from 'npm:stripe';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadConfig } from '../_shared/stripe_config.mjs';
import { mapSubscriptionToGrant } from '../_shared/stripe_normalize.mjs';

const CORS = {
  'Access-Control-Allow-Origin': 'https://dealfit.clearpathcapfunding.com',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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

  const authHeader = req.headers.get('authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'sign_in_required' });
  const userId = userData.user.id;

  try {
    const { data: cfgRow } = await service.from('payment_config').select('mode').eq('id', 1).single();
    const mode = cfgRow?.mode === 'live' ? 'live' : 'test';
    const { data: mapped } = await service.from('stripe_customers')
      .select('stripe_customer_id').eq('user_id', userId).eq('mode', mode).maybeSingle();
    if (!mapped?.stripe_customer_id) return json(200, { reconciled: 0, note: 'no_customer' });

    const subs = await stripe.subscriptions.list({
      customer: mapped.stripe_customer_id, status: 'all', limit: 20,
    });
    let applied = 0;
    for (const sub of subs.data) {
      const m = mapSubscriptionToGrant(sub, cfg);
      if (!m.ok) { console.warn(`reconcile skip ${sub.id}: ${m.anomaly}`); continue; }
      const { error } = await service.rpc('apply_stripe_grant', {
        p_event_id: null, p_user_id: userId, ...m.args,
      });
      if (error) throw new Error(`apply ${sub.id}: ${error.message}`);
      applied++;
    }
    return json(200, { reconciled: applied });
  } catch (e) {
    return json(502, { error: 'reconcile_failed', detail: String(e).slice(0, 200) });
  }
});
