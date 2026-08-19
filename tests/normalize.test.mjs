// Wave 5 · provider-status normalization + period-contract tests (pure module,
// no loader needed). Run: node tests/normalize.test.mjs
// Pins the single shared normalization authority the webhook AND reconcile
// consume (spec v1.1 §3, corrected Phase 4.1 #2: a Stripe grant without its
// billing period fails closed — the mapper refuses to emit grant args for an
// entitling state with no derivable period).
import { normalizeProviderStatus, derivePeriodEnd, tierForPrice, mapSubscriptionToGrant }
  from '../supabase/functions/_shared/stripe_normalize.mjs';
import { STRIPE_API_VERSION, GRACE_MAX_DAYS, loadConfig } from '../supabase/functions/_shared/stripe_config.mjs';

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── mapping table (spec §3) ───────────────────────────────────────────────────
const T = [
  ['active',             'active', true,  false],
  ['past_due',           'grace',  true,  false],
  ['trialing',           'ended',  false, true ],   // no trials at launch — fail closed + anomaly
  ['paused',             'ended',  false, true ],   // no pause feature — fail closed + anomaly
  ['incomplete',         'ended',  false, false],
  ['incomplete_expired', 'ended',  false, false],
  ['unpaid',             'ended',  false, false],
  ['canceled',           'ended',  false, false],
];
for (const [raw, norm, entitled, anomaly] of T) {
  const r = normalizeProviderStatus(raw);
  ok(`${raw} → ${norm}/${entitled}/${anomaly ? 'anomaly' : 'clean'}`,
     r.normalized === norm && r.entitled === entitled && r.anomaly === anomaly);
}
// Unknown fails closed with anomaly.
for (const junk of ['future_new_state', '', null, undefined, 42]) {
  const r = normalizeProviderStatus(junk);
  ok(`unknown ${String(junk)} fails closed`, r.normalized === 'ended' && !r.entitled && r.anomaly);
}

// ── period contract under the pinned API version ─────────────────────────────
ok('API version is pinned', STRIPE_API_VERSION === '2025-03-31.basil');
ok('grace parameter is the provisional 28', GRACE_MAX_DAYS === 28);
const goodSub = (over = {}) => ({
  id: 'sub_1', status: 'active', livemode: false,
  customer: 'cus_1',
  items: { data: [{ price: { id: 'price_inv' }, current_period_end: 1893456000 }] },
  ...over,
});
ok('one-item period derives', derivePeriodEnd(goodSub()).ok === true);
ok('zero items fails closed', derivePeriodEnd(goodSub({ items: { data: [] } })).ok === false);
ok('two items fails closed (one-recurring-item invariant)',
   derivePeriodEnd(goodSub({ items: { data: [{ current_period_end: 1 }, { current_period_end: 2 }] } })).ok === false);
ok('missing period field fails closed',
   derivePeriodEnd(goodSub({ items: { data: [{ price: { id: 'p' } }] } })).ok === false);
ok('subscription-level current_period_end is NOT consulted',
   derivePeriodEnd({ current_period_end: 999, items: { data: [] } }).ok === false);

// ── server-controlled price → tier ────────────────────────────────────────────
const cfg = loadConfig({ PRICE_INVESTOR_MONTHLY: 'price_inv', PRICE_PRO_MONTHLY: 'price_pro' });
ok('investor price maps', tierForPrice('price_inv', cfg) === 'investor');
ok('pro price maps', tierForPrice('price_pro', cfg) === 'pro');
ok('unknown price fails closed', tierForPrice('price_hacked', cfg) === null);
ok('empty price fails closed', tierForPrice('', cfg) === null);

// ── full mapper: fail-closed composition (Phase 4.1 #2 at the writer's edge) ──
ok('happy path maps to grant args', (() => {
  const m = mapSubscriptionToGrant(goodSub(), cfg);
  return m.ok && m.args.p_tier === 'investor' && m.args.p_normalized === 'active'
      && m.args.p_livemode === false && typeof m.args.p_period_end === 'string';
})());
ok('active with underivable period refuses to emit grant args', (() => {
  const m = mapSubscriptionToGrant(goodSub({ items: { data: [{ price: { id: 'price_inv' } }] } }), cfg);
  return m.ok === false;
})());
ok('unknown price refuses to emit grant args', (() => {
  const m = mapSubscriptionToGrant(goodSub({ items: { data: [{ price: { id: 'price_evil' }, current_period_end: 1893456000 }] } }), cfg);
  return m.ok === false;
})());
ok('canceled maps to ended with args (state recording is allowed for non-entitling states)', (() => {
  const m = mapSubscriptionToGrant(goodSub({ status: 'canceled', items: { data: [{ price: { id: 'price_inv' } }] } }), cfg);
  return m.ok === true && m.args.p_normalized === 'ended' && m.args.p_period_end === null;
})());
ok('trialing carries the anomaly flag and never entitles', (() => {
  const m = mapSubscriptionToGrant(goodSub({ status: 'trialing' }), cfg);
  return m.ok === true && m.args.p_normalized === 'ended' && m.anomaly !== null;
})());
ok('livemode propagates', (() => {
  const m = mapSubscriptionToGrant(goodSub({ livemode: true }), cfg);
  return m.ok && m.args.p_livemode === true;
})());

console.log(`\nnormalize: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('Provider-state normalization holds ✓');
