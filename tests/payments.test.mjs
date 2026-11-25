// Release preparation, native continuation (2026-11-25, local) — payment adapters.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/payments.test.mjs
//
//   §P1 web law: with no native bridge payments.js is inert — the web descriptor only,
//       no plugin, network or storage effect, nothing at import; main.js's web Stripe
//       path is byte-identical to the reviewed native-readiness head b24b95d;
//   §P2 the app as shipped (NATIVE_PAYMENT_CHOICE all null): every purchase / manage /
//       restore is refused BEFORE any plugin call, server call or storage write, with the
//       same message the app showed before;
//   §P3 the adapters when enabled (test-injected choice + product table, never the
//       shipped constants): a tier comes only from the server — a store purchase is a
//       proof sent to store-verify, then the tier is re-read; no result carries a tier,
//       and nothing a plugin or server returns can set one on the client.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');
let pass = 0, fail = 0; const fails = [];
const ok = (v, label) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── Browser-like globals, every effect recorded ─────────────────────────────
const lsLog = [];
const lsMap = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: k => { lsLog.push(['get', k]); return lsMap.has(k) ? lsMap.get(k) : null; },
  setItem: (k, v) => { lsLog.push(['set', k]); lsMap.set(k, String(v)); },
  removeItem: k => { lsLog.push(['remove', k]); lsMap.delete(k); },
};
const fetchLog = [];
globalThis.fetch = (...a) => { fetchLog.push(String(a[0])); return Promise.reject(new TypeError('no network in tests')); };
let capReads = 0;
let capValue;
Object.defineProperty(globalThis, 'Capacitor', { configurable: true, get() { capReads++; return capValue; } });

register(new URL('./_hooks/realclient-loader.mjs', import.meta.url));
const before = { cap: capReads, ls: lsLog.length, fetch: fetchLog.length };
const PAY = await import('../docs/src/js/payments.js?fresh');
const PLAT = await import('../docs/src/js/platform.js');
ok(capReads === before.cap && lsLog.length === before.ls && fetchLog.length === before.fetch,
  'P1 importing payments.js reads no bridge, storage or network (no top-level effects)');

// Recording deps (main.js supplies the real ones: supabase.functions.invoke + syncEntitlement).
const mkDeps = (answers = {}) => {
  const d = { invokes: [], syncs: 0 };
  d.invoke = async (name, body) => { d.invokes.push([name, body]); const a = answers[name]; return typeof a === 'function' ? a(body) : (a || { data: null, error: { message: 'no server in tests' } }); };
  d.sync = async () => { d.syncs++; };
  return d;
};
const RESULT_KEYS = 'message,ok,reason,status';
const shape = (r) => Object.keys(r).sort().join(',');

// ─── §P1 web law ────────────────────────────────────────────────────────────
console.log('— §P1 web —');
capValue = undefined;
const webA = PAY.paymentAdapter();
ok(webA.id === 'web-stripe' && webA.kind === 'web', 'P1 on the web the adapter is the web descriptor (the Stripe path stays in main.js)');
{
  const d = mkDeps(); const l0 = lsLog.length, f0 = fetchLog.length;
  const r = await PAY.nativePayment('purchase', 'pro', d);
  const r2 = await PAY.nativePayment('manage', null, d);
  const r3 = await PAY.nativePayment('restore', null, d);
  ok([r, r2, r3].every(x => x.ok === false && x.status === 'refused' && x.reason === 'not-native'), 'P1 nativePayment refuses on the web (not-native)');
  ok(d.invokes.length === 0 && d.syncs === 0 && lsLog.length === l0 && fetchLog.length === f0, 'P1 … with no server call, no tier re-read, no storage and no network');
  const w = await webA.purchase('pro', d);
  ok(w.status === 'refused' && d.invokes.length === 0, 'P1 the web descriptor routes nothing (its methods refuse; main.js owns the web path)');
}
const pay = src('docs/src/js/payments.js');
ok(!/from '\.\/tiers\.js'/.test(pay) && !/setCachedTier|localStorage|sessionStorage|getActiveTier/.test(pay.replace(/^\s*\/\/.*$/gm, '')),
  'P1 payments.js never imports tiers.js and never touches the tier cache or storage (code, comments excluded)');
ok(JSON.stringify(PAY.NATIVE_PAYMENT_CHOICE) === '{"ios":null,"android":null}' && Object.isFrozen(PAY.NATIVE_PAYMENT_CHOICE),
  'P1 SHIPPED: no native payment adapter is enabled (frozen; enabling one re-pins this test in the same commit)');
ok(Object.values(PAY.STORE_PRODUCTS).every(p => Object.values(p).every(id => id.startsWith('REPLACE_'))),
  'P1 SHIPPED: store product ids are placeholders (no real App Store / Play identifier committed)');
