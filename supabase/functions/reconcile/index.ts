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
import Stripe from 'npm:stripe@22.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadConfig } from '../_shared/stripe_config.mjs';
import { mapSubscriptionToGrant } from '../_shared/stripe_normalize.mjs';

const CORS = {
  'Access-Control-Allow-Origin': 'https://dealfit.clearpathcapfunding.com',
  // R1 attempt-2 fix: same required allow-header set as checkout (see there).
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
    // K-5: one fetch, one instant — the list response's own Date stamps every
    // subscription it returned. Never Edge wall-clock; missing header → null
    // (fails closed under enforcement).
    const listHdr = (subs as { lastResponse?: { headers?: Record<string, string> } })
      .lastResponse?.headers?.['date'];
    const listStateAt = listHdr ? new Date(listHdr).toISOString() : null;
    let applied = 0;
    const unconverged: string[] = [];
    for (const sub of subs.data) {
      const m = mapSubscriptionToGrant(sub, cfg);
      if (!m.ok) { console.warn(`reconcile skip ${sub.id}: ${m.anomaly}`); continue; }
      const { data: disp, error } = await service.rpc('apply_stripe_grant', {
        p_event_id: null, p_user_id: userId, ...m.args, p_state_at: listStateAt,
      });
      if (error) throw new Error(`apply ${sub.id}: ${error.message}`);
      if (disp === 'needs_refetch') {
        // Bounded resolution: ONE fresh read. Reconcile has no retry behind
        // it, so an unresolved ambiguity is reported honestly, not swallowed.
        const fresh = await stripe.subscriptions.retrieve(sub.id);
        const rm = mapSubscriptionToGrant(fresh, cfg);
        if (!rm.ok) { console.warn(`reconcile skip(refetch) ${sub.id}: ${rm.anomaly}`); unconverged.push(sub.id); continue; }
        const freshHdr = (fresh as { lastResponse?: { headers?: Record<string, string> } })
          .lastResponse?.headers?.['date'];
        const { data: disp2, error: reErr } = await service.rpc('apply_stripe_grant', {
          p_event_id: null, p_user_id: userId, ...rm.args,
          p_state_at: freshHdr ? new Date(freshHdr).toISOString() : null,
          p_after_refetch: true,
        });
        if (reErr) throw new Error(`apply(refetch) ${sub.id}: ${reErr.message}`);
        if (disp2 === 'needs_refetch') { unconverged.push(sub.id); continue; }
      }
      applied++;
    }
    return json(200, unconverged.length
      ? { reconciled: applied, unconverged }
      : { reconciled: applied });
  } catch (e) {
    return json(502, { error: 'reconcile_failed', detail: String(e).slice(0, 200) });
  }
});
