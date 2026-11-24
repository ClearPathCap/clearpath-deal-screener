// ─── Mobile Phase 0 (2026-11-22): vendored runtime deps + truthful offline states ─
// §V  no served page/stylesheet/module loads runtime code or fonts from a CDN; the
//     vendored artifacts are exactly what the manifest records, licensed, and wired
//     into every page.
// §C  connectivity.js: network-failure classification, reachability state, the
//     status banner, and READ-ONLY reconnect retries.
// §E  entitlement: a plan check that cannot reach the server stays 'starter' (fail
//     closed, unchanged) and is reported 'unverified' — never 'verified', never a
//     cached paid tier; a server answer is unchanged.
// §P  pipeline storage: an unreachable load is 'failed' (never "no deals"), a failed
//     save commits nothing and says offline; recovery restores 'ok'.
// §A  sign-in: a network failure never reads as "code sent", "signed in" or "invalid code".
// §M  market intel / market sync: failures flag unavailable, change nothing locally.
// §S  source pins for the UI wiring (pipeline view, shared view, guide, account, boot).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/mobilep0.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const JS = pathToFileURL(join(DOCS, 'src', 'js') + '/').href;
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

// ── §V vendoring ─────────────────────────────────────────────────────────────
console.log('— §V no runtime code or fonts from a CDN; vendored artifacts verified ─');
const served = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|css|js|mjs)$/.test(n)) served.push(p); } })(DOCS);
const offenders = [];
for (const p of served) {
  const s = readFileSync(p, 'utf8'); const r = relative(DOCS, p).split('\\').join('/');
  if (/<script\b[^>]*\bsrc\s*=\s*["']?(https?:)?\/\//i.test(s)) offenders.push(r + ' <script src=remote>');
  if (/\bimport\s*(?:[^'"()]*?\bfrom\s*)?["']https?:\/\//.test(s) || /\bimport\(\s*["']https?:\/\//.test(s)) offenders.push(r + ' remote import');
  if (/<link\b[^>]*\brel=["']?(stylesheet|preload|modulepreload|preconnect)[^>]*\bhref=["']?(https?:)?\/\//i.test(s) || /<link\b[^>]*\bhref=["']?(https?:)?\/\/[^>]*\brel=["']?(stylesheet|preload|modulepreload|preconnect)/i.test(s)) offenders.push(r + ' remote <link>');
  if (/@import\s+(url\()?["']?(https?:)?\/\//i.test(s) || (/\.css$/.test(r) && /url\(\s*["']?(https?:)?\/\//i.test(s))) offenders.push(r + ' remote css url');
  if (/fonts\.(googleapis|gstatic)\.com|esm\.sh\/|cdn\.jsdelivr|unpkg\.com|cdnjs\./i.test(s) && !/privacy\.html$/.test(r) && !/supabaseClient\.js$/.test(r)) offenders.push(r + ' names a CDN host');
}
ok(offenders.length === 0, 'V1 no served file loads runtime code, styles or fonts from another origin: ' + (offenders.join('; ') || 'none'));
const pages = ['index.html', 'privacy.html', 'terms.html', 'shared.html', 'brrrr-calculator/index.html', 'dscr-calculator/index.html',
  'fix-and-flip-calculator/index.html', 'risk-evaluation/index.html', 'short-term-rental-calculator/index.html'];
ok(pages.every(p => /<link rel="stylesheet" href="(\/|)vendor\/fonts\.css">/.test(rd('docs/' + p))), 'V2 all 9 pages load the self-hosted vendor/fonts.css');
const client = rd('docs/src/js/supabaseClient.js');
ok(/import \{ createClient \} from '\.\.\/\.\.\/vendor\/supabase-js-2\.112\.3\.js';/.test(client) && !/esm\.sh\/@supabase|from ['"]https?:/.test(client.replace(/^\s*\/\/.*$/gm, '')),
   'V3 the client imports the vendored SDK 2.112.3 — no CDN import');
ok(/qbddbblhduzwcfwslbac\.supabase\.co/.test(client) && /sb_publishable_-9yLyv7rA5tkjKv_HEPe8A_iCvRq-xf/.test(client) && /persistSession: true/.test(client) && /autoRefreshToken: true/.test(client) && /detectSessionInUrl: true/.test(client),
   'V4 Supabase URL, publishable key and auth options are unchanged');
const manifest = JSON.parse(rd('docs/vendor/VENDOR_MANIFEST.json'));
const sha = (p) => createHash('sha256').update(readFileSync(join(DOCS, 'vendor', p))).digest('hex');
const mismatched = Object.entries(manifest.outputs).filter(([p, h]) => !existsSync(join(DOCS, 'vendor', p)) || sha(p) !== h).map(([p]) => p);
ok(Object.keys(manifest.outputs).length >= 20 && mismatched.length === 0, 'V5 every vendored file matches its manifest SHA-256 (' + Object.keys(manifest.outputs).length + ' files; mismatched: ' + (mismatched.join(',') || 'none') + ')');
const vendored = readdirSync(join(DOCS, 'vendor'));
ok(vendored.sort().join(',') === ['LICENSES', 'VENDOR_MANIFEST.json', 'fonts', 'fonts.css', 'supabase-js-2.112.3.js'].join(','), 'V6 docs/vendor holds exactly the SDK, fonts.css, fonts/, LICENSES/ and the manifest — no node_modules copy');
const pkgs = Object.fromEntries(manifest.packages.map(p => [p.name, p]));
ok(pkgs['@supabase/supabase-js'].version === '2.112.3' && ['auth-js', 'functions-js', 'postgrest-js', 'realtime-js', 'storage-js'].every(n => pkgs['@supabase/' + n].version === '2.112.3')
   && manifest.packages.every(p => p.license && /^sha512-/.test(p.integrity || '')), 'V7 manifest pins supabase-js 2.112.3 and its 2.112.3 sub-packages, each with a license and npm integrity');
const lic = readdirSync(join(DOCS, 'vendor', 'LICENSES'));
ok(manifest.packages.every(p => lic.some(f => f.startsWith(p.name.replace('/', '__') + '__'))), 'V8 a license file ships for every vendored package (' + lic.length + ')');
const fontsCss = rd('docs/vendor/fonts.css');
const faces = [...fontsCss.matchAll(/@font-face\{font-family:'([^']+)';[^}]*font-weight:([^;]+);src:url\(\.\/fonts\/([^)]+)\)/g)].map(m => ({ fam: m[1], w: m[2], file: m[3] }));
ok(faces.every(f => existsSync(join(DOCS, 'vendor', 'fonts', f.file))) && faces.length === 7, 'V9 every @font-face points at a shipped woff2 (' + faces.length + ' faces)');
ok(faces.some(f => f.fam === 'Syne' && f.w === '400 800') && !faces.some(f => f.fam === 'Outfit')
   && faces.some(f => f.fam === 'DM Mono' && f.w === '400') && faces.some(f => f.fam === 'DM Mono' && f.w === '500') && /display:swap|font-display:swap/.test(fontsCss),
   'V10 the families the stylesheets use, same weights: Syne 400–800, DM Mono 400/500, font-display swap (Outfit, requested by shared.html but never used, is not shipped)');
ok(/--font:'Syne',sans-serif;--mono:'DM Mono',monospace;/.test(rd('docs/src/css/styles.css')), 'V11 the stylesheet still names the same font families (typography unchanged)');
ok(/^docs\/vendor\/\*\* -text$/m.test(rd('.gitattributes')), 'V12 vendored bytes are protected from line-ending conversion');
const tool = rd('tools/vendor/package.json');
ok(['"@supabase/supabase-js": "2.112.3"', '"esbuild": "0.28.2"', '"@fontsource-variable/syne": "5.3.0"', '"@fontsource/dm-mono": "5.3.0"'].every(x => tool.includes(x))
   && existsSync(join(ROOT, 'tools/vendor/package-lock.json')) && /--verify/.test(rd('tools/vendor/build.mjs')), 'V13 the regeneration tool pins exact versions, has a lockfile and a byte-verify mode');

// ── shims for the real modules ───────────────────────────────────────────────
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const els = new Map();
const mkEl = (id) => { const L = {}; const e = { id, hidden: false, textContent: '', innerHTML: '', style: {}, dataset: {}, disabled: false, children: {}, attrs: {}, everDisabled: false,
  setAttribute(n, v) { e.attrs[n] = String(v); }, removeAttribute(n) { delete e.attrs[n]; },
  addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, fire(t) { (L[t] || []).forEach(f => f({ type: t })); },
  querySelector(sel) { if (!e.children[sel]) e.children[sel] = mkEl(sel); return e.children[sel]; }, querySelectorAll: () => [] }; return e; };
const el = (id) => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); };
const docL = {};
globalThis.document = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible',
  addEventListener(t, f) { (docL[t] || (docL[t] = [])).push(f); }, body: mkEl('body') };
const winL = {};
globalThis.window = globalThis; globalThis.addEventListener = (t, f) => { (winL[t] || (winL[t] = [])).push(f); };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.showToast = () => {};

const NET_PG = { data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, count: null, status: 0, statusText: '' };
const NET_AUTH = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
const S = (cfg) => { globalThis.__stubSupabase = cfg; return cfg; };

const C = await import(JS + 'connectivity.js');
const auth = await import(JS + 'auth.js');
const tiers = await import(JS + 'tiers.js');
const storage = await import(JS + 'storage.js');
const intel = await import(JS + 'marketIntel.js');
const msync = await import(JS + 'marketSync.js');

// ── §C connectivity ──────────────────────────────────────────────────────────
console.log('— §C connectivity: classification, state, banner, read-only retry ─');
ok(C.isNetworkFailure(NET_PG.error, 0) && C.isNetworkFailure(NET_PG.error) && C.isNetworkFailure(NET_AUTH)
   && C.isNetworkFailure({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' }) && C.isNetworkFailure(new TypeError('Failed to fetch'))
   && C.isNetworkFailure({ name: 'TypeError', message: 'Load failed' }), 'C1 fetch-class failures (PostgREST status 0, AuthRetryableFetchError 0, FunctionsFetchError, TypeError) are network failures');
ok(!C.isNetworkFailure({ message: 'permission denied', code: '42501' }, 403) && !C.isNetworkFailure({ name: 'AuthApiError', status: 400, message: 'Token has expired or is invalid' })
   && !C.isNetworkFailure({ name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' }) && !C.isNetworkFailure({ message: 'boom', code: 'P0001' }) && !C.isNetworkFailure(null),
   'C2 a server answer (4xx/5xx, RPC refusal, expired code) is NOT a network failure');
const banner = el('net-status');
banner.hidden = true;
C.initConnectivity();
ok(banner.hidden === true && !C.serverUnreachable(), 'C3 the banner stays hidden while nothing has failed');
ok(C.noteServerResult('t', { error: NET_PG.error, status: 0 }) === 'unreachable' && C.serverUnreachable() && banner.hidden === false
   && /Calculators keep working/.test(banner.querySelector('.net-status-msg').textContent) && /nothing is saved to your account/.test(banner.querySelector('.net-status-msg').textContent),
   'C4 an actual request failure shows the banner with the offline contract text');
ok(C.noteServerResult('t', { error: { message: 'x', code: 'P0001' }, status: 400 }) === 'answered' && !C.serverUnreachable() && banner.hidden === true, 'C5 any server answer clears it');
navigator.onLine = false; C.renderNetStatus();
ok(banner.hidden === false && !C.serverUnreachable(), 'C6 navigator.onLine=false shows the banner as a hint without marking a request failed');
navigator.onLine = true; C.renderNetStatus();
ok(banner.hidden === true, 'C7 …and it hides again when the browser reports online and no request failed');
let retried = 0; C.onReconnect(async () => { retried++; });
C.noteServerResult('t', { error: NET_AUTH });
(winL.online || []).forEach(f => f({ type: 'online' })); await new Promise(r => setTimeout(r, 0));
ok(retried >= 1, 'C8 the browser coming back online re-runs the registered read retries when a request had failed');
const before = retried; C.noteServerResult('t', { ok: true }); (winL.online || []).forEach(f => f({ type: 'online' })); await new Promise(r => setTimeout(r, 0));
ok(retried === before, 'C9 no retry storm: nothing re-runs when the server is already reachable');
// Browser finding (implementer, 2026-11-22): signed out after a failed sign-in, Retry had nothing
// to re-read, so the banner kept claiming "offline" with no fresh evidence. Now it returns to unknown.
C.noteServerResult('sign-in', { error: NET_AUTH });
ok(C.serverUnreachable() && banner.hidden === false, 'C10a a failed sign-in shows the banner');
await C.retryNow();   // the registered retryer above makes no server call (like signed-out auth)
ok(!C.serverUnreachable() && banner.hidden === true, 'C10b Retry with nothing to re-read clears the claim (unknown), so the banner is not stuck on "offline"');
let probeOn = true; C.onReconnect(async () => { if (probeOn) C.noteServerResult('probe', { error: NET_PG.error, status: 0 }); });
C.noteServerResult('t', { error: NET_AUTH });
await C.retryNow();
ok(C.serverUnreachable() && banner.hidden === false, 'C10c …but a retry whose read still fails keeps the banner (evidence wins)');
probeOn = false;

// ── §E entitlement ───────────────────────────────────────────────────────────
console.log('— §E entitlement stays server-only; an unreachable check is unverified, fail-closed ─');
const SESSION = { user: { email: 'qa@local.test' }, access_token: 'x' };
tiers.setCachedTier('pro');   // a locally cached (editable) paid tier
S({ session: SESSION, rpc: { current_tier: () => NET_PG } });
await auth.initAuthAndEntitlement();
ok(tiers.getActiveTier() === 'starter' && auth.entitlementStatus() === 'unverified', 'E1 a plan check that cannot reach the server leaves Starter (cached "pro" is NOT honoured) and reports unverified');
S({ session: SESSION, rpc: { current_tier: () => ({ data: 'pro', error: null, status: 200 }) } });
await auth.syncEntitlement();
ok(tiers.getActiveTier() === 'pro' && auth.entitlementStatus() === 'verified', 'E2 a server answer is unchanged: pro, verified');
S({ session: SESSION, rpc: { current_tier: () => ({ data: null, error: { message: 'internal', code: 'XX000' }, status: 500 }) } });
await auth.syncEntitlement();
ok(tiers.getActiveTier() === 'starter' && auth.entitlementStatus() === 'unverified' && !C.serverUnreachable(), 'E3 a server error is starter and unverified, but not "offline"');
S({ session: SESSION, rpc: { current_tier: () => ({ data: 'investor', error: null, status: 200 }) }, rpcThrows: false });
C.noteServerResult('t', { error: NET_PG.error, status: 0 });
await C.retryNow();
ok(tiers.getActiveTier() === 'investor' && auth.entitlementStatus() === 'verified' && !C.serverUnreachable(), 'E4 Retry after reconnect re-verifies from the server (investor) — the only path to a paid tier');
ok(!/setCachedTier\((?!tier\)|'starter'\))/.test(rd('docs/src/js/auth.js')) && /verified = !error;/.test(rd('docs/src/js/auth.js')), 'E5 source: the cache is only ever set to the server tier or starter; "verified" needs an error-free answer');

// ── §P pipeline storage ──────────────────────────────────────────────────────
console.log('— §P saved deals: never "empty" when unloaded; a failed save commits nothing ─');
storage.clearPipelineCache();
ok(storage.pipelineLoadState() === 'idle', 'P1 idle before any load');
S({ session: SESSION, rpc: { get_pipeline: () => NET_PG } });
await storage.hydratePipeline();
ok(storage.pipelineLoadState() === 'failed' && !storage.pipelineHydrationOk() && storage.getDeals().length === 0, 'P2 an unreachable load is "failed" (not ok, not empty-by-answer)');
const sv = await storage.saveDeals([{ id: 1, name: 'x' }]);
ok(!sv.ok && sv.reason === 'stale' && storage.getDeals().length === 0, 'P3 the silent-wipe guard still refuses a save built on an unloaded pipeline');
const DEALS = [{ id: 7, name: 'Oak' }];
S({ session: SESSION, rpc: { get_pipeline: () => ({ data: DEALS, error: null, status: 200 }), save_pipeline: () => NET_PG } });
await storage.hydratePipeline();
ok(storage.pipelineLoadState() === 'ok' && storage.getDeals().length === 1, 'P4 reconnecting restores "ok" with the server pipeline');
const sv2 = await storage.saveDeals([...DEALS, { id: 8, name: 'Elm' }]);
ok(!sv2.ok && sv2.offline === true && sv2.reason === 'other' && storage.getDeals().length === 1, 'P5 an offline save returns offline:true and commits nothing');
S({ session: SESSION, rpc: { get_pipeline: () => NET_PG } });
await storage.hydratePipeline();
ok(storage.pipelineLoadState() === 'ok' && storage.getDeals().length === 1, 'P6 a later failed reload keeps the already-confirmed pipeline (never wiped by a failure)');

// ── §A sign-in ───────────────────────────────────────────────────────────────
console.log('— §A sign-in never reads as success on a network failure ─');
S({ otpError: NET_AUTH });
const a1 = await auth.sendOtpCode('qa@local.test');
ok(!a1.ok && /no code was sent/.test(a1.msg) && /connection/.test(a1.msg), 'A1 code request offline: not ok, "no code was sent"');
S({ verifyResult: { data: { session: null }, error: NET_AUTH } });
const a2 = await auth.verifyOtpCode('qa@local.test', '123456');
ok(!a2.ok && /wasn\u2019t checked/.test(a2.msg) && !/invalid/i.test(a2.msg), 'A2 code check offline: not ok, "your code wasn\u2019t checked" — never "invalid"');
S({ verifyResult: { data: { session: null }, error: { name: 'AuthApiError', status: 403, message: 'Token has expired or is invalid' } } });
const a3 = await auth.verifyOtpCode('qa@local.test', '123456');
ok(!a3.ok && a3.msg === 'Token has expired or is invalid', 'A3 a real server refusal keeps its own message (unchanged)');

// ── §M market data ───────────────────────────────────────────────────────────
console.log('— §M market details and market sync fail safe ─');
S({ session: SESSION, rpc: { get_market_intel: () => NET_PG } });
const m1 = await intel.fetchMarketIntel(['charlotte-nc']);
ok(m1.size === 0 && m1.unavailable === true, 'M1 premium market details offline: empty and flagged unavailable (nothing cached or stale)');
S({ session: SESSION, rpc: { get_market_intel: () => ({ data: [{ market_id: 'charlotte-nc', rehab_note: 'n' }], error: null, status: 200 }) } });
const m2 = await intel.fetchMarketIntel(['charlotte-nc']);
ok(m2.size === 1 && !m2.unavailable, 'M2 online: unchanged');
tiers.setMarketSlot(0, 'charlotte-nc');
S({ session: SESSION, rpc: { get_user_markets: () => NET_PG } });
const h = await msync.hydrateMarketsOnAuth();
ok(h.status === 'error' && tiers.getMarketForSlot(0) === 'charlotte-nc', 'M3 market sync offline changes nothing locally (selection kept)');
S({ session: SESSION, rpc: { set_user_market: () => NET_PG } });
const pm = await msync.pushMarketChange(1, 'raleigh-nc');
ok(!pm.ok && /Couldn't reach the server/.test(pm.msg) && tiers.getMarketForSlot(1) !== 'raleigh-nc', 'M4 a signed-in market change offline is refused and not committed (server-first law unchanged)');

// ── §R independent-review corrections (F1 read-only reconnect, F2 focus, F4 reason) ─
console.log('— §R reconnect never writes; busy Retry keeps focus; server errors are not "no connection" ─');
{
  const seen = [];
  auth.onAuthChange((_s, ctx) => { seen.push(ctx); });
  S({ session: SESSION, rpc: { current_tier: () => ({ data: 'pro', error: null, status: 200 }) } });
  if (globalThis.__stubAuthCallback) await globalThis.__stubAuthCallback('TOKEN_REFRESHED', SESSION);
  const normal = seen.slice();
  seen.length = 0;
  C.noteServerResult('t', { error: NET_PG.error, status: 0 });
  await C.retryNow();
  ok(normal.length >= 1 && normal.every(c => c && c.marketPush === false) && seen.length >= 1 && seen.every(c => c && c.reason === 'reconnect' && c.marketPush === false) && Object.isFrozen(seen[0]),
     'R1 a reconnect and a token refresh notify subscribers with a frozen context, marketPush false (reviews F1, F7)');
  // the market-sync subscriber honours it: pull only, never set_user_market, local slot kept
  tiers.setMarketSlot(2, 'raleigh-nc');
  const calls = S({ session: SESSION, rpc: { get_user_markets: () => ({ data: [], error: null, status: 200 }), set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  const ro = await msync.hydrateMarketsOnAuth({ push: false });
  ok(ro.status === 'synced' && ro.pushed === 0 && !(calls.rpcCalls || []).some(c => c.name === 'set_user_market') && tiers.getMarketForSlot(2) === 'raleigh-nc',
     'R2 hydrateMarketsOnAuth({push:false}) reads only: no set_user_market, the local-only slot stays local (review F1)');
  const calls2 = S({ session: SESSION, rpc: { get_user_markets: () => ({ data: [], error: null, status: 200 }), set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  const rw = await msync.hydrateMarketsOnAuth();
  ok(rw.pushed >= 1 && (calls2.rpcCalls || []).some(c => c.name === 'set_user_market'), 'R3 boot / sign-in behaviour is unchanged: the default still pushes local-only slots');
  ok(rd('docs/src/js/main.js').includes('hydrateMarketsOnAuth({ push: !!(ctx && ctx.marketPush) })')
     && /onReconnect\(async \(\) => \{\s*if \(!_session\) return;\s*await syncEntitlement\(\);\s*notify\('reconnect'\);\s*\}\);/.test(rd('docs/src/js/auth.js'))
     && !/readOnlySync/.test(rd('docs/src/js/auth.js') + rd('docs/src/js/main.js')),
     'R4 source: main pushes only when the notify context allows it; the reconnect notify carries no push; the global flag is gone (F7)');
  const btn = banner.querySelector('button'); btn.disabled = false;
  let disabledDuring = null; C.onReconnect(async () => { if (disabledDuring === null) disabledDuring = { disabled: btn.disabled, aria: btn.attrs['aria-disabled'] }; });
  await C.retryNow();
  ok(disabledDuring && disabledDuring.disabled === false && disabledDuring.aria === 'true' && btn.attrs['aria-disabled'] === undefined && !/\.disabled\s*=/.test(rd('docs/src/js/connectivity.js')),
     'R5 a busy Retry is aria-disabled, never disabled (disabling the focused button dropped focus — review F2)');
  storage.clearPipelineCache();
  S({ session: SESSION, rpc: { get_pipeline: () => ({ data: null, error: { message: 'internal', code: 'XX000' }, status: 500 }) } });
  await storage.hydratePipeline();
  const serverKind = storage.pipelineLoadFailure();
  S({ session: SESSION, rpc: { get_pipeline: () => NET_PG } });
  await storage.hydratePipeline();
  ok(serverKind === 'server' && storage.pipelineLoadFailure() === 'offline' && rd('docs/src/js/pipeline.js').includes("pipelineLoadFailure() === 'server' ? 'DealFit’s server returned an error'"),
     'R6 a server error on load says the server returned an error; only a network failure says "no connection" (review F4)');
}

// ── §F lane-2 review F7: market pushes are decided by the auth event + identity ─
// The subscriber under test is main.js's OWN syncMarketsOnAuth, compiled from its
// source text (main.js cannot load in Node), so these assertions fail on fedc2ce,
// whose subscriber pushed on every non-reconnect notify.
console.log('— §F market pushes only at boot / a genuine sign-in, for the owning account ─');
{
  const mainSrc = rd('docs/src/js/main.js');
  const m = mainSrc.match(/async function syncMarketsOnAuth\(([^)]*)\) \{([\s\S]*?)\r?\n\}/);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const params = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
  const compiled = m ? new AsyncFunction('hydrateMarketsOnAuth', 'readOnlySync', 'renderAllSlots', 'renderGuideMarketIntel', 'purgeForeignMarketSlots', ...params, m[2]) : null;
  const renders = [];   // lane-5 R1: each render records which markets storage held at that moment
  const deps = [msync.hydrateMarketsOnAuth, auth.readOnlySync || (() => false), () => { renders.push([0, 1, 2, 3, 4, 5].map(i => tiers.getMarketForSlot(i))); }, () => {},
                msync.purgeForeignMarketSlots || (() => 0)];
  auth.onAuthChange((s, ctx) => { if (compiled) compiled(...deps, s, ctx).catch(() => {}); });
  ok(!!compiled, 'F0 main.js syncMarketsOnAuth compiled from source for the tests');

  const cb = (ev, s) => globalThis.__stubAuthCallback(ev, s);
  const settle = (ms = 15) => new Promise(r => setTimeout(r, ms));
  const UA = { user: { id: 'u-a', email: 'a@local.test' }, access_token: 'a' };
  const UB = { user: { id: 'u-b', email: 'b@local.test' }, access_token: 'b' };
  const PRO = { data: 'pro', error: null, status: 200 };
  const rowsFor = { 'u-a': [], 'u-b': [] };
  let tierDelay = 0, rowsDelay = 0;
  const later = (v, ms) => ms ? new Promise(r => setTimeout(() => r(v), ms)) : v;
  const RPC = {
    current_tier: () => later(PRO, tierDelay),
    get_user_markets: () => later({ data: rowsFor[auth.getUserId ? auth.getUserId() : ""] || [], error: null, status: 200 }, rowsDelay),
    set_user_market: () => ({ data: { ok: false, reason: 'cooldown' }, error: null, status: 200 }),   // refused: worst case, the slot stays local-only
  };
  let st;
  const as = (session) => { st = S({ session, rpc: RPC }); return st; };
  const writes = () => (st.rpcCalls || []).filter(c => c.name === 'set_user_market');
  const reads = () => (st.rpcCalls || []).filter(c => c.name === 'get_user_markets');

  for (let i = 0; i < 6; i++) tiers.setMarketSlot(i, '');
  localStorage.removeItem('marketSlotsOwner');
  as(null); await cb('SIGNED_OUT', null); await settle();
  tiers.setMarketSlot(3, 'tampa-fl');   // a local-only (signed-out) pick

  as(UA); await cb('SIGNED_IN', UA); await settle();
  ok(writes().length === 1 && writes()[0].args.p_slot === 3 && writes()[0].args.p_market === 'tampa-fl' && localStorage.getItem('marketSlotsOwner') === 'u-a',
     'F1 a genuine signed-out → signed-in transition pushes the local-only slot once, and the account becomes the slots’ owner');
  as(UA); await cb('SIGNED_IN', UA); await settle();
  ok(writes().length === 0 && reads().length >= 1, 'F2 SIGNED_IN for the SAME user (what the SDK emits when the tab becomes visible) pulls but never writes');
  as(UA); await cb('TOKEN_REFRESHED', UA); await settle();
  ok(writes().length === 0 && reads().length >= 1, 'F3 TOKEN_REFRESHED pulls but never writes');
  as(UA); await cb('INITIAL_SESSION', UA); await cb('USER_UPDATED', UA); await settle();
  ok(writes().length === 0, 'F4 INITIAL_SESSION / USER_UPDATED for the signed-in user never write');
  as(UA); C.noteServerResult('t', { error: NET_PG.error, status: 0 }); await C.retryNow(); await settle();
  ok(writes().length === 0 && reads().length >= 1, 'F5 a connectivity Retry / reconnect pulls but never writes');
  ok(tiers.getMarketForSlot(3) === 'tampa-fl', 'F6 the refused local-only slot is kept through every one of those events (never discarded)');
  as(UA); await auth.initAuthAndEntitlement(); await settle();
  ok(writes().length === 1 && writes()[0].args.p_slot === 3, 'F7 boot keeps its hydration: one push of the local-only slot (the SDK’s same-user INITIAL_SESSION adds none)');

  as(UB); await cb('SIGNED_IN', UB); await settle();
  ok(writes().length === 0 && localStorage.getItem('marketSlotsOwner') === 'u-a' && tiers.getMarketForSlot(3) === 'tampa-fl',
     'F8 a direct switch to a different account pulls its slots but pushes nothing of the previous account’s');
  as(UB); await auth.initAuthAndEntitlement(); await settle();
  ok(writes().length === 0 && tiers.getMarketForSlot(3) === 'tampa-fl', 'F9 …and a later boot as that account still never pushes the other account’s local slots');
  st = S({ session: UB, rpc: { ...RPC, set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  const edit = await msync.pushMarketChange(4, 'raleigh-nc');
  ok(edit.ok === true && writes().length === 1 && writes()[0].args.p_slot === 4, 'F10 a user-initiated slot change is unchanged: server-first set_user_market, whoever owns the device slots');
  st = S({ session: UB, rpc: { ...RPC, set_user_market: () => NET_PG } });
  const editOff = await msync.pushMarketChange(4, 'columbia-sc');
  ok(!editOff.ok && writes().length === 1, 'F10b …and an offline user change is still refused, sent once, never retried');

  // asynchronous ordering
  as(null); await cb('SIGNED_OUT', null); await settle();
  tierDelay = 20; as(UA);
  await Promise.all([cb('SIGNED_IN', UA), cb('SIGNED_IN', UA), cb('TOKEN_REFRESHED', UA)]); await settle(40);
  ok(writes().length === 1, 'F11 a genuine sign-in overlapped by the SDK’s same-user SIGNED_IN and a token refresh pushes exactly once');
  as(null); await cb('SIGNED_OUT', null); await settle(40);
  as(UA);
  const pA = cb('SIGNED_IN', UA); as(UB); const pB = cb('SIGNED_IN', UB);
  await Promise.all([pA, pB]); await settle(40);
  ok(writes().length === 0 && (auth.getUserId ? auth.getUserId() : "") === "u-b", 'F12 a sign-in superseded by another account before its plan check settles pushes nothing for either');
  tierDelay = 0;
  tiers.setMarketSlot(5, ''); rowsFor['u-a'] = [{ slot_index: 5, market_id: 'columbia-sc', changed_at: null }];
  as(UA); await cb('SIGNED_IN', UA); await settle();
  as(UA); rowsDelay = 20; tiers.setMarketSlot(5, '');
  const hP = msync.hydrateMarketsOnAuth({ push: true });
  await settle(2); as(UB); await cb('SIGNED_IN', UB);
  const hR = await hP; await settle(40);
  ok(hR.status === 'stale' && tiers.getMarketForSlot(5) !== 'columbia-sc' && writes().length === 0,
     'F13 a sync whose account changes mid-read applies nothing from the previous account and writes nothing');
  rowsDelay = 0;

  // Lane-3 review N1 — the reverse direction: values PULLED from another account are never
  // pushed into the device's owner (A owns; B signs in and pulls B's slot; A signs back in).
  as(null); await cb('SIGNED_OUT', null); await settle();
  for (let i = 0; i < 6; i++) tiers.setMarketSlot(i, '');
  tiers.setMarketSlot(3, 'tampa-fl');   // A's own signed-out pick (owner = u-a)
  rowsFor['u-a'] = []; rowsFor['u-b'] = [{ slot_index: 1, market_id: 'charlotte-nc', changed_at: null }];
  as(UB); await cb('SIGNED_IN', UB); await settle();
  ok(tiers.getMarketForSlot(1) === 'charlotte-nc' && writes().length === 0, 'F15a the other account (B) signs in: its server slot is pulled; nothing of A’s is pushed into B');
  as(null); await cb('SIGNED_OUT', null); await settle();
  as(UA); await cb('SIGNED_IN', UA); await settle();
  // Re-pinned for E2 (owner decision 2026-11-23): B's value used to stay on the device "untouched";
  // it is now cleared on B's sign-out (B's server data, restored on B's next sign-in) — still never pushed.
  ok(!writes().some(w => w.args.p_market === 'charlotte-nc') && writes().some(w => w.args.p_slot === 3 && w.args.p_market === 'tampa-fl') && tiers.getMarketForSlot(1) === '',
     'F15 A signs back in: B’s pulled slot is NOT pushed into A (A’s own local pick still is), and A is never shown B’s value');
  as(UA); await auth.initAuthAndEntitlement(); await settle();
  ok(!writes().some(w => w.args.p_market === 'charlotte-nc'), 'F15b …and a later boot as A never pushes B’s pulled slot either');
  as(null); await cb('SIGNED_OUT', null); await settle();
  tiers.setMarketSlot(1, 'raleigh-nc');   // a new signed-out pick replaces B's value on this device
  as(UA); await cb('SIGNED_IN', UA); await settle();
  ok(writes().some(w => w.args.p_slot === 1 && w.args.p_market === 'raleigh-nc'), 'F16 provenance is bound to the value: a new local pick in that slot is local again and is pushed to the owner');
  st = S({ session: UB, rpc: { ...RPC, set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  as(null); await cb('SIGNED_OUT', null); await settle();
  as(UB); await cb('SIGNED_IN', UB); await settle();
  st = S({ session: UB, rpc: { ...RPC, set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  const bEdit = await msync.pushMarketChange(2, 'durham-nc');
  if (bEdit.ok) tiers.setMarketSlot(2, 'durham-nc');   // the caller's commit after a server ok (main.js picker)
  as(null); await cb('SIGNED_OUT', null); await settle();
  as(UA); await cb('SIGNED_IN', UA); await settle();
  ok(bEdit.ok && !writes().some(w => w.args.p_market === 'durham-nc'), 'F17 a slot B changed server-first is B’s server data: it is never pushed into A');

  // Lane-4 review L4-1 / L4-2 / L4-3 — an account switch DURING an async write (another tab
  // signs out and in; the SDK broadcasts it here), and unreadable provenance. Every write is
  // logged with the account whose token it carried (the account current at the call).
  const wlog = [];
  let setDelay = 0;
  const RPCW = { ...RPC, set_user_market: (args) => { wlog.push({ who: auth.getUserId(), slot: args.p_slot, m: args.p_market }); return later({ data: { ok: true }, error: null, status: 200 }, setDelay); } };
  const asW = (session) => { st = S({ session, rpc: RPCW }); return st; };
  const resetDevice = () => { for (let i = 0; i < 6; i++) { tiers.setMarketSlot(i, ''); localStorage.removeItem('marketSlotFrom_' + i); } localStorage.removeItem('marketSlotsOwner'); };
  const switchTo = async (s) => { asW(null); await cb('SIGNED_OUT', null); asW(s); await cb('SIGNED_IN', s); };
  const pushedTo = (who, m) => wlog.some(w => w.who === who && w.m === m);

  // L4-1: B owns the device; A is signed in and picks a market; the account switches to B
  // while A's server-first write is in flight.
  asW(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); rowsFor['u-a'] = []; rowsFor['u-b'] = [];
  asW(UB); await cb('SIGNED_IN', UB); await settle();                 // B = owner
  asW(null); await cb('SIGNED_OUT', null); await settle();
  asW(UA); await cb('SIGNED_IN', UA); await settle();
  wlog.length = 0; setDelay = 25;
  const inflight = msync.pushMarketChange(4, 'nashville-tn');
  await settle(3); await switchTo(UB);
  const res41 = await inflight; setDelay = 0; await settle(40);
  if (res41.ok) tiers.setMarketSlot(4, 'nashville-tn');               // the picker's commit (main.js) runs only on ok
  ok(pushedTo('u-a', 'nashville-tn') && res41.ok === false && res41.accountChanged === true && tiers.getMarketForSlot(4) !== 'nashville-tn',
     'G1 L4-1: a write whose account changes in flight reached A only, and is NOT committed on this device under B (caller told not ok)');
  ok(localStorage.getItem('marketSlotFrom_4') === null, 'G2 L4-1: …and no provenance is written for it (never mislabelled as the new account’s)');
  asW(UB); await auth.initAuthAndEntitlement(); await settle();
  ok(!pushedTo('u-b', 'nashville-tn'), 'G3 L4-1: B’s next boot never writes A’s selection into B');
  // A later genuine selection by B syncs to B, and its provenance names B.
  asW(UB); const g4 = await msync.pushMarketChange(4, 'memphis-tn'); if (g4.ok) tiers.setMarketSlot(4, 'memphis-tn');
  ok(g4.ok && pushedTo('u-b', 'memphis-tn') && JSON.parse(localStorage.getItem('marketSlotFrom_4') || '{}').u === 'u-b',
     'G4 a later genuine selection syncs to the current account, and its provenance names that account');

  // L4-2: a fresh device (no owner) with a signed-out pick; A's genuine sign-in push is in
  // flight when the account switches to B. A also holds a server row in a LATER slot.
  asW(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); rowsFor['u-a'] = [{ slot_index: 3, market_id: 'reno-nv', changed_at: null }]; rowsFor['u-b'] = [];
  tiers.setMarketSlot(0, 'tampa-fl');
  wlog.length = 0; setDelay = 25;
  asW(UA); await cb('SIGNED_IN', UA); await settle(5);               // A's hydration push of slot 0 is in flight
  await switchTo(UB); await settle(60); setDelay = 0;
  ok(pushedTo('u-a', 'tampa-fl') && !pushedTo('u-b', 'tampa-fl'), 'G5 L4-2: the signed-out pick goes to the first account only — never pushed a second time into the account that signed in mid-sync');
  ok(tiers.getMarketForSlot(3) !== 'reno-nv' && localStorage.getItem('marketSlotsOwner') === 'u-a',
     'G6 L4-2: the previous account’s later rows are not applied after the switch; the owner was recorded before the first push');

  // L4-3: unreadable / malformed provenance fails closed; an ABSENT record (legacy) is still local.
  asW(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); rowsFor['u-a'] = []; rowsFor['u-b'] = [];
  localStorage.setItem('marketSlotsOwner', 'u-a');
  tiers.setMarketSlot(1, 'boise-id'); localStorage.setItem('marketSlotFrom_1', '{not json');
  tiers.setMarketSlot(2, 'reno-nv');  localStorage.setItem('marketSlotFrom_2', JSON.stringify({ m: 'reno-nv' }));
  tiers.setMarketSlot(5, 'austin-tx');   // legacy: no record at all
  wlog.length = 0;
  asW(UA); await auth.initAuthAndEntitlement(); await settle();
  // Re-pinned for E2: a corrupt / malformed record fails closed — never pushed, and (E2) no longer shown.
  ok(!pushedTo('u-a', 'boise-id') && !pushedTo('u-a', 'reno-nv') && tiers.getMarketForSlot(1) === '' && tiers.getMarketForSlot(2) === '',
     'G7 L4-3: corrupt or malformed provenance fails closed — never pushed, and not shown (E2)');
  ok(pushedTo('u-a', 'austin-tx'), 'G8 L4-3: a slot with NO provenance record (legacy / signed-out pick) is still pushed to the owner');
  ok(/const uid = getUserId\(\);\s*try \{\s*const \{ data, error, status \} = await supabase\.rpc\('set_user_market'/.test(rd('docs/src/js/marketSync.js')),
     'G9 source: pushMarketChange captures the account BEFORE its request');

  // E2 (owner decision 2026-11-23) — another account's server-held markets and their change
  // dates are never SHOWN after sign-out / an account switch; unattributed local picks are kept;
  // the server restores each account's own markets.
  const dates = () => { try { return JSON.parse(localStorage.getItem('slotChangeDates') || '{}'); } catch { return {}; } };
  const rec = (s) => localStorage.getItem('marketSlotFrom_' + s);
  asW(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); localStorage.removeItem('slotChangeDates');
  rowsFor['u-a'] = [{ slot_index: 1, market_id: 'charlotte-nc', changed_at: '2026-11-20T12:00:00.000Z' }]; rowsFor['u-b'] = [{ slot_index: 2, market_id: 'durham-nc', changed_at: '2026-11-21T12:00:00.000Z' }];
  tiers.setMarketSlot(4, 'austin-tx'); tiers.recordSlotChange(4);          // an unattributed signed-out pick + its local clock
  setDelay = 0;
  const RPCWR = { ...RPCW, set_user_market: (args) => { wlog.push({ who: auth.getUserId(), slot: args.p_slot, m: args.p_market }); return { data: { ok: false, reason: 'cap' }, error: null, status: 200 }; } };
  const asR = (session) => { st = S({ session, rpc: RPCWR }); return st; };   // refuses: austin-tx stays unattributed
  asR(UA); await cb('SIGNED_IN', UA); await settle();
  ok(tiers.getMarketForSlot(1) === 'charlotte-nc' && dates()[1] && JSON.parse(rec(1) || '{}').u === 'u-a', 'H0 A signs in: A’s server market and change date are pulled, attributed to A');
  asR(null); await cb('SIGNED_OUT', null); await settle();
  ok(tiers.getMarketForSlot(1) === '' && !dates()[1] && rec(1) === null, 'H1 sign-out clears A’s server-held market, its change date and its record');
  ok(tiers.getMarketForSlot(4) === 'austin-tx' && !!dates()[4], 'H2 …and keeps the unattributed local-only pick with its local clock');
  asR(UA); await cb('SIGNED_IN', UA); await settle();
  ok(tiers.getMarketForSlot(1) === 'charlotte-nc' && !!dates()[1], 'H3 the same account signs back in: the server restores its own market and change date');
  // direct switch A → B (no sign-out), with B's read delayed: A's value is gone BEFORE B's read lands
  rowsDelay = 30; asR(UB); const swB = cb('SIGNED_IN', UB); await settle(12);
  const midSwitch = tiers.getMarketForSlot(1);
  await swB; await settle(60); rowsDelay = 0;
  ok(midSwitch === '' && tiers.getMarketForSlot(1) === '' && tiers.getMarketForSlot(2) === 'durham-nc' && !dates()[1],
     'H4 a direct switch A → B hides A’s market and date at once (before B’s read returns); B gets its own');
  // failed / offline read: the purge still happens
  asR(null); await cb('SIGNED_OUT', null); await settle();
  asR(UA); await cb('SIGNED_IN', UA); await settle();                                       // A's charlotte-nc back
  st = S({ session: UB, rpc: { ...RPCWR, get_user_markets: () => NET_PG } }); await cb('SIGNED_IN', UB); await settle();
  ok(tiers.getMarketForSlot(1) === '' && tiers.getMarketForSlot(4) === 'austin-tx', 'H5 B signs in while the server read fails (offline): A’s market is still hidden; the local pick stays');
  st = S({ session: UB, rpc: { ...RPCWR, get_user_markets: () => ({ data: null, error: { message: 'internal', code: 'XX000' }, status: 500 }) } }); await auth.initAuthAndEntitlement(); await settle();
  ok(tiers.getMarketForSlot(1) === '' && tiers.getMarketForSlot(2) === '', 'H6 boot as B with a server error: nothing of A’s is shown (B’s own returns when the read succeeds)');
  // a record for an OLDER value: the current value is a local pick — kept, record dropped
  asR(null); await cb('SIGNED_OUT', null); await settle();
  tiers.setMarketSlot(3, 'boise-id'); localStorage.setItem('marketSlotFrom_3', JSON.stringify({ m: 'reno-nv', u: 'u-b' }));
  asR(UA); await cb('SIGNED_IN', UA); await settle();
  ok(tiers.getMarketForSlot(3) === 'boise-id' && rec(3) === null, 'H7 a record that names an older value never clears the newer local pick (only the stale record is dropped)');
  // L4-2 + E2: a hydration push completes AFTER a switch — the value becomes A's server data and stops showing for B
  asW(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); rowsFor['u-a'] = []; rowsFor['u-b'] = [];
  tiers.setMarketSlot(0, 'tampa-fl'); setDelay = 25; wlog.length = 0;
  asW(UA); await cb('SIGNED_IN', UA); await settle(5);
  await switchTo(UB); await settle(60); setDelay = 0;
  ok(pushedTo('u-a', 'tampa-fl') && !pushedTo('u-b', 'tampa-fl') && tiers.getMarketForSlot(0) === '',
     'H8 a push that lands after a switch: written to A only, and A’s now server-held value is no longer shown to B');
  asW(null); await cb('SIGNED_OUT', null); await settle(); asW(UA); rowsFor['u-a'] = [{ slot_index: 0, market_id: 'tampa-fl', changed_at: null }];
  await cb('SIGNED_IN', UA); await settle();
  ok(tiers.getMarketForSlot(0) === 'tampa-fl', 'H9 …and A gets it back from the server on A’s next sign-in');
  const mj = rd('docs/src/js/main.js');
  ok(/async function doSignOut\(\) \{\s*await signOutAccount\(\);\s*try \{ purgeForeignMarketSlots\(''\); \} catch/.test(mj) && /res\.purged > 0 \|\|/.test(mj),
     'H10 source: doSignOut clears account-held markets before reload (never blocking it); main re-renders after any purge');

  // Lane-5 R1a: the PAGE drops another account's market at once on a switch — before a slow read returns.
  asR(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); rowsFor['u-a'] = []; rowsFor['u-b'] = [{ slot_index: 2, market_id: 'durham-nc', changed_at: null }];
  asR(UB); await cb('SIGNED_IN', UB); await settle();                                  // B's durham-nc on the page
  rowsDelay = 40; renders.length = 0; asR(UA); const swA = cb('SIGNED_IN', UA); await settle(10);
  const earlyRender = renders.find(r => r[2] === '');
  await swA; await settle(80); rowsDelay = 0;
  ok(!!earlyRender && renders.indexOf(earlyRender) === 0, 'R1a a direct switch re-renders the page WITHOUT the other account’s market before the slow read returns');
  ok(/window\.addEventListener\('storage', \(e\) => \{[\s\S]{0,200}primaryMarket\|market_\\d\|slotChangeDates\|marketSlotFrom_\\d[\s\S]{0,200}renderAllSlots\(\); renderGuideMarketIntel\(\);/.test(mj),
     'R1b source: a slot change made by ANOTHER tab (storage event) re-renders this page (executed in the browser re-verify)');
  // Lane-5 R3: a storage exception during the purge never throws to the caller; the value is still cleared.
  tiers.setMarketSlot(1, 'charlotte-nc'); localStorage.setItem('marketSlotFrom_1', JSON.stringify({ m: 'charlotte-nc', u: 'u-z' }));
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { if (k === 'slotChangeDates') throw new Error('QuotaExceededError'); return realSet(k, v); };
  let threw = false, p3 = -1; try { p3 = msync.purgeForeignMarketSlots('u-a'); } catch { threw = true; }
  localStorage.setItem = realSet;
  ok(!threw && p3 === 1 && tiers.getMarketForSlot(1) === '', 'R3 a storage exception during the purge is contained; the other account’s value is still cleared');

  // Lane-5 R7 (owner decision 2026-11-23): on a DIRECT switch the previous account's market,
  // change date and record leave storage AND the page BEFORE the plan check (current_tier)
  // answers — whether it is slow, fails, or never returns. main.js's own hideForeignMarkets,
  // compiled from source, is registered exactly as main registers it.
  // O1 renamed it hideForeignAccountData (it now also covers saved deals and the account line); either name compiles.
  const hm = mj.match(/function (?:hideForeignAccountData|hideForeignMarkets)\(\) \{([\s\S]*?)\r?\n\}/);
  const earlyHook = hm ? new Function('purgeForeignMarketSlots', 'renderAllSlots', 'renderGuideMarketIntel', 'getReviewingDealId', 'getDeals', 'dropForeignPipeline',
    'cancelDealReview', 'renderPipeline', 'updateAccountUI', 'document',
    'analyzerOwner', 'isSignedIn', 'getUserId', 'clearForeignAnalyzer', hm[1]) : null;   // overnight B: analyzer owner (no analyzer here: empty)
  const earlyRenders = [], pipeRenders = [], acctRenders = [];
  const docShim = { getElementById: (id) => (id === 'page-pipeline' ? { classList: { contains: () => true } } : null) };   // the pipeline page is open
  if (earlyHook) auth.onAuthChange(() => earlyHook(msync.purgeForeignMarketSlots, () => { earlyRenders.push([0, 1, 2, 3, 4, 5].map(i => tiers.getMarketForSlot(i))); }, () => {},
    () => null, storage.getDeals, storage.dropForeignPipeline || (() => false), () => {}, () => { pipeRenders.push(storage.getDeals().map(d => d.name).join()); },
    () => { acctRenders.push(auth.getUserId()); }, docShim, {}, auth.isSignedIn, auth.getUserId, () => {}), { beforeEntitlement: true });
  const order = [];   // auth ordering, independent of main.js: an early subscriber vs the plan-check answer
  auth.onAuthChange(() => order.push('early'), { beforeEntitlement: true });
  let tierAnswered = false;
  const tierRpc = (mode) => () => {
    if (mode === 'pending') return new Promise(() => {});
    const ans = mode === 'fail' ? NET_PG : mode === 'error' ? { data: null, error: { message: 'internal', code: 'XX000' }, status: 500 } : PRO;
    return new Promise(r => setTimeout(() => { tierAnswered = true; order.push('tier'); r(ans); }, 60));
  };
  const asT = (session, mode) => { st = S({ session, rpc: { ...RPCWR, current_tier: tierRpc(mode) } }); return st; };
  const backToA = async () => { asR(UA); await cb('SIGNED_IN', UA); await settle(); };
  asR(null); await cb('SIGNED_OUT', null); await settle();
  resetDevice(); localStorage.removeItem('slotChangeDates');
  rowsFor['u-a'] = [{ slot_index: 3, market_id: 'reno-nv', changed_at: '2026-11-20T12:00:00.000Z' }]; rowsFor['u-b'] = [{ slot_index: 2, market_id: 'durham-nc', changed_at: null }];
  tiers.setMarketSlot(4, 'austin-tx');                    // an unattributed local-only pick (B's sign-in will try, and be refused, to push it — not a new write path)
  await backToA();
  const aShown = tiers.getMarketForSlot(3) === 'reno-nv' && !!dates()[3] && JSON.parse(rec(3) || '{}').u === 'u-a';
  const r7 = {};
  for (const mode of ['slow', 'fail', 'error', 'pending']) {
    if (mode !== 'slow') await backToA();
    tierAnswered = false; earlyRenders.length = 0; order.length = 0;
    asT(UB, mode); const sw = cb('SIGNED_IN', UB); await settle(10);
    r7[mode] = { answered: tierAnswered, uid: auth.getUserId(), v: tiers.getMarketForSlot(3), date: !!dates()[3], rec: rec(3), render: earlyRenders.find(r => r[3] === ''),
                 local: tiers.getMarketForSlot(4), writes: (st.rpcCalls || []).filter(c => c.name === 'set_user_market').length, firstEarly: order[0] === 'early' };
    if (mode !== 'pending') { await sw; await settle(60); }
  }
  ok(aShown, 'R7a setup: A’s server market, change date and record are on the device while A is signed in');
  ok(['slow', 'fail', 'error', 'pending'].every(k => !r7[k].answered && r7[k].uid === 'u-b' && r7[k].v === '' && !r7[k].date && r7[k].rec === null),
     'R7b a direct switch A → B removes A’s market, date and record from STORAGE before the plan check answers — slow, offline, server error, never (' + JSON.stringify(r7) + ')');
  ok(['slow', 'fail', 'error', 'pending'].every(k => !!r7[k].render && r7[k].render[4] === 'austin-tx'), 'R7c …and the PAGE is re-rendered without it, before the plan check, in all four cases');
  ok(['slow', 'fail', 'error', 'pending'].every(k => r7[k].local === 'austin-tx' && r7[k].writes === 0 && r7[k].firstEarly),
     'R7d the unattributed local pick is kept; nothing is written before the plan check; the early subscriber runs first');
  // same account (tab return / token refresh) with a slow or hanging plan check: nothing of the user's own is cleared or re-rendered
  asR(null); await cb('SIGNED_OUT', null); await settle(); await backToA();
  earlyRenders.length = 0; asT(UA, 'slow'); const sa = cb('SIGNED_IN', UA); await settle(10);
  const keptSame = tiers.getMarketForSlot(3) === 'reno-nv' && !!dates()[3] && earlyRenders.length === 0; await sa; await settle(60);
  asT(UA, 'slow'); const tr = cb('TOKEN_REFRESHED', UA); await settle(10);
  const keptTok = tiers.getMarketForSlot(3) === 'reno-nv' && earlyRenders.length === 0; await tr; await settle(60);
  ok(keptSame && keptTok && tiers.getMarketForSlot(3) === 'reno-nv', 'R7e same-account SIGNED_IN / TOKEN_REFRESHED: the signed-in user’s own market is not cleared or re-rendered early');
  // boot as B with A's market still on the device and a slow plan check: hidden before the first answer
  tierAnswered = false; earlyRenders.length = 0; asT(UB, 'slow'); const boot = auth.initAuthAndEntitlement(); await settle(10);
  const bootHidden = !tierAnswered && tiers.getMarketForSlot(3) === '' && rec(3) === null && earlyRenders.some(r => r[3] === '');
  await boot; await settle(60);
  ok(bootHidden && tiers.getMarketForSlot(2) === 'durham-nc', 'R7f boot as B with A’s market on the device: hidden before the first plan check; B’s own arrives after');
  ok(/onAuthChange\((?:hideForeignAccountData|hideForeignMarkets), \{ beforeEntitlement: true \}\);/.test(mj)
     && /_session = next;\s*notifyEarly\(\);[^\n]*\n\s*await syncEntitlement\(\);/.test(rd('docs/src/js/auth.js'))
     && /const bootSession = _session;\s*notifyEarly\(\);[^\n]*\n\s*await syncEntitlement\(\);/.test(rd('docs/src/js/auth.js')),
     'R7g source: main registers the purge-and-render before the plan check; auth runs it before the first await on every auth event and at boot');


  // O1 (pre-release check 2026-11-23): saved deals and the account line follow the account on the
  // same early path. save_pipeline is a wholesale replace, so a save built on another account's
  // cache would copy its deals into the new account and erase the new account's own.
  const dA = { id: 9001, name: 'ALPHA-SECRET', type: 'flip', notes: 'A private note' }, dB = { id: 9002, name: 'BRAVO', type: 'flip', notes: 'B note' };
  const pipesFor = { 'u-a': [dA], 'u-b': [dB] }; let pipeDelay = 0, saveDelay = 0; const saveLog = [];
  const PIPE = { get_pipeline: () => later({ data: (pipesFor[auth.getUserId()] || []).slice(), error: null, status: 200 }, pipeDelay),
                 save_pipeline: (args) => { saveLog.push({ who: auth.getUserId(), names: (args.p_deals || []).map(d => d.name) }); return later({ data: null, error: null, status: 200 }, saveDelay); } };
  const asP = (session, mode, extra = {}) => { st = S({ session, rpc: { ...RPCWR, ...PIPE, ...(mode ? { current_tier: tierRpc(mode) } : {}), ...extra } }); return st; };
  const names = () => storage.getDeals().map(d => d.name).join();
  asP(null); await cb('SIGNED_OUT', null); await settle();
  asP(UA); await cb('SIGNED_IN', UA); await settle(); await storage.hydratePipeline();
  const o1Setup = names() === 'ALPHA-SECRET' && storage.pipelineHydrationOk();
  const o1 = {};
  for (const mode of ['slow', 'fail', 'pending']) {
    if (mode !== 'slow') { asP(UA); await cb('SIGNED_IN', UA); await settle(); await storage.hydratePipeline(); }
    pipeRenders.length = 0; acctRenders.length = 0; tierAnswered = false; saveLog.length = 0;
    asP(UB, mode); const sw = cb('SIGNED_IN', UB); await settle(10);
    const sv = await storage.saveDeals([{ id: 9100, name: 'B-NEW' }, ...storage.getDeals()]);   // the candidate pipeline.js builds on Save
    o1[mode] = { answered: tierAnswered, uid: auth.getUserId(), cache: names(), hydrated: storage.pipelineHydrationOk(), state: storage.pipelineLoadState(),
                 rendered: pipeRenders.some(r => r === ''), acct: acctRenders.includes('u-b'), save: sv.ok === false && sv.reason === 'stale', saves: saveLog.length };
    if (mode !== 'pending') { await sw; await settle(80); }
  }
  ok(o1Setup, 'O1a setup: A’s saved deal is in the pipeline cache, hydrated, while A is signed in');
  ok(['slow', 'fail', 'pending'].every(k => !o1[k].answered && o1[k].uid === 'u-b' && o1[k].cache === '' && !o1[k].hydrated && o1[k].state === 'loading' && o1[k].rendered && o1[k].acct),
     'O1b a direct switch A → B drops A’s saved deals, re-renders the open pipeline as "loading" and the account line as B — before the plan check answers (' + JSON.stringify(o1) + ')');
  ok(['slow', 'fail', 'pending'].every(k => o1[k].save && o1[k].saves === 0), 'O1c …and a Save in that window is refused before any request: A’s deals are never written into B, B’s are never erased');
  // a late get_pipeline answer for A lands after B is signed in
  asP(null); await cb('SIGNED_OUT', null); await settle();
  asP(UA); await cb('SIGNED_IN', UA); await settle();
  pipeDelay = 40; const lateA = storage.hydratePipeline(); await settle(5);
  pipeDelay = 0; asP(UB); await cb('SIGNED_IN', UB); await settle(5);
  await lateA; await settle(50);
  const afterLate = { cache: names(), hydrated: storage.pipelineHydrationOk() };
  await storage.hydratePipeline();
  ok(afterLate.cache === '' && !afterLate.hydrated && names() === 'BRAVO' && storage.pipelineHydrationOk(),
     'O1d a late pipeline answer for A, landing after B signed in, is discarded; B’s own pipeline then loads normally (' + JSON.stringify(afterLate) + ')');
  // an in-flight save as A when B signs in
  asP(null); await cb('SIGNED_OUT', null); await settle(); asP(UA); await cb('SIGNED_IN', UA); await settle(); await storage.hydratePipeline();
  saveDelay = 40; saveLog.length = 0; const inflightSave = storage.saveDeals([{ id: 9200, name: 'A-NEW' }, ...storage.getDeals()]); await settle(5);
  saveDelay = 0; asP(UB); await cb('SIGNED_IN', UB); await settle(5);
  const rIn = await inflightSave; await settle(20);
  ok(rIn.ok === false && rIn.accountChanged === true && saveLog.length === 1 && saveLog[0].who === 'u-a' && !/A-NEW|ALPHA-SECRET/.test(names()),
     'O1e a save in flight when the account changes lands on A only and is never committed to the cache under B');
  // same account: token refresh / tab-return SIGNED_IN with a slow plan check keep the user's own deals
  asP(null); await cb('SIGNED_OUT', null); await settle(); asP(UA); await cb('SIGNED_IN', UA); await settle(); await storage.hydratePipeline();
  pipeRenders.length = 0; asP(UA, 'slow'); const t1 = cb('TOKEN_REFRESHED', UA); await settle(10);
  const keep1 = names() === 'ALPHA-SECRET' && storage.pipelineHydrationOk(); await t1; await settle(80);
  asP(UA, 'slow'); const t2 = cb('SIGNED_IN', UA); await settle(10);
  const keep2 = names() === 'ALPHA-SECRET' && storage.pipelineHydrationOk() && pipeRenders.length === 0; await t2; await settle(80);
  ok(keep1 && keep2, 'O1f same-account TOKEN_REFRESHED / SIGNED_IN: the user’s own saved deals stay loaded and are not re-rendered early');
  // ordinary sign-out drops the deals at once
  asP(null); const so = cb('SIGNED_OUT', null); const soNow = { cache: names(), state: storage.pipelineLoadState() }; await so; await settle();
  ok(soNow.cache === '' && soNow.state === 'idle', 'O1g sign-out drops the saved deals synchronously, before anything awaits');
  // B's own pipeline read fails after a switch: A's proven hydration never carries over to B
  asP(UA); await cb('SIGNED_IN', UA); await settle(); await storage.hydratePipeline();
  asP(UB, null, { get_pipeline: () => NET_PG }); await cb('SIGNED_IN', UB); await settle(); await storage.hydratePipeline();
  saveLog.length = 0; const sv2 = await storage.saveDeals([{ id: 9300, name: 'B-2' }, ...storage.getDeals()]);
  ok(names() === '' && !storage.pipelineHydrationOk() && storage.pipelineLoadState() === 'failed' && sv2.reason === 'stale' && saveLog.length === 0,
     'O1h B’s pipeline read fails after the switch: nothing of A’s is shown, the view says it could not load, and a Save is refused (no wholesale replace)');
  ok(/onAuthChange\(hideForeignAccountData, \{ beforeEntitlement: true \}\);/.test(mj) && /if \(dropForeignPipeline\(\)\) \{/.test(mj) && /updateAccountUI\(\);\s*\}/.test(mj)
     && /if \(uidNow\(\) !== uid\) return _cache;/.test(rd('docs/src/js/storage.js')) && /if \(_cacheFor !== uid\) return \{ ok: false, reason: 'stale', accountChanged: true \};/.test(rd('docs/src/js/storage.js')),
     'O1i source: main drops another account’s deals and refreshes the account line before the plan check; storage tags its cache with the account and guards reads and saves');

  const T = auth.authEventAllowsMarketPush;
  ok(T('SIGNED_IN', null, UA) && T('INITIAL_SESSION', null, UA) && !T('SIGNED_IN', UA, UA) && !T('SIGNED_IN', UA, UB)
     && !T('TOKEN_REFRESHED', null, UA) && !T('TOKEN_REFRESHED', UA, UA) && !T('USER_UPDATED', UA, UA) && !T('SIGNED_OUT', UA, null) && !T('SIGNED_IN', null, null),
     'F14 decision table: only SIGNED_IN / INITIAL_SESSION from signed-out may push');
}

// ── §S source pins for the UI wiring ─────────────────────────────────────────
console.log('— §S UI wiring (source pins; behaviour executed in the browser check) ─');
const pl = rd('docs/src/js/pipeline.js'), mainJ = rd('docs/src/js/main.js'), idx = rd('docs/index.html'), sv3 = rd('docs/src/js/sharedView.js'), sh = rd('docs/shared.html');
ok(/loadState === 'failed'/.test(pl) && /Couldn’t load your saved deals/.test(pl) && pl.indexOf("loadState === 'failed'") < pl.indexOf('No deals saved yet'), 'S1 the pipeline view checks load state before it may say "No deals saved yet"');
ok((pl.match(/offlineNow\(res\)/g) || []).length >= 5 && /this deal was NOT saved/.test(pl) && /nothing was deleted/.test(pl), 'S2 save / delete / edit failures say what did NOT happen when offline');
ok(/id="net-status" class="net-status" role="status" aria-live="polite" hidden>/.test(idx) && idx.indexOf('id="net-status"') > idx.indexOf('<div class="nav">'), 'S3 one accessible status region, after the nav (the nav stays the first sticky element)');
ok(/initConnectivity\(\);/.test(mainJ) && mainJ.indexOf('initConnectivity();') < mainJ.indexOf('initAuthAndEntitlement().then') && /retryConnection: retryNow/.test(mainJ), 'S4 connectivity wiring runs at boot before the first auth settles; Retry is exposed');
ok(/else if \(intelMap\.unavailable\) paint\(null, true\);/.test(mainJ) && /DealFit’s built-in figures/.test(mainJ), 'S5 the guide says premium details could not load, and that the shown numbers are the built-in benchmarks');
ok(/id="account-plan-unverified"[^>]*hidden/.test(idx) && /entitlementStatus\(\) === 'unverified'/.test(mainJ), 'S6 the account panel says when the plan could not be checked');
ok(/isNetworkFailure\(error, status\)\) \{ offline\(\); return; \}/.test(sv3) && /id="shared-offline"/.test(sh) && /This shared deal isn't available/.test(sh), 'S7 a shared link that cannot load says "no connection", not "isn\u2019t available"');
ok(!/startCheckout|functions\.invoke\('checkout'|functions\.invoke\('portal'/.test(rd('docs/src/js/connectivity.js')) && !/retry[^\n]*save_pipeline/.test(rd('docs/src/js/connectivity.js')), 'S8 connectivity never touches checkout/portal and never retries a write');

// ── §P F3 (owner-approved wording 2026-11-23): privacy §5 matches what the app actually loads ─
console.log('— §P privacy §5 matches the shipped resource loading ─');
{
  const pv = rd('docs/privacy.html');
  const s5 = (pv.split('<h2>5. Hosting and Software Delivery</h2>')[1] || '').split('<h2>6.')[0];
  ok(s5.includes("DealFit's static web application is hosted through GitHub Pages.")
     && s5.includes("The software libraries and fonts DealFit uses are served from DealFit's own site; the app does not load them from third-party content-delivery services.")
     && s5.includes("When your browser requests DealFit's pages and files, GitHub Pages may receive ordinary network information such as your IP address, browser details, and request metadata, which it handles under its own privacy practices."),
     'P1 §5 keeps the GitHub Pages hosting paragraph and carries the two approved sentences');
  ok(!/esm\.sh|Google Fonts/i.test(pv), 'P2 the policy no longer names services the app does not contact (esm.sh, Google Fonts)');
  ok(/<h2>3\.[^<]*<\/h2>[\s\S]*Stripe/.test(pv) && /<h2>4\.[^<]*<\/h2>[\s\S]*Supabase/.test(pv) && /<h2>6\. Clear Path Capital Funding Requests<\/h2>/.test(pv),
     'P3 the other service-provider disclosures (Stripe, Supabase, Clear Path Capital) are kept');
  const servedRemote = pages.flatMap(p => [...rd('docs/' + p).matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1])).filter(u => !/rel="canonical"/.test(u));
  ok(!servedRemote.some(u => /esm\.sh|fonts\.googleapis|fonts\.gstatic|cdn\./i.test(u)), 'P4 …and the pages indeed load no library or font from a third-party CDN');
}

console.log(`\nmobilep0: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
