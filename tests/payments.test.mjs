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
import { createHash } from 'node:crypto';
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
  d.signedIn = true; d.isSignedIn = () => d.signedIn;
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

// main.js: the web Stripe path is byte-identical to b24b95d outside the two app-only guard
// lines, and each guard line is EXACTLY the expected statement (an extra statement on the
// guard's own line would run on the web — review R1-4). Pinned twice: against b24b95d when the
// clone has it, and by a content hash that needs no git (never a vacuous skip — review R1-7).
const mainNow = src('docs/src/js/main.js').replace(/\r\n/g, '\n');
let mainBase = null;
try { mainBase = execFileSync('git', ['-C', root, 'show', 'b24b95d:docs/src/js/main.js'], { encoding: 'utf8' }).replace(/\r\n/g, '\n'); } catch {}
const bodyOf = (t, name, kw) => { const a = t.indexOf(kw + ' ' + name + '('); if (a < 0) return null; const b = t.indexOf('\n}\n', a); return t.slice(a, b + 3); };
const GUARD_TOKEN = '<<APP-ONLY GUARD>>';
const tokenize = (s) => s && s.split('\n').map(l => (/^\s*if \(!paymentsInApp\(\)\)/.test(l) ? GUARD_TOKEN : l)).join('\n');
const webPath = (t) => [tokenize(bodyOf(t, 'startCheckout', 'async function')), tokenize(bodyOf(t, 'manageSubscription', 'async function')), bodyOf(t, 'handleCheckoutReturn', 'function')].join('\n---\n');
const WEB_PATH_SHA256_B24B95D = 'f160a31ac74ac8614ea08ce534cba7d7a0063e01cabbd74d1a515f3a97b57a6e';
ok(createHash('sha256').update(webPath(mainNow)).digest('hex') === WEB_PATH_SHA256_B24B95D,
  'P1 main.js startCheckout / manageSubscription (outside the guard line) and handleCheckoutReturn hash to the b24b95d web path');
if (mainBase) ok(webPath(mainNow) === webPath(mainBase), 'P1 … and equal b24b95d\'s text (git comparison)');
const EXPECT_GUARD = {
  startCheckout: /^  if \(!paymentsInApp\(\)\) \{ showToast\(await appPayment\('purchase', tierName\)\); return; \}(   \/\/ [^\n]*)?$/,
  manageSubscription: /^  if \(!paymentsInApp\(\)\) \{ showToast\(await appPayment\('manage', null\)\); return; \}(   \/\/ [^\n]*)?$/,
};
for (const fn of Object.keys(EXPECT_GUARD)) {
  const lines = bodyOf(mainNow, fn, 'async function').split('\n');
  const g = lines.filter(l => /paymentsInApp\(\)/.test(l));
  ok(g.length === 1 && lines[1] === g[0] && EXPECT_GUARD[fn].test(g[0]),
    'P1 main.js ' + fn + ': its first statement is exactly the app-only guard (nothing else on that line)');
}
ok(!/from '\.\/payments\.js'/.test(mainNow) && (mainNow.match(/import\('\.\/payments\.js'\)/g) || []).length === 1,
  'P1 main.js never imports payments.js statically: the web never requests it (one dynamic import, in appPayment)');
const appPay = bodyOf(mainNow, 'appPayment', 'async function');
ok(/import\('\.\/payments\.js'\)/.test(appPay) && /catch \{ return NATIVE_PAYMENT_MESSAGE; \}/.test(appPay),
  'P1 appPayment loads payments.js on demand and falls back to the existing refusal message if it cannot');
