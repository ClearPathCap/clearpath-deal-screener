// Wave 5 · K-5 freshness stamp extraction — regression suite for the Stripe
// response-Date defect closed 2026-10-06 (pure modules, no loader needed).
// Run: node tests/stripefreshness.test.mjs
//
// THE DEFECT: under npm:stripe@22.5.0 on Deno the SDK's fetch client makes
// `resource.lastResponse` the native fetch Response, whose `.headers` is a
// WHATWG Headers object. `lastResponse.headers['date']` bracket-indexes it and
// is ALWAYS undefined, so every state-changing apply_stripe_grant call ran
// unstamped and was refused once freshness enforcement activated. The shared
// extractor (supabase/functions/_shared/stripe_response.mjs) reads Headers
// with .get() and keeps the plain-map fallback.
//
// Sections:
//  §A extractor contract — Response / Headers / plain map / missing / invalid.
//  §B positive control — the pre-fix expression yields undefined on a real
//     Response (documents why the live webhook failed; cannot pass at 071a432,
//     where the extractor module does not exist).
//  §C apply-path simulation — SDK-shaped subscription objects for a deleted
//     (canceled), a newly created, and a renewed subscription each produce the
//     mapper args PLUS a valid p_state_at; a missing Date stays null (never
//     fabricated). This is a module-level simulation of what the Edge code
//     passes to the RPC, not an Edge-runtime execution.
//  §D source pins — both Edge Functions import the extractor, no bracket
//     header index remains, every p_state_at site uses it, and the K-5 law
//     (bounded refetch, 5xx fail, no wall-clock authority) is still in place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripeStateAt } from '../supabase/functions/_shared/stripe_response.mjs';
import { mapSubscriptionToGrant } from '../supabase/functions/_shared/stripe_normalize.mjs';
import { loadConfig } from '../supabase/functions/_shared/stripe_config.mjs';

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };
const src = (rel) => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8');
const count = (s, re) => (s.match(re) ?? []).length;

const DATE = 'Wed, 24 Sep 2026 14:03:11 GMT';
const DATE_ISO = '2026-09-24T14:03:11.000Z';

// SDK shape: the JSON resource carries a NON-enumerable lastResponse
// (RequestSender defines it with enumerable:false).
const withResponse = (obj, lastResponse) =>
  Object.defineProperty(obj, 'lastResponse', { value: lastResponse, enumerable: false, writable: false });

// ── §A extractor contract ────────────────────────────────────────────────────
ok('A1 native fetch Response (Deno/worker client shape) → ISO Date',
   stripeStateAt(withResponse({}, new Response('{}', { headers: { date: DATE } }))) === DATE_ISO);
ok('A2 bare WHATWG Headers object → ISO Date',
   stripeStateAt(withResponse({}, { headers: new Headers({ Date: DATE }) })) === DATE_ISO);
ok('A3 plain lowercase header map (node http client shape) → ISO Date',
   stripeStateAt(withResponse({}, { headers: { date: DATE } })) === DATE_ISO);
ok('A4 plain capitalized header map → ISO Date',
   stripeStateAt(withResponse({}, { headers: { Date: DATE } })) === DATE_ISO);
ok('A5 Response without a Date header → null',
   stripeStateAt(withResponse({}, new Response('{}'))) === null);
ok('A6 Headers without a Date → null',
   stripeStateAt(withResponse({}, { headers: new Headers({ 'content-type': 'application/json' }) })) === null);
ok('A7 no lastResponse at all → null', stripeStateAt({}) === null);
ok('A8 undefined / null resource → null', stripeStateAt(undefined) === null && stripeStateAt(null) === null);
ok('A9 empty Date string → null', stripeStateAt(withResponse({}, { headers: { date: '   ' } })) === null);
ok('A10 unparseable Date → null, no throw', (() => {
  try { return stripeStateAt(withResponse({}, { headers: { date: 'not-a-date' } })) === null; }
  catch { return false; }
})());
ok('A11 non-string header value → null', stripeStateAt(withResponse({}, { headers: { date: 12345 } })) === null);
ok('A12 the stamp is Stripe\'s instant, not now()', (() => {
  const s = stripeStateAt(withResponse({}, new Response('{}', { headers: { date: DATE } })));
  return s === DATE_ISO && Math.abs(Date.parse(s) - Date.now()) > 60_000;
})());

// ── §B positive control — the pre-fix expression on a real Response ──────────
ok('B1 pre-fix bracket index on a real Response is undefined (the live defect)', (() => {
  const res = withResponse({}, new Response('{}', { headers: { date: DATE } }));
  const pre = res.lastResponse?.headers?.['date'];
  return pre === undefined && res.lastResponse.headers.get('date') === DATE;
})());

