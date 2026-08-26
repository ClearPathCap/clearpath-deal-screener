// ─── Wave 5 · Edge Function: stripe-webhook ───────────────────────────────────
// AUTHOR-ONLY in Phase 4 — not deployed. Deploys with --no-verify-jwt (Stripe
// cannot present a Supabase JWT); authenticity = signature verification, which
// happens BEFORE any trusted processing or DB write (C-1).
//
// Event ledger law (spec §6): claim → processing; skip ONLY known-processed;
// failed stays retryable; stale processing (>10 min) reclaimable; grant
// transition + processed terminal state commit atomically in
// public.apply_stripe_grant. 2xx only for processed/known-processed; any
// failure returns 5xx so Stripe retries (retained provider-event processing).
//
// STATE-BASED: relevant events trigger a FETCH of current subscription state;
// arrival order is irrelevant; checkout.session.completed is never authority.
import Stripe from 'npm:stripe@22.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadConfig } from '../_shared/stripe_config.mjs';
import { mapSubscriptionToGrant } from '../_shared/stripe_normalize.mjs';

const RELEVANT = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
]);

Deno.serve(async (req) => {
  const cfg = loadConfig(Deno.env.toObject());
  const stripe = new Stripe(cfg.stripeSecretKey, { apiVersion: cfg.apiVersion });

  // 1. SIGNATURE FIRST — before any DB write.
  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, cfg.webhookSecret);
  } catch {
    return new Response('bad signature', { status: 400 });
  }

  if (!RELEVANT.has(event.type)) return new Response('ignored', { status: 200 });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 2. Atomic claim.
  const { data: claim, error: claimErr } = await service.rpc('claim_stripe_event', {
    p_event_id: event.id, p_type: event.type, p_livemode: event.livemode === true,
  });
  if (claimErr) return new Response('claim failed', { status: 500 });
  if (claim === 'already_processed') return new Response('ok (dup)', { status: 200 });
  if (claim === 'busy') return new Response('busy', { status: 503 });

  // 3. Process: resolve subscription id, fetch CURRENT provider state.
  try {
    let subscriptionId: string | null = null;
    const obj = event.data.object as Record<string, unknown>;
    if (event.type === 'checkout.session.completed') {
      subscriptionId = (obj.subscription as string) ?? null;
    } else if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = (obj.id as string) ?? null;
    } else if (event.type.startsWith('invoice.')) {
      const parent = obj.parent as Record<string, any> | undefined;
      subscriptionId = (obj.subscription as string)
        ?? parent?.subscription_details?.subscription ?? null;
    }
    if (!subscriptionId) throw new Error(`no subscription on ${event.type}`);

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const mapped = mapSubscriptionToGrant(sub, cfg);
    if (!mapped.ok) throw new Error(`normalize: ${mapped.anomaly}`);

    const userId = sub.metadata?.dealfit_user_id
      ?? (event.type === 'checkout.session.completed' ? (obj.client_reference_id as string) : null);
    if (!userId) throw new Error('no dealfit_user_id on subscription');

    // K-5: the fetch-freshness stamp is Stripe's OWN response Date — never
    // Edge wall-clock. A missing header propagates null, which fails closed
    // under enforcement (unstamped mutations are refused server-side).
    const dateHdr = (sub as { lastResponse?: { headers?: Record<string, string> } })
      .lastResponse?.headers?.['date'];
    const stateAt = dateHdr ? new Date(dateHdr).toISOString() : null;

    // 4. Grant + terminal processed state, one transaction. K-5: the applier
    // returns a disposition; 'needs_refetch' = ambiguous ordering (equal/older
    // stamp, different state) → resolve with exactly ONE fresh Stripe read.
    const { data: disp, error: applyErr } = await service.rpc('apply_stripe_grant', {
      p_event_id: event.id, p_user_id: userId, ...mapped.args, p_state_at: stateAt,
    });
    if (applyErr) throw new Error(`apply: ${applyErr.message}`);
    if (disp === 'needs_refetch') {
      const fresh = await stripe.subscriptions.retrieve(subscriptionId);
      const remapped = mapSubscriptionToGrant(fresh, cfg);
      if (!remapped.ok) throw new Error(`normalize(refetch): ${remapped.anomaly}`);
      const freshHdr = (fresh as { lastResponse?: { headers?: Record<string, string> } })
        .lastResponse?.headers?.['date'];
      const { data: disp2, error: reErr } = await service.rpc('apply_stripe_grant', {
        p_event_id: event.id, p_user_id: userId, ...remapped.args,
        p_state_at: freshHdr ? new Date(freshHdr).toISOString() : null,
        p_after_refetch: true,
      });
      if (reErr) throw new Error(`apply(refetch): ${reErr.message}`);
      // Still ambiguous after the bounded read: fail → 5xx → Stripe's retry
      // lands in a later second and converges. Never a false success.
      if (disp2 === 'needs_refetch') throw new Error('freshness ambiguity unresolved after refetch');
      if (disp2 !== 'applied') console.log(`disposition(refetch): ${disp2}`);
    } else if (disp && disp !== 'applied') {
      console.log(`disposition: ${disp}`);
    }
    if (mapped.anomaly) console.warn(`anomaly (fail-closed applied): ${mapped.anomaly}`);
    return new Response('ok', { status: 200 });
  } catch (e) {
    await service.rpc('fail_stripe_event', { p_event_id: event.id, p_error: String(e) });
    return new Response('processing failed', { status: 500 }); // Stripe retries
  }
});