const callers = mainNow.split('\n').filter(l => /appPayment\(/.test(l) && !/async function appPayment/.test(l));
ok(callers.length === 2 && callers.every(l => /^  if \(!paymentsInApp\(\)\) \{ showToast\(await appPayment\(/.test(l)), 'P1 appPayment is called only from the two app-only guards');
ok(PLAT.paymentsInApp() === true, 'P1 on the web paymentsInApp() is true, so those guards never run');
const depsBlock = mainNow.slice(mainNow.indexOf('const PAYMENT_DEPS = {'), mainNow.indexOf('};', mainNow.indexOf('const PAYMENT_DEPS = {')));
ok(/sync: \(\) => syncEntitlement\(\)/.test(depsBlock) && /isSignedIn: \(\) => isSignedIn\(\)/.test(depsBlock) && !/setCachedTier|localStorage/.test(depsBlock),
  'P1 PAYMENT_DEPS re-reads the tier from the server (syncEntitlement), reports sign-in, and never sets a tier');

// ─── §P2 the app as shipped: everything refused before any effect ──────────
console.log('— §P2 app, shipped choice —');
const calls = [];
const H = (name, methods) => ({ name, methods: methods.map(n => ({ name: n, rtype: 'promise' })) });
const HEADERS = [
  H('DealFitStoreKit', ['purchase', 'currentEntitlements', 'showManageSubscriptions', 'storefront']),
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
// Link-outs (review R1-1). iOS: only on the U.S. storefront, system browser, no server call.
{
  const IOSL = { ios: 'ios-external-link', android: null };
  capValue = bridge('ios'); calls.length = 0;
  nativeAnswer = (p, m) => (p === 'DealFitStoreKit' && m === 'storefront' ? { countryCode: 'USA' } : {});
  const d = mkDeps();
  const r = await PAY.nativePayment('purchase', 'pro', d, IOSL, PRODUCTS);
  const opens = calls.filter(c => c[0] === 'AppLauncher');
  ok(r.status === 'opened' && opens.length === 1 && opens[0][2].url === PAY.EXTERNAL_PLANS_URL && !calls.some(c => c[0] === 'Browser') && d.invokes.length === 0,
    'P3 iOS link-out (U.S. storefront): the public web app opens in the SYSTEM browser (not the in-app Browser), with no server call from the app');
  for (const cc of ['CAN', 'GBR', '', undefined]) {
    calls.length = 0;
    nativeAnswer = (p, m) => (m === 'storefront' ? { countryCode: cc } : {});
    const r2 = await PAY.nativePayment('purchase', 'pro', mkDeps(), IOSL, PRODUCTS);
    ok(r2.reason === 'not-us-storefront' && !calls.some(c => c[0] === 'AppLauncher'), 'P3 iOS link-out refused on storefront ' + JSON.stringify(cc) + ' (nothing opens)');
  }
  nativeAnswer = () => ({});
}
{
  // Android: Google's external-content-links program (PBL 8.2.1+ token, information screen, reporting)
  // is not integrated, so the Android link-out is refused EVEN WHEN CHOSEN, before any call.
  capValue = bridge('android'); calls.length = 0;
  const d = mkDeps();
  const ANDL = { ios: null, android: 'android-external-link' };
  const rs = [await PAY.nativePayment('purchase', 'pro', d, ANDL, PRODUCTS), await PAY.nativePayment('manage', null, d, ANDL, PRODUCTS), await PAY.nativePayment('restore', null, d, ANDL, PRODUCTS)];
  ok(rs.every(r => r.reason === 'program-not-integrated') && calls.length === 0 && d.invokes.length === 0,
    'P2 Android link-out is refused even when chosen (Google\'s program is not integrated), before any call');
  ok(PAY.LINK_PROGRAM_READY.google === false && Object.isFrozen(PAY.LINK_PROGRAM_READY), 'P2 SHIPPED: Google link-out readiness is false (frozen; enabling it re-pins this test)');
}
{
  // Sign-in, busy guard and per-operation copy (review R1-5).
  capValue = bridge('ios'); calls.length = 0;
  const d = mkDeps({ 'store-account-token': { data: { token: 't' } } }); d.signedIn = false;
  const r = await PAY.nativePayment('purchase', 'pro', d, IOS, PRODUCTS);
  const r2 = await PAY.nativePayment('restore', null, d, IOS, PRODUCTS);
  ok(r.reason === 'signed-out' && r.message === PAY.PAYMENT_MESSAGES.signedOut && r2.reason === 'signed-out' && calls.length === 0 && d.invokes.length === 0,
    'P3 signed out: purchase and restore say "Sign in first" before any token call or store sheet');
  const dNo = mkDeps(); delete dNo.isSignedIn;
  const r3 = await PAY.nativePayment('purchase', 'pro', dNo, IOS, PRODUCTS);
  ok(r3.reason === 'signed-out' && calls.length === 0, 'P3 a missing isSignedIn dependency counts as signed out (fail closed)');
  let release; const gate = new Promise(res => { release = res; });
  nativeAnswer = (p, m) => (m === 'purchase' ? gate.then(() => ({ status: 'cancelled' })) : {});
  const d4 = mkDeps({ 'store-account-token': { data: { token: 't' } } });
  const first = PAY.nativePayment('purchase', 'pro', d4, IOS, PRODUCTS);
  await new Promise(res => setTimeout(res, 0));
  const secondP = PAY.nativePayment('purchase', 'pro', d4, IOS, PRODUCTS);   // raced: without the guard it would wait on the first sheet
  const second = await Promise.race([secondP, new Promise(res => setTimeout(() => res({ reason: 'still-waiting (no busy guard)' }), 50))]);
  release(); await first; await secondP;
  ok(second.reason === 'busy' && second.message === PAY.PAYMENT_MESSAGES.busy && calls.filter(c => c[1] === 'purchase').length === 1 && d4.invokes.filter(i => i[0] === 'store-account-token').length === 1,
    'P3 a second tap while a purchase runs is refused (one token call, one store sheet)');
  const after = await PAY.nativePayment('purchase', 'pro', d4, IOS, PRODUCTS);
  ok(after.reason !== 'busy', 'P3 … and the guard is released when the first one ends');
  nativeAnswer = (p, m) => { if (m === 'showManageSubscriptions') throw new Error('sheet failed'); return {}; };
  const rm = await PAY.nativePayment('manage', null, mkDeps(), IOS, PRODUCTS);
  ok(rm.status === 'error' && rm.message === PAY.PAYMENT_MESSAGES.manageError, 'P3 a manage failure shows the manage copy, not the purchase copy');
  nativeAnswer = (p, m) => (m === 'currentEntitlements' ? { signedTransactions: ['j'] } : {});
  const rr = await PAY.nativePayment('restore', null, mkDeps({ 'store-verify': { error: { message: 'no' } } }), IOS, PRODUCTS);
  ok(rr.status === 'error' && rr.message === PAY.PAYMENT_MESSAGES.restoreError, 'P3 a restore failure shows the restore copy');
  nativeAnswer = () => ({});
}
{
  // Non-interactive calls are bounded; interactive ones are not (reviews R2-1, R3-1, R3-3).
  capValue = bridge('ios'); calls.length = 0;
  PAY.setNativeCallTimeout?.(30);
  nativeAnswer = (p, m) => (m === 'currentEntitlements' ? new Promise(() => {}) : {});
  const dh = mkDeps();
  const hung = await Promise.race([PAY.nativePayment('restore', null, dh, IOS, PRODUCTS), new Promise(res => setTimeout(() => res({ reason: 'still-hung' }), 500))]);
  ok(hung.status === 'error' && hung.message === PAY.PAYMENT_MESSAGES.restoreError, 'P3 a non-interactive call that never answers (currentEntitlements) ends as an error after the timeout');
  nativeAnswer = (p, m) => (m === 'currentEntitlements' ? { signedTransactions: [] } : {});
  const next = await PAY.nativePayment('restore', null, mkDeps(), IOS, PRODUCTS);
  ok(next.reason !== 'busy' && next.ok, 'P3 … and the one-operation guard is free again (not stuck for the session)');
  // A purchase sheet open far longer than the timeout is NOT cut off: its late proof is verified.
  nativeAnswer = (p, m) => (m === 'purchase' ? new Promise(res => setTimeout(() => res({ status: 'purchased', signedTransaction: 'late.jws' }), 120)) : {});
  const dl = mkDeps({ 'store-account-token': { data: { token: 't' } }, 'store-verify': { data: { ok: true } } });
  const slow = await PAY.nativePayment('purchase', 'pro', dl, IOS, PRODUCTS);
  ok(slow.ok && slow.status === 'submitted' && dl.invokes.some(i => i[0] === 'store-verify' && i[1].signedTransaction === 'late.jws') && dl.syncs === 1,
    'P3 a purchase sheet open past the timeout is not cut off: the late proof goes to store-verify, then a tier re-read');
  // …and while it is open, a second tap is refused (no second sheet, no second charge).
  let release2; const g2 = new Promise(res => { release2 = res; });
  nativeAnswer = (p, m) => (m === 'purchase' ? g2.then(() => ({ status: 'cancelled' })) : {});
  const d2 = mkDeps({ 'store-account-token': { data: { token: 't' } } });
  const open = PAY.nativePayment('purchase', 'pro', d2, IOS, PRODUCTS);
  await new Promise(res => setTimeout(res, 80));   // well past the 30 ms bound
  const tap2 = await PAY.nativePayment('purchase', 'investor', d2, IOS, PRODUCTS);
  ok(tap2.reason === 'busy' && d2.invokes.filter(i => i[0] === 'store-account-token').length === 1, 'P3 … and past the timeout a second purchase is still refused while the sheet is open');
  release2(); await open;
  nativeAnswer = (p, m) => (m === 'showManageSubscriptions' ? new Promise(res => setTimeout(() => res({}), 120)) : {});
  const mg = await PAY.nativePayment('manage', null, mkDeps(), IOS, PRODUCTS);
  ok(mg.ok && mg.status === 'opened', 'P3 the manage sheet kept open past the timeout is not reported as an error');
  PAY.setNativeCallTimeout?.(120000);
  for (const bad of [undefined, 0, -5, NaN, Infinity, '30']) PAY.setNativeCallTimeout?.(bad);
  nativeAnswer = (p, m) => (m === 'currentEntitlements' ? new Promise(res => setTimeout(() => res({ signedTransactions: [] }), 40)) : {});
  const ok40 = await PAY.nativePayment('restore', null, mkDeps(), IOS, PRODUCTS);
  ok(ok40.ok, 'P3 setNativeCallTimeout ignores invalid values (undefined / 0 / negative / NaN / Infinity / string)');
  nativeAnswer = () => ({});
}
{
  // iOS link-out restore re-reads the tier from the server (review R2-2).
  capValue = bridge('ios'); calls.length = 0;
  const d = mkDeps();
  const r = await PAY.nativePayment('restore', null, d, { ios: 'ios-external-link', android: null }, PRODUCTS);
  ok(r.ok && r.status === 'submitted' && d.syncs === 1 && calls.length === 0 && d.invokes.length === 0, 'P3 iOS link-out restore: one server tier re-read, no plugin or server call');
  d.signedIn = false;
  const r2 = await PAY.nativePayment('restore', null, d, { ios: 'ios-external-link', android: null }, PRODUCTS);
  ok(r2.reason === 'signed-out' && d.syncs === 1, 'P3 … and signed out it says "Sign in first" instead');
}
{
  // Android restore (review R1-9).
  capValue = bridge('android'); calls.length = 0;
  nativeAnswer = (p, m) => (m === 'queryPurchases' ? { purchaseTokens: ['p1', null, 'p2'] } : {});
  const d = mkDeps({ 'store-verify': { data: { ok: true } } });
  const r = await PAY.nativePayment('restore', null, d, AND, PRODUCTS);
  const v = d.invokes.filter(i => i[0] === 'store-verify').map(i => i[1].platform + ':' + i[1].purchaseToken);
  ok(JSON.stringify(v) === '["google:p1","google:p2"]' && d.syncs === 1 && r.ok && shape(r) === RESULT_KEYS, 'P3 Android restore: each purchase token is verified by the server, then one tier re-read');
  nativeAnswer = () => ({});
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
