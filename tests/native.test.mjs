// Native-readiness wave (2026-11-24, local) — regression suite.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/native.test.mjs
//
//   §A web law: with no native bridge every platform.js export does exactly what
//      the call site did before (share, window.open, Stripe redirect, install),
//      and initPlatform() changes nothing;
//   §B session storage on the WEB is identical — checked against the REAL shipped
//      supabaseClient.js and the vendored SDK: same storage object (localStorage),
//      same key, persistence on, detectSessionInUrl off, URL tokens never used;
//   §C the app (a scripted Capacitor bridge): plugins without @capacitor/core,
//      share, in-app browser, payment refusal, install hidden, Android Back into
//      the view stack, deep links, status bar / keyboard;
//   §D the secure session adapter: Keychain/Keystore contract, migration out of
//      WebView localStorage, fail-closed memory, and — with the real SDK — sign-out
//      (even offline) and account switch leave no token behind;
//   §E .nojekyll: what changes on GitHub Pages (pinned so a new file cannot
//      silently change it), and the files this wave must not touch.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');
let pass = 0, fail = 0; const fails = [];
const ok = (v, label) => { if (v) pass++; else { fail++; fails.push(label); } };
const tick = () => new Promise(r => setTimeout(r, 0));

// ── Browser-like globals (web: NO window.Capacitor) ─────────────────────────
const lsMap = new Map();
const localStorageFake = {
  getItem: k => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => lsMap.set(k, String(v)),
  removeItem: k => lsMap.delete(k),
  clear: () => lsMap.clear(),
  key: i => [...lsMap.keys()][i] ?? null,
  get length() { return lsMap.size; },
};
const ssMap = new Map();
const sessionStorageFake = { getItem: k => (ssMap.has(k) ? ssMap.get(k) : null), setItem: (k, v) => ssMap.set(k, String(v)), removeItem: k => ssMap.delete(k) };
const winListeners = {}, docListeners = {};
const opened = [];
const loc = {
  href: 'https://dealfit.clearpathcapfunding.com/', origin: 'https://dealfit.clearpathcapfunding.com', replaced: [],
  replace(u) { this.replaced.push(u); this.href = u; },
  get pathname() { return new URL(this.href).pathname; }, get search() { return new URL(this.href).search; }, get hash() { return new URL(this.href).hash; },
};
const styles = [];
const rootEl = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
globalThis.window = globalThis;
globalThis.localStorage = localStorageFake;
globalThis.sessionStorage = sessionStorageFake;
globalThis.location = loc;
globalThis.document = {
  documentElement: rootEl,
  head: { appendChild: (n) => styles.push(n) },
  createElement: () => ({ textContent: '' }),
  addEventListener(t, f) { (docListeners[t] ||= []).push(f); },
  getElementById: () => null,
};
globalThis.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); };
const rawOpen = (...a) => { opened.push(a); return { fake: 'window' }; };
globalThis.open = rawOpen;
// Network: an in-memory fake. Every request is recorded; nothing leaves the process.
const fetchLog = [];
let fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
globalThis.fetch = (...a) => { fetchLog.push(String(a[0])); return fetchImpl(...a); };
try { Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true }); } catch {}

register(new URL('./_hooks/realclient-loader.mjs', import.meta.url));
const shareJs = src('docs/src/js/share.js'), installJs = src('docs/src/js/install.js'), mainJs = src('docs/src/js/main.js');
const P = await import('../docs/src/js/platform.js');
const S = await import('../docs/src/js/sessionStore.js');

// ─── §A web law ──────────────────────────────────────────────────────────────
console.log('— §A web law —');
ok(P.isNative() === false && P.platformId() === 'web', 'A1 no bridge → web');
globalThis.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
ok(P.isNative() === false && P.plugin('Share') === null, 'A2 a Capacitor object that says "not native" (core on the web) is still the web');
delete globalThis.Capacitor;
ok(P.canShare() === false, 'A3 canShare = !!navigator.share (absent)');
const shared = [];
navigator.share = (p) => { shared.push(p); return Promise.resolve(); };
ok(P.canShare() === true, 'A3 canShare = !!navigator.share (present)');
const payload = { title: 't', text: 'x', url: 'https://dealfit.clearpathcapfunding.com/shared.html?d=abc' };
await P.share(payload);
ok(shared.length === 1 && shared[0] === payload, 'A4 share() hands the SAME payload object to navigator.share');
navigator.share = () => Promise.reject(new Error('AbortError'));
let rejected = false; try { await P.share(payload); } catch { rejected = true; }
ok(rejected, 'A4 a dismissed web share still rejects (share.js shows its fallback as before)');
delete navigator.share;
const r1 = P.openExternal('https://clearpathcapfunding.com/get-funding?pp=1');
ok(opened.length === 1 && opened[0][0] === 'https://clearpathcapfunding.com/get-funding?pp=1' && opened[0][1] === '_blank' && opened[0][2] === 'noopener' && r1 && r1.fake, 'A5 openExternal = window.open(url, "_blank", "noopener"), the analyzers\' exact call');
ok(P.openPaymentPage('stub://checkout') === true && loc.href === 'stub://checkout' && P.paymentsInApp() === true, 'A6 payment pages navigate exactly as before (location.href)');
loc.href = 'https://dealfit.clearpathcapfunding.com/';
ok(P.isInstalledApp() === false, 'A7 the web is never treated as the installed app');
ok(P.initPlatform({ canStepBack: () => true }) === false && globalThis.open === rawOpen && !docListeners.click && !rootEl.attrs['data-platform'] && styles.length === 0,
  'A8 initPlatform on the web: no window.open shim, no click listener, no attribute, no style');
const shWeb = await import('../docs/src/js/share.js?fresh=web');
ok(typeof shWeb.openShareApp === 'function' && /const APP_URL = isNative\(\) \? PUBLIC_ORIGIN/.test(src('docs/src/js/share.js')), 'A8 share.js still imports cleanly on the web');
ok((mainJs.match(/if \(!paymentsInApp\(\)\) \{ showToast\(NATIVE_PAYMENT_MESSAGE\); return; \}/g) || []).length === 2 && P.paymentsInApp() === true, 'A8 the in-app payment gate is a no-op on the web (paymentsInApp() is true)');
ok(JSON.stringify(S.authStorageOption()) === '{}' && Object.keys(S.authStorageOption()).length === 0, 'A9 web session option adds no key at all');

