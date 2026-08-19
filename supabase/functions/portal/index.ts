// ─── Wave 5 · Edge Function: portal ───────────────────────────────────────────
// AUTHOR-ONLY in Phase 4 — not deployed, and SUBJECT TO OWNER DECISION #7
// (Customer Portal in MVP). If #7 is ratified NO, this function is simply
// never deployed; nothing else depends on it.
// Portal provider configuration must match owner decision #8 (plan-change /
// proration policy) — do not inherit Stripe Dashboard defaults silently.
import Stripe from 'npm:stripe';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadConfig } from '../_shared/stripe_config.mjs';

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

  try {
    const { data: cfgRow } = await service.from('payment_config').select('mode').eq('id', 1).single();
    const mode = cfgRow?.mode === 'live' ? 'live' : 'test';
    const { data: mapped } = await service.from('stripe_customers')
      .select('stripe_customer_id').eq('user_id', userData.user.id).eq('mode', mode).maybeSingle();
    if (!mapped?.stripe_customer_id) return json(404, { error: 'no_subscription' });

    const session = await stripe.billingPortal.sessions.create({
      customer: mapped.stripe_customer_id,
      return_url: 'https://dealfit.clearpathcapfunding.com/',
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(502, { error: 'portal_failed', detail: String(e).slice(0, 200) });
  }
});