ok(!/remote|getItem|URLSearchParams|location/.test(pay.replace(/^\s*\/\/.*$/gm, '').split('export const NATIVE_PAYMENT_CHOICE')[1].split(';')[0]),
  'P1 the choice is a literal, never read from storage, URL or remote config');

// main.js: the web Stripe path is byte-identical to b24b95d; nativePayment only in the app branch.
const mainNow = src('docs/src/js/main.js').replace(/\r\n/g, '\n');
let mainBase = null;
try { mainBase = execFileSync('git', ['-C', root, 'show', 'b24b95d:docs/src/js/main.js'], { encoding: 'utf8' }).replace(/\r\n/g, '\n'); } catch {}
const fnBody = (t, name) => { const a = t.indexOf('async function ' + name + '('); if (a < 0) return null; const b = t.indexOf('\n}\n', a); return t.slice(a, b + 3); };
const dropGuard = (body) => body && body.split('\n').filter(l => !/^\s*if \(!paymentsInApp\(\)\)/.test(l)).join('\n');
if (mainBase) {
  for (const fn of ['startCheckout', 'manageSubscription']) {
    ok(dropGuard(fnBody(mainNow, fn)) === dropGuard(fnBody(mainBase, fn)), 'P1 main.js ' + fn + ': everything outside the app-only guard is byte-identical to b24b95d (the web Stripe path)');
  }
  const handleRet = (t) => { const a = t.indexOf('function handleCheckoutReturn('); return t.slice(a, t.indexOf('\n}\n', a)); };
  ok(handleRet(mainNow) === handleRet(mainBase), 'P1 main.js handleCheckoutReturn (web checkout return → reconcile → server tier) is unchanged');
} else {
  ok(true, 'P1 main.js comparison skipped: b24b95d not in this clone');
}
const npLines = mainNow.split('\n').filter(l => /nativePayment\(/.test(l));
ok(npLines.length === 2 && npLines.every(l => /^\s*if \(!paymentsInApp\(\)\) \{ showToast\(\(await nativePayment\('(purchase|manage)'/.test(l)),
  'P1 main.js calls nativePayment only inside the two app-only guards (if (!paymentsInApp()))');
ok(PLAT.paymentsInApp() === true, 'P1 on the web paymentsInApp() is true, so those guards never run');
const depsBlock = mainNow.slice(mainNow.indexOf('const PAYMENT_DEPS = {'), mainNow.indexOf('};', mainNow.indexOf('const PAYMENT_DEPS = {')));
ok(/sync: \(\) => syncEntitlement\(\)/.test(depsBlock) && !/setCachedTier|localStorage/.test(depsBlock), 'P1 PAYMENT_DEPS re-reads the tier from the server (syncEntitlement) and never sets one');

// ─── §P2 the app as shipped: everything refused before any effect ──────────
console.log('— §P2 app, shipped choice —');
const calls = [];
const H = (name, methods) => ({ name, methods: methods.map(n => ({ name: n, rtype: 'promise' })) });
const HEADERS = [
  H('DealFitStoreKit', ['purchase', 'currentEntitlements', 'showManageSubscriptions']),
  H('DealFitPlayBilling', ['purchase', 'queryPurchases']),
  H('AppLauncher', ['openUrl']),
  H('Browser', ['open']),
];
let nativeAnswer = () => ({});
function bridge(platform) {
  const cap = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: {}, PluginHeaders: HEADERS,
    nativePromise(p, m, o) { calls.push([p, m, o]); return Promise.resolve(nativeAnswer(p, m, o)); },
    nativeCallback(p, m, o) { calls.push([p, m, o]); return 'cb'; } };
  for (const hd of HEADERS) { const t = {}; for (const m of hd.methods) t[m.name] = (o) => cap.nativePromise(hd.name, m.name, o); cap.Plugins[hd.name] = t; }
  return cap;
}
for (const platform of ['ios', 'android']) {
  capValue = bridge(platform); calls.length = 0;
  const a = PAY.paymentAdapter();
  ok(a.enabled === false && a.id === (platform === 'ios' ? 'ios-storekit' : 'android-play-billing'), 'P2 ' + platform + ': the adapter is the store adapter, disabled');
  const d = mkDeps({ 'store-account-token': { data: { token: 't' } }, 'store-verify': { data: { ok: true } } });
  const l0 = lsLog.length, f0 = fetchLog.length;
  const rs = [await PAY.nativePayment('purchase', 'pro', d), await PAY.nativePayment('manage', null, d), await PAY.nativePayment('restore', null, d)];
  ok(rs.every(r => r.status === 'refused' && r.reason === 'not-enabled' && r.message === PLAT.NATIVE_PAYMENT_MESSAGE),
    'P2 ' + platform + ': purchase / manage / restore are refused with the app\'s existing message');
  ok(calls.length === 0 && d.invokes.length === 0 && d.syncs === 0 && lsLog.length === l0 && fetchLog.length === f0,
    'P2 ' + platform + ': … before any plugin call, server call, tier read, storage write or request');
  // Even the disabled adapter objects themselves refuse when called directly.
  const direct = PAY.buildAdapter(platform === 'ios' ? 'ios-storekit' : 'android-play-billing', false, { pro: { apple: 'a.b', google: 'b' } });
  const dr = await direct.purchase('pro', d);
  ok(dr.reason === 'not-enabled' && calls.length === 0 && d.invokes.length === 0, 'P2 ' + platform + ': a disabled adapter refuses even when called directly with real-looking products');
}
{
  capValue = bridge('ios'); calls.length = 0;
  const d = mkDeps();
  const r = await PAY.nativePayment('purchase', 'pro', d, { ios: 'android-play-billing', android: null });
  ok(r.reason === 'not-enabled' && calls.length === 0, 'P2 a choice naming another platform\'s adapter enables nothing');
}

// ─── §P3 the adapters when enabled (injected; never the shipped constants) ──
console.log('— §P3 enabled adapters (test injection) —');
const PRODUCTS = { investor: { apple: 'test.investor', google: 'test_investor' }, pro: { apple: 'test.pro', google: 'test_pro' } };
const IOS = { ios: 'ios-storekit', android: null }, AND = { ios: null, android: 'android-play-billing' };
lsMap.clear();
{
  capValue = bridge('ios'); calls.length = 0;
  nativeAnswer = (p, m) => (p === 'DealFitStoreKit' && m === 'purchase' ? { status: 'purchased', signedTransaction: 'jws.payload.sig', tier: 'pro' } : {});
  const d = mkDeps({ 'store-account-token': { data: { token: 'acct-token-1' } }, 'store-verify': { data: { ok: true, tier: 'pro', grant: 'pro' } } });
  const r = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS);
  const buy = calls.find(c => c[0] === 'DealFitStoreKit' && c[1] === 'purchase');
  ok(buy && buy[2].productId === 'test.pro' && buy[2].appAccountToken === 'acct-token-1', 'P3 iOS: StoreKit buys the tier\'s product with the SERVER-issued account token');
  ok(d.invokes[0]?.[0] === 'store-account-token' && d.invokes[1]?.[0] === 'store-verify' && d.invokes[1]?.[1]?.platform === 'apple' && d.invokes[1]?.[1]?.signedTransaction === 'jws.payload.sig',
    'P3 iOS: the signed transaction goes to store-verify (server verification)');
  ok(d.syncs === 1 && r.ok === true && r.status === 'submitted', 'P3 iOS: then the tier is re-read from the server');
  ok(shape(r) === RESULT_KEYS && !('tier' in r), 'P3 the result carries no tier (only ok / status / reason / message)');
  ok(!lsLog.some(e => e[0] !== 'get') && lsMap.size === 0, 'P3 a plugin or server answer naming a tier writes nothing on the client');
}
{
  calls.length = 0;
  const d = mkDeps({ 'store-account-token': { data: null, error: { message: 'down' } } });
  const r = await PAY.nativePayment('purchase', 'investor', d, IOS, PRODUCTS);
  ok(r.status === 'error' && r.reason === 'no-account-token' && !calls.some(c => c[1] === 'purchase'), 'P3 without a server account token nothing is bought');
}
{
  calls.length = 0;
  nativeAnswer = () => ({ status: 'cancelled' });
  const d = mkDeps({ 'store-account-token': { data: { token: 't' } } });
  const r = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS);
  ok(r.status === 'cancelled' && !d.invokes.some(i => i[0] === 'store-verify'), 'P3 a cancelled purchase sends nothing for verification');
  nativeAnswer = () => ({ status: 'pending' });
  const r2 = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS);
  ok(r2.status === 'pending' && !d.invokes.some(i => i[0] === 'store-verify'), 'P3 a pending purchase (Ask to Buy) sends nothing for verification');
  nativeAnswer = () => ({ status: 'purchased' });
  const r3 = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS);
  ok(r3.status === 'error' && r3.reason === 'no-proof', 'P3 "purchased" with no signed transaction is an error, never a success');
}
{
  calls.length = 0;
  nativeAnswer = () => ({ status: 'purchased', signedTransaction: 'jws' });
  const d = mkDeps({ 'store-account-token': { data: { token: 't' } }, 'store-verify': { data: null, error: { message: 'invalid' } } });
  const r = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS);
  ok(r.ok === false && r.reason === 'verify-failed' && d.syncs === 1, 'P3 a refused verification is reported as failed; the tier is still re-read from the server');
}
for (const t of ['starter', 'admin', '', undefined]) {
  calls.length = 0;
  const d = mkDeps({ 'store-account-token': { data: { token: 't' } } });
  const r = await PAY.nativePayment('purchase', t, d, IOS, PRODUCTS);
  ok(r.reason === 'unknown-tier' && calls.length === 0 && d.invokes.length === 0, 'P3 tier ' + JSON.stringify(t) + ' is refused before any call');
}
{
  calls.length = 0;
  const d = mkDeps();
  const r = await PAY.nativePayment('purchase', 'pro', d, IOS);   // the shipped placeholder products
  ok(r.reason === 'no-product' && calls.length === 0 && d.invokes.length === 0, 'P3 even when enabled, the placeholder product ids refuse (no purchase without real store products)');
}
{
  calls.length = 0;
  nativeAnswer = (p, m) => (m === 'currentEntitlements' ? { signedTransactions: ['j1', 'j2', 7, ''] } : {});
  const d = mkDeps({ 'store-verify': { data: { ok: true } } });
  const r = await PAY.nativePayment('restore', null, d, IOS, PRODUCTS);
  const v = d.invokes.filter(i => i[0] === 'store-verify').map(i => i[1].signedTransaction);
  ok(JSON.stringify(v) === '["j1","j2"]' && d.syncs === 1 && r.ok, 'P3 iOS restore: each current transaction is verified by the server, then one tier re-read');
  calls.length = 0;
  await PAY.nativePayment('manage', null, d, IOS, PRODUCTS);
  ok(calls.some(c => c[0] === 'DealFitStoreKit' && c[1] === 'showManageSubscriptions'), 'P3 iOS manage: the system subscription sheet');
}
{
  capValue = bridge('android'); calls.length = 0;
  nativeAnswer = (p, m) => (p === 'DealFitPlayBilling' && m === 'purchase' ? { status: 'purchased', purchaseToken: 'ptok' } : {});
  const d = mkDeps({ 'store-account-token': { data: { token: 'acct-2' } }, 'store-verify': { data: { ok: true } } });
  const r = await PAY.nativePayment('purchase', 'investor', d, AND, PRODUCTS);
  const buy = calls.find(c => c[0] === 'DealFitPlayBilling' && c[1] === 'purchase');
  ok(buy && buy[2].productId === 'test_investor' && buy[2].obfuscatedAccountId === 'acct-2', 'P3 Android: Play Billing buys with the server-issued obfuscated account id');
  ok(d.invokes[1]?.[1]?.platform === 'google' && d.invokes[1]?.[1]?.purchaseToken === 'ptok' && d.syncs === 1 && shape(r) === RESULT_KEYS, 'P3 Android: the purchase token goes to store-verify, then a server tier re-read; no tier in the result');
  calls.length = 0;
  await PAY.nativePayment('manage', null, d, AND, PRODUCTS);
  const o = calls.find(c => c[0] === 'AppLauncher');
  ok(o && o[2].url === 'https://play.google.com/store/account/subscriptions', 'P3 Android manage: Google Play\'s subscriptions page in the system browser');
}
for (const [platform, choice] of [['ios', { ios: 'ios-external-link', android: null }], ['android', { ios: null, android: 'android-external-link' }]]) {
  capValue = bridge(platform); calls.length = 0;
  const d = mkDeps();
  const r = await PAY.nativePayment('purchase', 'pro', d, choice, PRODUCTS);
  ok(r.status === 'opened' && calls.length === 1 && calls[0][0] === 'AppLauncher' && calls[0][2].url === PAY.EXTERNAL_PLANS_URL && d.invokes.length === 0,
    'P3 ' + platform + ' link-out: the web plans page opens in the SYSTEM browser (not the in-app Browser), with no server call from the app');
}
{
  capValue = bridge('ios'); calls.length = 0;
  nativeAnswer = () => { throw new Error('plugin crashed'); };
  const d = mkDeps({ 'store-account-token': { data: { token: 't' } } });
  let threw = false, r;
  try { r = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS); } catch { threw = true; }
  ok(!threw && r.status === 'error', 'P3 nativePayment never throws (a plugin crash is an error result)');
  const d2 = mkDeps({ 'store-account-token': async () => { throw new Error('network'); } });
  const r2 = await PAY.nativePayment('purchase', 'pro', d2, IOS, PRODUCTS);
  ok(r2.status === 'error', 'P3 … nor does a server call that throws');
}
capValue = undefined;

console.log(`\npayments: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