// Source pins: every named call site routes through the layer.
ok(/from '\.\/platform\.js'/.test(shareJs) && (shareJs.match(/await platformShare\(/g) || []).length === 2 && !/navigator\.share\(/.test(shareJs) && /function canNativeShare\(\) \{ return canShare\(\); \}/.test(shareJs),
  'A10 share.js: both share paths and the capability test go through platform.js');
ok(/isInstalledApp\(\) \|\|/.test(installJs) && !/^import /m.test(installJs) && installJs.includes("window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform() === true")
  && src('docs/src/js/platform.js').includes("c && typeof c.isNativePlatform === 'function' && c.isNativePlatform() === true"),
  'A11 install.js: the app counts as installed (no "Get the App", no prompt, no toast) — the same native test as platform.js, inlined (install.js stays import-free)');
ok(!/location\.href = data\.url/.test(mainJs) && (mainJs.match(/if \(openPaymentPage\(data\.url\)\) return; showToast\(NATIVE_PAYMENT_MESSAGE\);/g) || []).length === 2,
  'A12 main.js: checkout and portal redirects go through openPaymentPage');
ok(/initPlatform\(\{\s*canStepBack,\s*requiredSheetOpen: \(\) => \{ const t = topSheet\(\);[^\n]*dataset\.required\); \},\s*authParams: AUTH_LINK_PARAMS,\s*\}\);/.test(mainJs) && mainJs.indexOf('initPlatform({') > mainJs.indexOf('initViewStack({'),
  'A13 main.js starts the platform layer after the view stack, with the required-sheet test');
for (const f of ['clearpath', 'ltr', 'brrr']) ok(/window\.open\(buildCpcUrl\([^)]*\)+, '_blank', 'noopener'\)/.test(src(`docs/src/js/${f}.js`)), `A14 ${f}.js keeps its exact window.open call (the app shim routes it)`);

// ─── §B web session storage is identical (REAL client) ──────────────────────
console.log('— §B web session storage —');
const sbSrc = src('docs/src/js/supabaseClient.js');
const opts = (sbSrc.match(/createClient\(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, \{([\s\S]*?)\n\}\);/) || ['', ''])[1].replace(/\/\/[^\n]*/g, '');
ok(/persistSession: true,/.test(opts) && /autoRefreshToken: true,/.test(opts) && /detectSessionInUrl: false,/.test(opts) && /\.\.\.authStorageOption\(\),/.test(opts),
  'B1 client options: persistSession, autoRefreshToken, detectSessionInUrl:false, plus the (web-empty) storage option');
ok(!/storage\s*:/.test(opts) && !/storageKey/.test(opts) && !/flowType/.test(opts), 'B2 no literal storage, storageKey or flowType override');
const real = await import('../docs/src/js/supabaseClient.js?real');
const A = real.supabase.auth;
ok(A.storage === globalThis.localStorage, 'B3 the real client stores the session in localStorage itself (same object as before)');
ok(A.storageKey === 'sb-qbddbblhduzwcfwslbac-auth-token', 'B4 same storage key: sb-qbddbblhduzwcfwslbac-auth-token');
ok(A.persistSession === true && A.autoRefreshToken === true && A.detectSessionInUrl === false, 'B5 persistence on, refresh on, URL sessions off');
await A.initializePromise;
const before = fetchLog.length;
// A URL carrying someone's tokens is never taken (login-CSRF closure stays intact).
loc.href = 'https://dealfit.clearpathcapfunding.com/#access_token=evil&refresh_token=evil&expires_in=3600&token_type=bearer&type=magiclink';
const { data: gs } = await A.getSession();
ok(!gs.session && lsMap.size === 0, 'B6 an #access_token in the address is not turned into a session; nothing is stored');
ok(fetchLog.slice(before).every(u => !/qbddbblhduzwcfwslbac/.test(u)), 'B7 no request reached the production project during these checks');
loc.href = 'https://dealfit.clearpathcapfunding.com/';
// Proven identity: the same options WITHOUT this wave's code give the same storage choice.
const { createClient } = await import('../docs/vendor/supabase-js-2.112.3.js');
const prior = createClient('http://127.0.0.1:9', 'sb_publishable_test_only_not_a_key', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
ok(prior.auth.storage === A.storage && prior.auth.persistSession === A.persistSession, 'B8 the pre-wave option set selects the identical storage');

// ─── §C the app (a Capacitor 8 bridge, as the shells build it) ─────────────
console.log('— §C native shell —');
const calls = [];
const callbacks = {};
let launchUrl = null;
const H = (name, methods) => ({ name, methods: methods.map(([n, rtype]) => ({ name: n, rtype })) });
const HEADERS = [
  H('Share', [['share', 'promise'], ['canShare', 'promise']]),
  H('Browser', [['open', 'promise'], ['close', 'promise'], ['addListener', 'callback'], ['removeListener', 'callback']]),
  H('App', [['addListener', 'callback'], ['removeListener', 'callback'], ['minimizeApp', 'promise'], ['exitApp', 'promise'], ['getLaunchUrl', 'promise']]),
  H('Haptics', [['selectionChanged', 'promise'], ['impact', 'promise']]),
  H('StatusBar', [['setStyle', 'promise'], ['setOverlaysWebView', 'promise']]),
  H('Keyboard', [['setAccessoryBarVisible', 'promise'], ['addListener', 'callback'], ['removeListener', 'callback']]),
  H('SecureStoragePlugin', [['get', 'promise'], ['set', 'promise'], ['remove', 'promise']]),
];
// mode 'jsexport' (default) = what Capacitor 8's Android JSExport / iOS JSExport.swift
// inject: Capacitor.Plugins PRE-FILLED, methods → nativePromise / nativeCallback, and
// addListener → cap.addListener, which returns a plain { remove } (native-bridge.js
// initEvents) — not a Promise. 'core' = @capacitor/core proxies (addListener returns a
// Promise). 'empty' = Plugins not filled (the fallback path).
function bridge(platform, mode = 'jsexport') {
  const cap = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
    Plugins: {},
    PluginHeaders: HEADERS,
    nativePromise(p, m, o) {
      calls.push([p, m, o]);
      if (p === 'App' && m === 'getLaunchUrl') return Promise.resolve(launchUrl ? { url: launchUrl } : {});
      if (p === 'SecureStoragePlugin') return secureFake(m, o);
      return Promise.resolve({});
    },
    nativeCallback(p, m, o, cb) { calls.push([p, m, o]); if (m === 'addListener') callbacks[p + ':' + o.eventName] = cb; return 'cb' + calls.length; },
  };
  cap.addListener = (p, eventName, cb) => { const id = cap.nativeCallback(p, 'addListener', { eventName }, cb); return { remove: async () => cap.nativeCallback(p, 'removeListener', { callbackId: id, eventName }, cb) }; };
  if (mode !== 'empty') {
    for (const hd of HEADERS) {
      const t = {};
      for (const m of hd.methods) {
        if (m.name === 'addListener' || m.name === 'removeListener') continue;
        t[m.name] = m.rtype === 'promise' ? (o) => cap.nativePromise(hd.name, m.name, o) : (o, cb) => cap.nativeCallback(hd.name, m.name, o, cb);
      }
      t.addListener = mode === 'core'
        ? (e, cb) => Promise.resolve(cap.addListener(hd.name, e, cb))
        : (e, cb) => cap.addListener(hd.name, e, cb);
      cap.Plugins[hd.name] = t;
    }
  }
  return cap;
}
const secure = new Map();
function secureFake(m, o) {
  if (m === 'get') return secure.has(o.key) ? Promise.resolve({ value: secure.get(o.key) }) : Promise.reject(new Error('Item with given key does not exist'));
  if (m === 'set') { secure.set(o.key, o.value); return Promise.resolve(); }
  if (m === 'remove') { secure.delete(o.key); return Promise.resolve(); }
  return Promise.reject(new Error('unknown'));
}
const callsTo = (p, m) => calls.filter(c => c[0] === p && (!m || c[1] === m));

