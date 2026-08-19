// ─── Wave 5 · single Stripe-state normalization authority ────────────────────
// Pure ESM, no Deno/Node APIs: imported by BOTH the stripe-webhook and
// reconcile Edge Functions (one transition logic, never two competing
// entitlement authorities) AND by the Node test suite directly.
//
// Governing table: DEALFIT_WAVE5_AS_BUILT_IMPLEMENTATION_SPEC_v1.md §3.
// Vocabulary: normalized ∈ active | grace | ended  (+ 'revoked' exists only as
// a manual owner action on grants — no provider state maps to it).
// Unknown provider states FAIL CLOSED (ended + anomaly).
// trialing: no trials at Wave-5 launch → fail closed + anomaly (pin 7).
// paused: no pause feature at launch → fail closed + anomaly (pin 8).

export const NORMALIZATION = Object.freeze({
  active:              { normalized: 'active', entitled: true,  anomaly: false },
  past_due:            { normalized: 'grace',  entitled: true,  anomaly: false }, // per grace rule only
  trialing:            { normalized: 'ended',  entitled: false, anomaly: true  },
  paused:              { normalized: 'ended',  entitled: false, anomaly: true  },
  incomplete:          { normalized: 'ended',  entitled: false, anomaly: false },
  incomplete_expired:  { normalized: 'ended',  entitled: false, anomaly: false },
  unpaid:              { normalized: 'ended',  entitled: false, anomaly: false },
  canceled:            { normalized: 'ended',  entitled: false, anomaly: false },
});

export function normalizeProviderStatus(providerStatus) {
  const known = NORMALIZATION[providerStatus];
  if (known) return { providerStatus, ...known };
  // Unknown/unrecognized: fail closed, flag for diagnosis.
  return { providerStatus: String(providerStatus), normalized: 'ended', entitled: false, anomaly: true };
}

// ── billing-period contract under the PINNED API version ─────────────────────
// Pinned: 2025-03-31.basil (see stripe_config.mjs). Under this version billing
// periods live on SUBSCRIPTION ITEMS, not the subscription object — do not
// read subscription.current_period_end. DealFit's invariant: exactly ONE
// recurring item per subscription (checkout always creates one line item).
// A violation is an anomaly and fails closed.
export function derivePeriodEnd(subscription) {
  const items = subscription?.items?.data;
  if (!Array.isArray(items) || items.length !== 1) {
    return { ok: false, anomaly: `expected exactly 1 subscription item, got ${Array.isArray(items) ? items.length : 'none'}` };
  }
  const end = items[0]?.current_period_end;
  if (typeof end !== 'number' || !Number.isFinite(end) || end <= 0) {
    return { ok: false, anomaly: 'subscription item has no numeric current_period_end' };
  }
  return { ok: true, periodEndIso: new Date(end * 1000).toISOString() };
}

// ── price → tier (server-controlled; client-supplied values never trusted) ───
export function tierForPrice(priceId, cfg) {
  if (priceId && priceId === cfg.priceInvestorMonthly) return 'investor';
  if (priceId && priceId === cfg.priceProMonthly) return 'pro';
  return null; // unknown price: fail closed upstream
}

// ── one subscription → one grant transition (shared webhook/reconcile) ───────
// Returns the argument set for public.apply_stripe_grant, or {ok:false}.
export function mapSubscriptionToGrant(subscription, cfg) {
  const norm = normalizeProviderStatus(subscription?.status);
  const period = derivePeriodEnd(subscription);
  const items = subscription?.items?.data;
  const priceId = Array.isArray(items) && items.length === 1 ? items[0]?.price?.id : null;
  const tier = tierForPrice(priceId, cfg);
  if (!tier) {
    return { ok: false, anomaly: `unknown or ambiguous price for subscription ${subscription?.id}` };
  }
  if (!period.ok && norm.normalized !== 'ended') {
    // A live/grace subscription whose period cannot be derived fails closed.
    return { ok: false, anomaly: period.anomaly };
  }
  return {
    ok: true,
    anomaly: norm.anomaly ? `provider_status=${norm.providerStatus} fails closed at launch` : null,
    args: {
      p_subscription_id: subscription.id,
      p_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription?.customer?.id ?? null,
      p_tier: tier,
      p_provider_status: norm.providerStatus,
      p_normalized: norm.normalized,
      p_period_end: period.ok ? period.periodEndIso : null,
      p_livemode: subscription.livemode === true,
      p_grace_days: cfg.graceMaxDays,
    },
  };
}