// ── §C apply-path simulation (deleted / created / renewed) ───────────────────
const cfg = loadConfig({ PRICE_INVESTOR_MONTHLY: 'price_inv', PRICE_PRO_MONTHLY: 'price_pro' });
const periodEnd = 1759_000_000; // 2025-09-27T19:06:40Z — a positive, finite item period end
const subShape = (status, over = {}) => ({
  id: 'sub_test', customer: 'cus_test', status, livemode: true,
  metadata: { dealfit_user_id: '00000000-0000-4000-8000-000000000001' },
  items: { data: [{ price: { id: 'price_inv' }, current_period_end: periodEnd }] },
  ...over,
});
// Exactly what the webhook passes to apply_stripe_grant after mapping.
const applyArgs = (sub) => {
  const mapped = mapSubscriptionToGrant(sub, cfg);
  if (!mapped.ok) return { ok: false };
  return { ok: true, args: { ...mapped.args, p_state_at: stripeStateAt(sub) } };
};
const stamped = (status, over) => withResponse(subShape(status, over), new Response('{}', { headers: { date: DATE } }));

ok('C1 customer.subscription.deleted (canceled) reaches apply with ended + a valid stamp', (() => {
  const r = applyArgs(stamped('canceled'));
  return r.ok && r.args.p_normalized === 'ended' && r.args.p_state_at === DATE_ISO;
})());
ok('C2 new subscription (active) reaches apply with active + the same stamp', (() => {
  const r = applyArgs(stamped('active'));
  return r.ok && r.args.p_normalized === 'active' && r.args.p_state_at === DATE_ISO
      && r.args.p_period_end === new Date(periodEnd * 1000).toISOString();
})());
ok('C3 renewal (active, later period end) reaches apply with the new period + the same stamp', (() => {
  const later = periodEnd + 30 * 86400;
  const r = applyArgs(stamped('active', { items: { data: [{ price: { id: 'price_inv' }, current_period_end: later }] } }));
  return r.ok && r.args.p_normalized === 'active' && r.args.p_state_at === DATE_ISO
      && r.args.p_period_end === new Date(later * 1000).toISOString();
})());
ok('C4 past_due (grace) is stamped too', (() => {
  const r = applyArgs(stamped('past_due'));
  return r.ok && r.args.p_normalized === 'grace' && r.args.p_state_at === DATE_ISO;
})());
ok('C5 missing Date stays null on the apply args — never fabricated', (() => {
  const r = applyArgs(withResponse(subShape('canceled'), new Response('{}')));
  return r.ok && r.args.p_normalized === 'ended' && r.args.p_state_at === null;
})());
ok('C6 the mapper is untouched by the stamp (stamp is additive to its args)', (() => {
  const a = mapSubscriptionToGrant(subShape('canceled'), cfg).args;
  const b = mapSubscriptionToGrant(stamped('canceled'), cfg).args;
  return JSON.stringify(a) === JSON.stringify(b) && !('p_state_at' in a);
})());

// ── §D source pins ───────────────────────────────────────────────────────────
const webhook = src('supabase/functions/stripe-webhook/index.ts');
const reconcile = src('supabase/functions/reconcile/index.ts');
const helper = src('supabase/functions/_shared/stripe_response.mjs');
for (const [name, s] of [['webhook', webhook], ['reconcile', reconcile]]) {
  ok(`D1 ${name} imports the shared extractor`, /from '\.\.\/_shared\/stripe_response\.mjs'/.test(s));
  ok(`D2 ${name} has no bracket header index left`, !/headers\??\.?\[/.test(s) && !/\['date'\]/.test(s));
  ok(`D3 ${name} stamps every apply site through the extractor (2 sites, 2 stamps)`,
     count(s, /p_state_at:/g) === 2 && count(s, /stripeStateAt\(/g) === 2);
  ok(`D4 ${name} keeps the bounded refetch (p_after_refetch: true)`, /p_after_refetch: true/.test(s));
  ok(`D5 ${name} has no wall-clock or event.created authority`, !/Date\.now\(\)/.test(s) && !/event\.created/.test(s));
  ok(`D6 ${name} passes the whole resource, not a pre-read header`, !/lastResponse/.test(s));
}
ok('D7 webhook still fails closed: fail_stripe_event + 500 "processing failed"',
   /fail_stripe_event/.test(webhook) && /'processing failed', \{ status: 500 \}/.test(webhook));
ok('D8 webhook still throws on unresolved ambiguity after the refetch',
   /freshness ambiguity unresolved after refetch/.test(webhook));
ok('D9 reconcile still reports unconverged honestly', /unconverged\.push\(sub\.id\)/.test(reconcile));
ok('D10 extractor reads Headers with .get and keeps the plain-map fallback',
   /headers\.get\('date'\)/.test(helper) && /headers\['date'\]/.test(helper));
ok('D11 extractor never fabricates a stamp (no Date.now, no argless new Date)',
   !/Date\.now\(\)/.test(helper) && !/new Date\(\)/.test(helper));
ok('D12 extractor is pure ESM (no Deno/Node APIs)', !/Deno\./.test(helper) && !/from 'node:/.test(helper));

console.log(`\nstripefreshness: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('K-5 freshness stamp extraction holds ✓');