globalThis.Capacitor = bridge('android');
P._resetForTests();
ok(P.isNative() && P.platformId() === 'android', 'C1 the bridge says native → android');
const share = P.plugin('Share');
ok(share && share === globalThis.Capacitor.Plugins.Share, 'C2 plugin() returns the object the shell pre-filled in Capacitor.Plugins');
ok(P.plugin('NotInShell') === null, 'C2 a plugin the shell does not carry → null');
ok(P.canShare() === true, 'C4 the app can share even though Android WebView has no navigator.share');
await P.share({ title: 'Deal', text: 'msg', url: 'https://dealfit.clearpathcapfunding.com/shared.html?d=tok' });
const sc = callsTo('Share', 'share')[0];
ok(sc && sc[2].url === 'https://dealfit.clearpathcapfunding.com/shared.html?d=tok' && sc[2].text === 'msg' && sc[2].title === 'Deal', 'C5 share → the native share sheet with title, text and url');
let callThrew = false;
try { await P.call({ boom() { throw new Error('sync'); } }, 'boom').catch(() => {}); await P.listen({ addListener() { throw new Error('sync'); } }, 'x', () => {}); } catch { callThrew = true; }
ok(!callThrew, 'C5 call() / listen() turn a plugin\'s synchronous throw into a settled Promise');
// Share links from inside the app point at the site, not at the bundle (review R1-2).
loc.href = 'https://localhost/index.html'; loc.origin = 'https://localhost';
const shareFresh = await import('../docs/src/js/share.js?fresh');
calls.length = 0;
await shareFresh.openShareApp();
const sa = callsTo('Share', 'share')[0];
ok(sa && sa[2].url === 'https://dealfit.clearpathcapfunding.com/' && !/localhost/.test(JSON.stringify(sa[2])), 'C5 "Share DealFit" in the app shares the public site, never capacitor:// or localhost');
ok(/const APP_URL = isNative\(\) \? PUBLIC_ORIGIN \+ '\/' : \(typeof location !== 'undefined' \? location\.href : ''\)\.split\('#'\)\[0\];/.test(shareJs + src('docs/src/js/share.js')),
  'C5 share.js: the web keeps location.href; only the app uses the public origin (shared-deal links derive from it)');
// External pages
opened.length = 0;
P.openExternal('https://clearpathcapfunding.com/get-funding?pp=250000');
let bo = callsTo('Browser', 'open').pop();
ok(bo && bo[2].url === 'https://clearpathcapfunding.com/get-funding?pp=250000' && opened.length === 0, 'C6 the CPC hand-off opens in the in-app browser, not a WebView window');
P.openExternal('terms.html');
bo = callsTo('Browser', 'open').pop();
ok(bo && bo[2].url === 'https://dealfit.clearpathcapfunding.com/terms.html', 'C7 a bundled legal page opens its PUBLISHED copy in the in-app browser');
const nBrowser = callsTo('Browser', 'open').length;
ok(P.externalTarget('javascript:alert(1)') === null && P.externalTarget('data:text/html,x') === null && P.externalTarget('http://example.com/') === null,
  'C8 javascript:, data: and cleartext http: are never opened');
P.openExternal('javascript:alert(1)');
ok(callsTo('Browser', 'open').length === nBrowser, 'C8 …and nothing reaches the browser plugin for them');
ok(P.externalTarget('mailto:a@b.c?subject=x').kind === 'system', 'C9 mailto: goes to the system (Mail)');
// Payments refused in the app
ok(P.openPaymentPage('https://checkout.stripe.com/c/pay/x') === false && loc.href === 'https://localhost/index.html' && P.paymentsInApp() === false,
  'C10 no Stripe page opens inside the app (store payment model is an owner decision)');
