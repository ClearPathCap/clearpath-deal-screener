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
  auth.onAuthChange(() => { seen.push(auth.readOnlySync()); });
  S({ session: SESSION, rpc: { current_tier: () => ({ data: 'pro', error: null, status: 200 }) } });
  if (globalThis.__stubAuthCallback) await globalThis.__stubAuthCallback('TOKEN_REFRESHED', SESSION);
  const normal = seen.slice();
  seen.length = 0;
  C.noteServerResult('t', { error: NET_PG.error, status: 0 });
  await C.retryNow();
  ok(normal.length >= 1 && normal.every(v => v === false) && seen.length >= 1 && seen.every(v => v === true) && auth.readOnlySync() === false,
     'R1 a reconnect notifies subscribers with readOnlySync()=true (and only then); sign-in / auth changes keep false (review F1)');
  // the market-sync subscriber honours it: pull only, never set_user_market, local slot kept
  tiers.setMarketSlot(2, 'raleigh-nc');
  const calls = S({ session: SESSION, rpc: { get_user_markets: () => ({ data: [], error: null, status: 200 }), set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  const ro = await msync.hydrateMarketsOnAuth({ push: false });
  ok(ro.status === 'synced' && ro.pushed === 0 && !(calls.rpcCalls || []).some(c => c.name === 'set_user_market') && tiers.getMarketForSlot(2) === 'raleigh-nc',
     'R2 hydrateMarketsOnAuth({push:false}) reads only: no set_user_market, the local-only slot stays local (review F1)');
  const calls2 = S({ session: SESSION, rpc: { get_user_markets: () => ({ data: [], error: null, status: 200 }), set_user_market: () => ({ data: { ok: true }, error: null, status: 200 }) } });
  const rw = await msync.hydrateMarketsOnAuth();
  ok(rw.pushed >= 1 && (calls2.rpcCalls || []).some(c => c.name === 'set_user_market'), 'R3 boot / sign-in behaviour is unchanged: the default still pushes local-only slots');
  ok(rd('docs/src/js/main.js').includes('hydrateMarketsOnAuth({ push: !readOnlySync() })')
     && /_readOnlySync = true;\s*try \{ notify\(\); \} finally \{ _readOnlySync = false; \}/.test(rd('docs/src/js/auth.js')),
     'R4 source: main passes push:false during a reconnect; auth sets the flag only around the reconnect notify');
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

console.log(`\nmobilep0: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
