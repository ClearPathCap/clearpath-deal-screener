// ─── Wave 5 · pinned Stripe contract + parameterized policy ──────────────────
// Pure ESM. The API VERSION PIN is deliberate (Phase-4 pin 3): every server
// SDK client and the webhook endpoint configuration must use exactly this
// version, and all provider-shape parsing (see stripe_normalize.mjs) is
// written against it. Under 2025-03-31.basil, billing periods live on
// subscription items — subscription.current_period_end is NOT assumed.
export const STRIPE_API_VERSION = '2025-03-31.basil';

// Failed-payment grace ceiling in days (spec §4). PROVISIONAL 28 (≈ the Stripe
// Smart-Retries window) pending owner decision #6 — parameterized, not policy.
export const GRACE_MAX_DAYS = 28;

// Server-controlled price/tier mapping (spec §3/§13): price IDs arrive from
// Edge Function secrets, never from any client-supplied value. Set via
// `supabase secrets set` when separately authorized:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   PRICE_INVESTOR_MONTHLY, PRICE_PRO_MONTHLY
export function loadConfig(env) {
  return {
    apiVersion: STRIPE_API_VERSION,
    graceMaxDays: GRACE_MAX_DAYS,
    stripeSecretKey: env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    priceInvestorMonthly: env.PRICE_INVESTOR_MONTHLY ?? '',
    priceProMonthly: env.PRICE_PRO_MONTHLY ?? '',
  };
}