ok(!/stripe|web|site|browser|cheaper|discount/i.test(P.NATIVE_PAYMENT_MESSAGE), 'C10 the in-app refusal names no other place to pay (no steering copy)');
const fnBody = (name) => { const i = mainJs.indexOf('async function ' + name + '('); return mainJs.slice(i, mainJs.indexOf('\n}', i)); };
const gate = "if (!paymentsInApp()) { showToast(NATIVE_PAYMENT_MESSAGE); return; }";
for (const f of ['startCheckout', 'manageSubscription']) {
  const b = fnBody(f);
  ok(b.indexOf(gate) > -1 && b.indexOf(gate) < b.indexOf('supabase.functions.invoke'), `C10 ${f}: the app stops BEFORE any checkout / portal request (no Stripe session is created)`);
}
ok(P.isInstalledApp() === true, 'C11 the app counts as installed');
// install.js inside the app: no button, no sheet
const btn = { style: { display: '' } };
const opens = [];
globalThis.document.getElementById = (id) => (id === 'btn-get-app' ? btn : null);
globalThis.openModal = (id) => opens.push(id);
globalThis.matchMedia = () => ({ matches: false });
const inst = await import('../docs/src/js/install.js');
inst.openInstall();
ok(btn.style.display === 'none' && opens.length === 0, 'C12 "Get the App" is hidden in the app and never opens the install sheet');
globalThis.document.getElementById = () => null;

// initPlatform on the REAL bridge shape (review R1-1: it used to throw here)
let canBack = true, requiredTop = false, backs = 0;
globalThis.history = { back() { backs++; } };
launchUrl = 'https://dealfit.clearpathcapfunding.com/shared.html?d=0123456789abcdef0123456789abcdef';
let initThrew = false, inited;
try { inited = P.initPlatform({ canStepBack: () => canBack, requiredSheetOpen: () => requiredTop, authParams: ['auth_th', 'auth_type'] }); } catch { initThrew = true; }
ok(!initThrew && inited === true && rootEl.attrs['data-platform'] === 'android', 'C13 initPlatform runs on the Capacitor 8 bridge shape without throwing and tags <html data-platform>');
ok(/try \{\s*initPlatform\(\{[\s\S]*?\}\);\s*\} catch \(e\) \{ console\.warn\(e\); \}/.test(mainJs), 'C13 main.js guards the call, so nothing in the shell can stop the boot that follows it');
await tick(); await tick();
ok(styles.some(s => s.textContent === P.NATIVE_HIDDEN_PURCHASE + '{display:none!important}') && /btn-upgrade-investor/.test(P.NATIVE_HIDDEN_PURCHASE) && /#manage-sub-btn/.test(P.NATIVE_HIDDEN_PURCHASE),
  'C10 the Subscribe / Manage subscription buttons are hidden in the app (style injected; no markup change)');
const { haptic } = await import('../docs/src/js/viewstack.js');
haptic();
await tick();
ok(callsTo('Haptics', 'selectionChanged').length === 1, 'C3 the design wave\'s haptic() (unchanged) reaches the native Haptics plugin');
const backCb = callbacks['App:backButton'];
ok(typeof backCb === 'function', 'C14 an Android backButton listener is registered');
backCb({ canGoBack: true });
ok(backs === 1 && callsTo('App', 'minimizeApp').length === 0, 'C14 Back with a sheet / previous tab open → history.back() (the view stack closes the top sheet first)');
canBack = false;
backCb({ canGoBack: true });
ok(backs === 1 && callsTo('App', 'minimizeApp').length === 1, 'C15 Back at the root backgrounds the app (never walks into an earlier page load\'s entries)');
canBack = true; requiredTop = true;
backCb({ canGoBack: true });
ok(backs === 1 && callsTo('App', 'minimizeApp').length === 2, 'C15 Back while a required sheet is on top (first-launch market picker) backgrounds the app instead of a dead press');
requiredTop = false;
ok(loc.replaced.length === 1 && loc.replaced[0] === 'https://localhost/shared.html?d=0123456789abcdef0123456789abcdef', 'C16 a cold-start App Link opens the bundled shared-deal page');
P._resetForTests(); P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick(); await tick();
ok(loc.replaced.length === 1, 'C17 the same launch URL is never re-applied after the reload it caused (no loop)');
// No sessionStorage at all: still no loop.
const savedSS = globalThis.sessionStorage;
Object.defineProperty(globalThis, 'sessionStorage', { get() { throw new Error('denied'); }, configurable: true });
launchUrl = 'https://dealfit.clearpathcapfunding.com/?tool=ltr';
for (let i = 0; i < 3; i++) { P._resetForTests(); P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick(); await tick(); }
ok(loc.replaced.length === 1, 'C17 without sessionStorage a launch link is never re-applied on each load (no reload loop)');
Object.defineProperty(globalThis, 'sessionStorage', { value: savedSS, configurable: true, writable: true });
launchUrl = null;
callbacks['App:appUrlOpen']({ url: 'https://dealfit.clearpathcapfunding.com/?tool=ltr&checkout=success&install=1' });
ok(loc.replaced[1] === 'https://localhost/index.html?tool=ltr' && JSON.parse(ssMap.get('df.appliedLinks') || '[]').includes('https://dealfit.clearpathcapfunding.com/?tool=ltr&checkout=success&install=1'),
  'C18 a warm App Link keeps ?tool, drops ?checkout / ?install, and is remembered as applied');
