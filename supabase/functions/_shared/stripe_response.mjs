// ─── Wave 5 · single Stripe-response freshness-stamp authority ───────────────
// Pure ESM, no Deno/Node APIs: imported by BOTH the stripe-webhook and
// reconcile Edge Functions AND by the Node test suite directly
// (tests/stripefreshness.test.mjs). One extractor, never two.
//
// K-5 law (migration 0012): the stamp passed to public.apply_stripe_grant as
// p_state_at is Stripe's OWN HTTP response Date — never Edge wall-clock, never
// event.created. A missing or unparseable Date yields null; the database then
// refuses any state-changing mutation (fail-closed, retryable) and a stamp is
// NEVER fabricated here.
//
// DEFECT CLOSED (2026-10-06): under the pinned SDK (npm:stripe@22.5.0) the Deno
// runtime resolves the package's "deno" export, the worker build, whose default
// HTTP client is fetch. There `resource.lastResponse` is the native fetch
// Response and `.headers` is a WHATWG Headers object. The previous extraction,
// `lastResponse.headers['date']`, bracket-indexed that object and always
// produced undefined — so from the 2026-08-26 activation of freshness
// enforcement every state-changing webhook/reconcile apply ran unstamped and
// was refused ("unstamped apply/insert refused"). Headers must be read with
// .get(); a plain header map (the Node http client's IncomingMessage.headers,
// the SDK's own HttpClientResponse header object) is still supported.

export function stripeStateAt(resource) {
  const headers = resource?.lastResponse?.headers;
  if (!headers) return null;
  let raw = null;
  if (typeof headers.get === 'function') {
    raw = headers.get('date');                        // WHATWG Headers (fetch client)
  } else if (typeof headers === 'object') {
    raw = headers['date'] ?? headers['Date'] ?? null; // plain header map (node client)
  }
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;              // unparseable → no stamp, no throw
  return new Date(ms).toISOString();
}