callbacks['App:appUrlOpen']({ url: 'https://dealfit.clearpathcapfunding.com/?tool=ltr' });
ok(loc.replaced.length === 2, 'C18 a link to the page already showing is not re-applied');
callbacks['App:appUrlOpen']({ url: 'https://evil.example/shared.html?d=0123456789abcdef0123456789abcdef' });
ok(loc.replaced.length === 2, 'C19 a link for another host is ignored');
// Android: getLaunchUrl returns the link that STARTED the process for its whole life
// (Bridge.intentUri is set once). A warm link B must not be overridden by launch link A
// on the page B opens (review round 2, R2-1).
{
  ssMap.clear();
  const A = 'https://dealfit.clearpathcapfunding.com/shared.html?d=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const B = 'https://dealfit.clearpathcapfunding.com/shared.html?d=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  loc.href = 'https://localhost/index.html'; launchUrl = A; const n0 = loc.replaced.length;
  P._resetForTests(); P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick(); await tick();   // cold start from A
  callbacks['App:appUrlOpen']({ url: B });                                                                         // warm B
  for (let i = 0; i < 2; i++) { P._resetForTests(); P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick(); await tick(); }   // B's page loads (launch read still says A)
  ok(loc.href === 'https://localhost/shared.html?d=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' && loc.replaced.length === n0 + 2,
    'C19 Android: a warm link is never overridden by the link that launched the app (the launch read applies once)');
  // A long session: more warm links than the warm list keeps — still no return to A (review round 3, R3-1).
  for (let i = 0; i < 22; i++) callbacks['App:appUrlOpen']({ url: 'https://dealfit.clearpathcapfunding.com/shared.html?d=' + String(i).padStart(32, 'c') });
  const before22 = loc.replaced.length;
  P._resetForTests(); P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick(); await tick();
  ok(loc.replaced.length === before22 && ssMap.get('df.launchApplied') === A && JSON.parse(ssMap.get('df.appliedLinks')).length === 20,
    'C19 after more than 20 warm links the launch link is still never re-applied (it has its own key)');
  launchUrl = null;
}
// sessionStorage that reads but cannot write (full): a ?tool= launch link must not reload forever (R3-2).
{
  const ro = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const keep = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { value: ro, configurable: true, writable: true });
  loc.href = 'https://localhost/index.html'; launchUrl = 'https://dealfit.clearpathcapfunding.com/?tool=ltr';
  const n1 = loc.replaced.length;
  for (let i = 0; i < 3; i++) { P._resetForTests(); P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick(); await tick(); }
  ok(loc.replaced.length === n1, 'C19 a launch link that cannot be recorded is never applied (no reload loop when sessionStorage is full)');
  Object.defineProperty(globalThis, 'sessionStorage', { value: keep, configurable: true, writable: true });
  launchUrl = null;
}
// window.open shim: the analyzers' exact call now lands in the in-app browser
opened.length = 0;
const nb = callsTo('Browser', 'open').length;
const ret = globalThis.open('https://clearpathcapfunding.com/get-funding?pp=1', '_blank', 'noopener');
ok(ret === null && opened.length === 0 && callsTo('Browser', 'open').length === nb + 1, 'C20 window.open(url, "_blank", "noopener") in the app → in-app browser');
globalThis.open('https://localhost/x', '_self');
ok(opened.length === 1 && opened[0][1] === '_self', 'C20 other window.open targets pass through untouched');
// <a target=_blank> interception
const clickFns = docListeners.click || [];
const anchor = (href, target) => ({ getAttribute: () => href, target, closest() { return this; } });
const clickOn = (a, pre) => { const ev = { target: a, defaultPrevented: !!pre, preventDefault() { this.defaultPrevented = true; } }; clickFns.forEach(f => f(ev)); return ev; };
const e1 = clickOn(anchor('privacy.html', '_blank'));
ok(e1.defaultPrevented && callsTo('Browser', 'open').pop()[2].url === 'https://dealfit.clearpathcapfunding.com/privacy.html', 'C21 the legal footer link opens the published page in the in-app browser');
const e2 = clickOn(anchor('#calc', ''));
ok(!e2.defaultPrevented, 'C21 same-tab in-app links stay in the WebView');
const nb2 = callsTo('Browser', 'open').length;
clickOn(anchor('terms.html', '_blank'), true);
ok(callsTo('Browser', 'open').length === nb2, 'C21 a link another handler already cancelled is left alone');
// Status bar + keyboard (iOS), and the two other bridge shapes
globalThis.Capacitor = bridge('ios'); P._resetForTests(); calls.length = 0; launchUrl = null;
P.initPlatform({ canStepBack: () => false, authParams: [] }); await tick();
ok(callsTo('StatusBar', 'setStyle').length === 1 && callsTo('Keyboard', 'setAccessoryBarVisible')[0][2].isVisible === true && callsTo('StatusBar', 'setOverlaysWebView').length === 0,
  'C22 iOS: light status-bar text; the keyboard accessory bar stays (its Done closes the decimal keypad)');
for (const mode of ['core', 'empty']) {
  globalThis.Capacitor = bridge('android', mode); P._resetForTests(); calls.length = 0; delete callbacks['App:backButton'];
  let threw = false; try { P.initPlatform({ canStepBack: () => false, authParams: [] }); } catch { threw = true; }
  await tick(); await tick();
  ok(!threw && typeof callbacks['App:backButton'] === 'function' && callsTo('StatusBar', 'setStyle').length === 1, `C22 the ${mode === 'core' ? '@capacitor/core proxy' : 'unfilled-Plugins fallback'} bridge shape works too`);
}
const fb = globalThis.Capacitor.Plugins.App;
const h0 = fb.addListener('appStateChange', () => {});
await h0.remove();
ok(h0 && typeof h0.then !== 'function' && callsTo('App', 'removeListener').length === 1, 'C22 the fallback listener handle is a plain { remove } and removal goes through nativeCallback (core\'s rtype)');

// Deep-link mapping (pure)
const DL = (u) => P.deepLinkTarget(u, ['auth_th', 'auth_type']);
ok(DL('https://dealfit.clearpathcapfunding.com/') === 'index.html', 'C23 / → index.html');
ok(DL('https://dealfit.clearpathcapfunding.com/shared.html?d=x') === 'index.html' && DL('https://dealfit.clearpathcapfunding.com/shared.html?d=AbCdEf123456') === 'index.html',
  'C23 a share token the viewer would reject → the app home, never a dead viewer');
ok(DL('https://dealfit.clearpathcapfunding.com/#auth_th=abc123&auth_type=email') === 'index.html#auth_th=abc123&auth_type=email', 'C24 an emailed sign-in link keeps its web form (the page\'s own code decides; today it only strips it)');
ok(DL('https://dealfit.clearpathcapfunding.com/dscr-calculator/') === 'index.html', 'C25 a public tool page → the app home');
ok(DL('http://dealfit.clearpathcapfunding.com/') === null && DL('https://dealfit.clearpathcapfunding.com.evil.example/') === null, 'C26 cleartext and look-alike hosts are refused');
ok(DL('https://dealfit.clearpathcapfunding.com/?tool=%3Cscript%3E') === 'index.html', 'C27 an unexpected ?tool value is dropped');
const sv = src('docs/src/js/sharedView.js'), sh = src('docs/shared.html');
ok(/initPlatform\(\{ canStepBack: \(\) => false, requiredSheetOpen: \(\) => false, authParams: AUTH_LINK_PARAMS \}\)/.test(sv), 'C27 the shared-deal page sets the platform up too (in-app browser for its links, Back, warm links)');
const stateBlock = (id) => { const i = sh.indexOf('id="' + id + '"'); return sh.slice(i, sh.indexOf('</div>', i)); };
ok(['shared-missing', 'shared-offline'].every(id => /<a class="shared-cta" href="index\.html">Open DealFit<\/a>/.test(stateBlock(id))), 'C27 its "not available" and offline states link home (no dead end in the app)');

// View stack: canStepBack follows the model
const vs = await import('../docs/src/js/viewstack.js');
ok(vs.canStepBack() === false, 'C28 canStepBack is false before the view stack starts');

// ─── §D secure session adapter ──────────────────────────────────────────────
console.log('— §D secure session storage —');
const KEY = 'sb-qbddbblhduzwcfwslbac-auth-token';
const store = S.authStorageOption().storage;
ok(store && store.secure === true && typeof store.getItem === 'function', 'D1 in the app the client gets the secure adapter (Keychain/Keystore plugin present)');
lsMap.clear(); secure.clear();
await store.setItem(KEY, '{"access_token":"A"}');
ok(secure.get(KEY) === '{"access_token":"A"}' && !lsMap.has(KEY) && (await store.getItem(KEY)) === '{"access_token":"A"}', 'D2 the session goes to the secure store, never WebView localStorage');
await store.removeItem(KEY);
ok(!secure.has(KEY) && (await store.getItem(KEY)) === null, 'D3 removeItem deletes it from the secure store');
// Migration out of WebView localStorage
lsMap.set(KEY, '{"access_token":"OLD"}');
const st2 = S.createSecureSessionStorage(globalThis.Capacitor.Plugins.SecureStoragePlugin || P.plugin('SecureStoragePlugin'), localStorageFake);
ok((await st2.getItem(KEY)) === '{"access_token":"OLD"}' && secure.get(KEY) === '{"access_token":"OLD"}' && !lsMap.has(KEY), 'D4 a token left in WebView localStorage moves to the secure store and is deleted there');
// Fail closed
const memOnly = S.createSecureSessionStorage(null, localStorageFake);
await memOnly.setItem(KEY, 'M');
ok(memOnly.secure === false && (await memOnly.getItem(KEY)) === 'M' && !lsMap.has(KEY), 'D5 no secure plugin → memory only (this launch), never localStorage');
const broken = S.createSecureSessionStorage({ get: () => Promise.reject(new Error('x')), set: () => Promise.reject(new Error('locked')), remove: () => Promise.resolve() }, localStorageFake);
await broken.setItem(KEY, 'B');
ok((await broken.getItem(KEY)) === 'B' && !lsMap.has(KEY), 'D6 a secure-store write failure keeps the session in memory, not localStorage');
await broken.removeItem(KEY);
ok((await broken.getItem(KEY)) === null, 'D6 …and sign-out clears that memory copy');
// A refused write must not hand back the OLDER stored session (a rotated refresh token).
const staleBackend = { store: new Map([[KEY, 'OLD']]), removed: 0,
  get({ key }) { return this.store.has(key) ? Promise.resolve({ value: this.store.get(key) }) : Promise.reject(new Error('absent')); },
  set() { return Promise.reject(new Error('keychain locked')); },
  remove({ key }) { this.removed++; this.store.delete(key); return Promise.resolve(); } };
const stale = S.createSecureSessionStorage(staleBackend, null);
await stale.setItem(KEY, 'NEW');
ok((await stale.getItem(KEY)) === 'NEW' && !staleBackend.store.has(KEY) && staleBackend.removed === 1,
  'D6 after a refused write the newer in-memory session wins, and the stale stored one is removed (no replay of a rotated refresh token)');
// The real SDK over the adapter: sign-out (offline) and account switch leave no token.
secure.clear(); lsMap.clear();
const appStore = S.createSecureSessionStorage(P.plugin('SecureStoragePlugin'), localStorageFake);
const nativeClient = createClient('http://127.0.0.1:9', 'sb_publishable_test_only_not_a_key', { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: appStore } });
const NK = nativeClient.auth.storageKey;
const now = Math.floor(Date.now() / 1000);
const jwt = (sub) => 'h.' + Buffer.from(JSON.stringify({ sub, exp: now + 3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url') + '.s';
const sess = (sub, email) => ({ access_token: jwt(sub), refresh_token: 'r-' + sub, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
  user: { id: sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
fetchImpl = async (url) => {
  if (/\/verify/.test(url)) return new Response(JSON.stringify(sess('22222222-2222-2222-2222-222222222222', 'b@example.com')), { status: 200, headers: { 'content-type': 'application/json' } });
  throw new TypeError('Failed to fetch');
};
await nativeClient.auth.initializePromise;
secure.set(NK, JSON.stringify(sess('11111111-1111-1111-1111-111111111111', 'a@example.com')));
const got = await nativeClient.auth.getSession();
ok(got.data.session && got.data.session.user.email === 'a@example.com', 'D7 the real SDK reads the session from the secure store');
const vr = await nativeClient.auth.verifyOtp({ email: 'b@example.com', token: '12345678', type: 'email' });
const afterSwitch = JSON.parse(secure.get(NK) || '{}');
ok(!vr.error && afterSwitch.user && afterSwitch.user.email === 'b@example.com' && !JSON.stringify([...secure.values()]).includes('r-11111111') && !lsMap.size,
  'D8 account switch: the new account\'s session replaces the old one; no old token remains anywhere');
const so = await nativeClient.auth.signOut();   // the logout request fails (offline)
const left = [...secure.keys()].filter(k => k.startsWith(NK));
ok(left.length === 0 && lsMap.size === 0, 'D9 sign-out with no network still clears every session key (' + left.join(',') + ')');
ok((await nativeClient.auth.getSession()).data.session === null, 'D9 …and the client is signed out');
void so;

// ─── §E .nojekyll and boundaries ────────────────────────────────────────────
console.log('— §E .nojekyll + boundaries —');
ok(existsSync(join(root, 'docs/.nojekyll')) && statSync(join(root, 'docs/.nojekyll')).size === 0, 'E1 docs/.nojekyll exists and is empty');
// Under Jekyll (GitHub Pages, github-pages gem 3.10) a docs/ file is served differently only if
// it is excluded (leading _ . # or trailing ~, or a default exclude) or processed (front matter,
// or a Markdown page via jekyll-optional-front-matter). Pin the whole tree so the .nojekyll
// change stays exactly the one documented in NATIVE_READINESS.md §5.
const walk = (d) => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(join(root, 'docs')).map(p => relative(join(root, 'docs'), p).replace(/\\/g, '/'));
const excluded = files.filter(f => f.split('/').some(s => /^[_.#]/.test(s) || /~$/.test(s)) || /(^|\/)(node_modules|Gemfile|Gemfile\.lock|vendor\/(bundle|cache|gems|ruby))(\/|$)/.test(f));
ok(JSON.stringify(excluded) === JSON.stringify(['.nojekyll']), 'E2 the only Jekyll-excluded path is .nojekyll itself (' + excluded.join(', ') + ')');
const markdown = files.filter(f => /\.(md|markdown|mkdown|mkdn|mkd|textile)$/i.test(f));
ok(JSON.stringify(markdown) === JSON.stringify(['vendor/LICENSES/@supabase__phoenix__LICENSE.md']), 'E3 the only Markdown file is the phoenix licence (Jekyll also rendered it to .html; that generated copy goes away) (' + markdown.join(', ') + ')');
const front = files.filter(f => { try { return readFileSync(join(root, 'docs', f)).subarray(0, 3).toString() === '---'; } catch { return false; } });
ok(front.length === 0, 'E4 no file starts with YAML front matter, so Jekyll copied every file verbatim (' + front.join(', ') + ')');
ok(files.filter(f => /\.(scss|sass|coffee)$/i.test(f)).length === 0, 'E5 nothing Jekyll would compile (scss / sass / coffee)');
const refs = files.filter(f => /\.(html|js|css|json|xml|txt|webmanifest)$/.test(f) && !f.startsWith('vendor/')).filter(f => /["'(]\/?assets\/css\/style\.css|LICENSE\.html/.test(readFileSync(join(root, 'docs', f), 'utf8')));
ok(refs.length === 0, 'E6 nothing links to the Jekyll-generated /assets/css/style.css or LICENSE.html (' + refs.join(', ') + ')');
// Boundaries vs the design-wave base 49ec36a (this branch's parent line).
const DESIGN_BASE = '49ec36a';
let haveBase = false; try { execFileSync('git', ['-C', root, 'cat-file', '-e', DESIGN_BASE + '^{commit}'], { stdio: 'ignore' }); haveBase = true; } catch {}
if (haveBase) {
  const changed = execFileSync('git', ['-C', root, 'diff', '--name-only', DESIGN_BASE, '--', 'docs', 'supabase'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const forbidden = changed.filter(f => /\/(finance|flip|ltr|brrr|strFinance|rental|repair|auth|signinCode|tiers|storage|marketSync|clearpath|funding)\.js$/.test(f) || /^supabase\//.test(f) || /^docs\/vendor\//.test(f) || /(privacy|terms)\.html$/.test(f));
  ok(forbidden.length === 0, 'E7 engines, sign-in, tier, storage, hand-off, Supabase, vendor and legal files are byte-identical to 49ec36a (' + forbidden.join(', ') + ')');
  const acct = (h) => { const a = h.indexOf('id="account-block"'); return h.slice(a, h.indexOf('id="redeem-block"', a)).replace(/\r/g, ''); };
  const baseHtml = execFileSync('git', ['-C', root, 'show', DESIGN_BASE + ':docs/index.html'], { encoding: 'utf8' });
  ok(acct(baseHtml) === acct(src('docs/index.html')), 'E8 the sign-in markup (#account-block) is unchanged');
  const sbDiff = execFileSync('git', ['-C', root, 'diff', DESIGN_BASE, '--', 'docs/src/js/supabaseClient.js'], { encoding: 'utf8' }).split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  ok(sbDiff.length > 0 && sbDiff.every(l => /^\+/.test(l)) && sbDiff.filter(l => !/^\+\s*\/\//.test(l)).map(l => '+' + l.slice(1).trim()).join('|') === "+import { authStorageOption } from './sessionStore.js';|+...authStorageOption(),",
    'E9 supabaseClient.js only GAINS the storage import and the spread (plus comments); nothing removed');
} else {
  ok(true, 'E7–E9 skipped: design base not in this clone');
}

// ─── §F accessibility and cold-start weight (375 px audit fixes) ────────────
console.log('— §F accessibility + cold start —');
const html = src('docs/index.html');
const signIn = (() => { const a = html.indexOf('id="account-block"'); const r = html.indexOf('id="redeem-block"', a); return [a, html.indexOf('</div>', html.indexOf('id="redeem-code-input"', r))]; })();
const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].filter(m => !/type="hidden"/.test(m[0]) && !(m.index > signIn[0] && m.index < signIn[1]));
const unnamed = controls.filter(m => {
  const tag = m[0]; const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
  if (/aria-label(ledby)?="[^"]+"/.test(tag)) return false;
  if (id) { const lab = html.lastIndexOf('<label', m.index); if (lab > -1 && html.slice(lab, html.indexOf('>', lab)).includes(`for="${id}"`) && html.indexOf('</label>', lab) < m.index) return false; }
  const open = html.lastIndexOf('<label', m.index), close = html.indexOf('</label>', m.index);
  if (open > -1 && close > -1 && html.lastIndexOf('</label>', m.index) < open) {
    const text = html.slice(open, close).replace(/<[^>]*>/g, '').trim();
    if (text) return false;
  }
  return true;
}).map(m => (m[0].match(/\bid="([^"]+)"/) || [, m[0].slice(0, 40)])[1]);
ok(controls.length > 80 && unnamed.length === 0, 'F1 every analyzer field, select and toggle has an accessible name (' + unnamed.join(', ') + ')');
const dialogs = [...html.matchAll(/<div class="modal[^"]*"[^>]*role="dialog"[^>]*>/g)].map(m => m[0]);
const dlgOk = dialogs.filter(d => /aria-modal="true"/.test(d) && (/aria-label="[^"]+"/.test(d) || (() => { const id = (d.match(/aria-labelledby="([^"]+)"/) || [])[1]; return id && html.includes(`id="${id}"`); })()));
ok(dialogs.length === 8 && dlgOk.length === 8, 'F2 eight sheets are announced as modal dialogs with a title (' + dlgOk.length + '/' + dialogs.length + ')');
ok(/class="modal modal-picker" role="dialog" aria-modal="true" aria-label="Choose a market"/.test(html), 'F2 the market picker keeps a stable name (its header text changes to "← Back NC")');
ok(!/class="modal modal-upgrade"[^>]*role=/.test(html), 'F2 the sign-in / plans sheet is left as it is (sign-in is closed to speculative change)');
ok((html.match(/<div class="tier( active)?" role="button" tabindex="0" onclick="setRepairTier\(/g) || []).length === 3, 'F3 the three repair tiers are keyboard buttons');
ok((mainJs.match(/class="picker-item[^"]*" role="button" tabindex="0" onclick="pickerSelect/g) || []).length === 3 && /initA11y\(\);/.test(mainJs), 'F3 market-picker rows are keyboard buttons; main.js starts the key handler');
const AY = await import('../docs/src/js/a11y.js');
const kev = (key, tag, extra = {}) => ({ key, defaultPrevented: false, target: { tagName: tag, getAttribute: (k) => (k === 'role' ? 'button' : null) }, ...extra });
ok(AY.activatesRowButton(kev('Enter', 'DIV')), 'F4 Enter activates a role="button" row');
ok(!AY.activatesRowButton(kev('Enter', 'BUTTON')) && !AY.activatesRowButton(kev('Enter', 'INPUT')) && !AY.activatesRowButton(kev('a', 'DIV')) && !AY.activatesRowButton(kev('Enter', 'DIV', { ctrlKey: true }))
  && !AY.activatesRowButton(kev('Enter', 'DIV', { isComposing: true })) && !AY.activatesRowButton(kev('Enter', 'DIV', { repeat: true })),
  'F4 native controls, other keys, modified keys, IME composition and a held (repeating) key are left alone');
const kd = {}; const fakeDoc = { addEventListener: (t, f) => { kd[t] = f; }, contains: () => true, querySelectorAll: () => [] };
AY.initA11y(fakeDoc);
let clicked = 0;
const mk = (key, target, extra = {}) => Object.assign({ key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, extra);
const row = { tagName: 'DIV', getAttribute: (k) => (k === 'role' ? 'button' : null), click: () => clicked++, parentElement: null };
const ke = mk('Enter', row); kd.keydown(ke);
ok(clicked === 1 && ke.defaultPrevented, 'F4 Enter clicks the row on key-down');
const sd = mk(' ', row); kd.keydown(sd);
ok(clicked === 1 && sd.defaultPrevented, 'F4 Space does not scroll the page and does not act on key-down');
kd.keydown(mk(' ', row, { repeat: true }));
kd.keyup(mk(' ', row));
ok(clicked === 2, 'F4 Space acts once, on key-up (a held Space does not repeat)');
const tiers = [{ cls: new Set(['active']), attrs: {} }, { cls: new Set(), attrs: {} }].map(t => ({ classList: { contains: c => t.cls.has(c) }, getAttribute: k => t.attrs[k], setAttribute: (k, v) => { t.attrs[k] = v; }, _t: t }));
AY.syncPressed({ querySelectorAll: () => tiers });
ok(tiers[0]._t.attrs['aria-pressed'] === 'true' && tiers[1]._t.attrs['aria-pressed'] === 'false', 'F4 the selected repair tier is announced (aria-pressed follows .active, set by the unchanged repair.js)');
const firstNew = { focused: 0, focus() { this.focused++; } };
const list = { querySelector: () => firstNew };
const gone = { tagName: 'DIV', getAttribute: (k) => (k === 'role' ? 'button' : null), click: () => {}, parentElement: list };
fakeDoc.contains = () => false;
kd.keydown(mk('Enter', gone));
await new Promise(r => setTimeout(r, 5));
ok(firstNew.focused === 1, 'F4 when a row re-renders its list (picker: state → markets), focus moves to the new list, not <body>');
const png = readFileSync(join(root, 'docs/icons/clearpath-mark-96.png'));
ok(png.readUInt32BE(16) === 96 && png.readUInt32BE(20) === 96 && png.length < 16384, 'F5 the app-bar mark is a 96 px PNG under 16 KB (was the 1024 px, 1.53 MB file)');
const sharedHtml = src('docs/shared.html');
ok(/<img src="icons\/clearpath-mark-96\.png" alt="Clear Path Capital" class="cpc-logo"/.test(html) && !/<img[^>]*clearpath-mark\.png/.test(html) && !/<img[^>]*clearpath-mark\.png/.test(sharedHtml),
  'F5 no page loads the 1024 px mark as an <img> at start-up');
ok(/"src": "icons\/clearpath-mark\.png"/.test(src('docs/manifest.json')) && /rel="apple-touch-icon" href="icons\/clearpath-mark\.png"/.test(html), 'F5 the install icons (manifest, apple-touch-icon) keep the full-size mark');

console.log(`\nnative: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
