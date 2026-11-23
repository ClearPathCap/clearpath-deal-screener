// ─── Lane-2 review F7 through the REAL vendored Supabase SDK (2026-11-23) ─────
// The SDK itself emits the auth events: INITIAL_SESSION at boot, SIGNED_IN when the
// tab becomes visible again (_onVisibilityChanged → _recoverAndRefresh), and
// TOKEN_REFRESHED, SIGNED_OUT and a genuine SIGNED_IN from verifyOtp. The shipped
// auth.js + marketSync.js + tiers.js run unmodified; the market subscriber is
// main.js's own syncMarketsOnAuth, compiled from its source text. No network:
// fetch is an in-memory fake, the URL is a dead loopback, data is synthetic.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/f7sdk.test.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
register(new URL('./_hooks/realsdk-loader.mjs', import.meta.url));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const settle = (ms = 120) => new Promise(r => setTimeout(r, ms));

// ── browser-shaped globals (the SDK checks window + document) ────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const winT = new EventTarget();
globalThis.window = globalThis;
globalThis.addEventListener = winT.addEventListener.bind(winT);
globalThis.removeEventListener = winT.removeEventListener.bind(winT);
globalThis.dispatchEvent = winT.dispatchEvent.bind(winT);
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
globalThis.location = { href: 'http://127.0.0.1/', search: '', hash: '', pathname: '/', origin: 'http://127.0.0.1' };
console.warn = () => {};

// ── synthetic users + an in-memory fake backend ──────────────────────────────
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const userObj = (id) => ({ id, email: id + '@local.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
let seq = 0;
const sessionFor = (id) => {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ sub: id, exp: now + 3600, aud: 'authenticated', role: 'authenticated', session_id: 's-' + id }) + '.x',
    refresh_token: 'r-' + id + '-' + (++seq), expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user: userObj(id) };
};
let tierMode = 'ok', tierAnswered = false;
let authedAs = 'u-a';        // who the fake backend thinks the bearer is
let pendingUser = 'u-a';     // who a verifyOtp signs in
const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url);
  let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  calls.push({ path: u.pathname, body });
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  switch (u.pathname) {
    case '/rest/v1/rpc/current_tier':   // lane-5 R7: the plan check may be slow, fail or never answer
      if (tierMode === 'pending') return new Promise(() => {});
      if (tierMode === 'slow' || tierMode === 'fail') return new Promise(r => setTimeout(() => { tierAnswered = true; r(tierMode === 'fail' ? json({ message: 'internal' }, 500) : json('pro')); }, 300));
      return json('pro');
    case '/rest/v1/rpc/get_user_markets': return json(authedAs === 'u-b' ? [{ slot_index: 1, market_id: 'charlotte-nc', changed_at: null }] : []);   // B holds one server slot
    case '/rest/v1/rpc/set_user_market': return json({ ok: false, reason: 'cooldown' });   // refused: the slot stays local-only (worst case)
    case '/rest/v1/rpc/get_pipeline': return json([]);
    case '/auth/v1/verify': authedAs = pendingUser; return json(sessionFor(pendingUser));
    case '/auth/v1/token': return json(sessionFor(authedAs));
    case '/auth/v1/user': return json(userObj(authedAs));
    case '/auth/v1/logout': return new Response(null, { status: 204 });
    default: return json({ message: 'fake: unhandled ' + u.pathname }, 404);
  }
};
const writes = () => calls.filter(c => c.path === '/rest/v1/rpc/set_user_market');
const reads = () => calls.filter(c => c.path === '/rest/v1/rpc/get_user_markets');
const reset = () => { calls.length = 0; events.length = 0; };

// an existing signed-in user (u-a) with a stored session, and a local-only slot
store.set('sb-127-auth-token', JSON.stringify(sessionFor('u-a')));

const { supabase } = await import('../docs/src/js/supabaseClient.js');   // → the real vendored SDK client (loader)
const events = [];
supabase.auth.onAuthStateChange((e) => { events.push(e); });
const auth = await import('../docs/src/js/auth.js');
const tiers = await import('../docs/src/js/tiers.js');
const msync = await import('../docs/src/js/marketSync.js');
const mainSrc = readFileSync(join(ROOT, 'docs/src/js/main.js'), 'utf8');
const m = mainSrc.match(/async function syncMarketsOnAuth\(([^)]*)\) \{([\s\S]*?)\r?\n\}/);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const compiled = new AsyncFunction('hydrateMarketsOnAuth', 'readOnlySync', 'renderAllSlots', 'renderGuideMarketIntel', 'purgeForeignMarketSlots',
  ...(m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : []), m ? m[2] : 'throw new Error("syncMarketsOnAuth not found")');
auth.onAuthChange((s, ctx) => { compiled(msync.hydrateMarketsOnAuth, auth.readOnlySync || (() => false), () => {}, () => {}, msync.purgeForeignMarketSlots || (() => 0), s, ctx).catch(() => {}); });

// Lane-5 R7: main.js's own hideForeignMarkets, compiled from source, registered as main registers it.
// (O1 renamed it hideForeignAccountData; either name compiles. Its pipeline / account-line parts are no-ops here.)
const hm = mainSrc.match(/function (?:hideForeignAccountData|hideForeignMarkets)\(\) \{([\s\S]*?)\r?\n\}/);
const earlyHook = hm ? new Function('purgeForeignMarketSlots', 'renderAllSlots', 'renderGuideMarketIntel', 'getReviewingDealId', 'getDeals', 'dropForeignPipeline',
  'cancelDealReview', 'renderPipeline', 'updateAccountUI', 'document', hm[1]) : null;
const earlyRenders = [];
if (earlyHook) auth.onAuthChange(() => earlyHook(msync.purgeForeignMarketSlots, () => { earlyRenders.push([0, 1, 2, 3, 4, 5].map(i => tiers.getMarketForSlot(i))); }, () => {},
  () => null, () => [], () => false, () => {}, () => {}, () => {}, { getElementById: () => null }), { beforeEntitlement: true });

for (let i = 0; i < 6; i++) tiers.setMarketSlot(i, '');
tiers.setMarketSlot(0, 'tampa-fl');
const visible = async () => {
  document.visibilityState = 'hidden'; dispatchEvent(new Event('visibilitychange')); await settle(40);
  document.visibilityState = 'visible'; dispatchEvent(new Event('visibilitychange')); await settle();
};

console.log('— boot with a stored session (the real SDK) ─');
await auth.initAuthAndEntitlement(); await settle();
ok(events.includes('INITIAL_SESSION') && writes().length === 1 && writes()[0].body?.p_slot === 0,
   'K1 boot: the SDK emits INITIAL_SESSION and the boot hydration pushes the local-only slot exactly once');

console.log('— tab becomes visible: the SDK re-emits SIGNED_IN for the same user ─');
reset(); await visible();
ok(events.includes('SIGNED_IN'), 'K2 power: the real SDK emitted SIGNED_IN on visibilitychange → visible (got: ' + events.join(',') + ')');
ok(writes().length === 0 && reads().length >= 1, 'K3 …and it pulled the market slots but sent NO set_user_market (F7)');
reset(); await visible(); await visible();
ok(writes().length === 0 && events.filter(e => e === 'SIGNED_IN').length >= 2, 'K4 repeated tab returns: still no write');
ok(tiers.getMarketForSlot(0) === 'tampa-fl', 'K5 the refused local-only slot is kept');

console.log('— token refresh (the real SDK) ─');
reset(); await supabase.auth.refreshSession(); await settle();
ok(events.includes('TOKEN_REFRESHED') && writes().length === 0, 'K6 TOKEN_REFRESHED from the SDK sends no set_user_market (got: ' + events.join(',') + ')');

console.log('— sign out, then a genuine code sign-in through the SDK ─');
await auth.signOutAccount(); await settle();
reset(); pendingUser = 'u-a';
const v = await auth.verifyOtpCode('u-a@local.test', '123456'); await settle();
ok(v.ok && events.includes('SIGNED_IN') && writes().length === 1 && writes()[0].body?.p_slot === 0,
   'K7 a genuine signed-out → signed-in transition keeps its hydration: exactly one push of the local-only slot');
reset(); await visible();
ok(writes().length === 0, 'K8 …and the next tab return after it writes nothing');

console.log('— a different account signs in on this device ─');
await auth.signOutAccount(); await settle();
reset(); pendingUser = 'u-b';
const v2 = await auth.verifyOtpCode('u-b@local.test', '123456'); await settle();
ok(v2.ok && auth.getUserId() === 'u-b' && writes().length === 0 && tiers.getMarketForSlot(0) === 'tampa-fl',
   'K9 the other account’s genuine sign-in pushes none of the first account’s local slots; the slot stays local');
ok(tiers.getMarketForSlot(1) === 'charlotte-nc', 'K9b …and B’s own server slot was pulled onto the device');

console.log('— the first account signs back in after the other (lane-3 review N1) ─');
await auth.signOutAccount(); await settle();
ok(tiers.getMarketForSlot(1) === '' && tiers.getMarketForSlot(0) === 'tampa-fl',
   'K9c E2: B’s sign-out (the real SDK’s SIGNED_OUT) clears B’s server-held slot from the device; the unattributed local pick stays');
reset(); pendingUser = 'u-a';
const v3 = await auth.verifyOtpCode('u-a@local.test', '123456'); await settle();
// Re-pinned for E2 (owner decision 2026-11-23): B's value used to stay on the device "untouched";
// it is now cleared (it is B's server data, restored on B's next sign-in) — and still never pushed.
ok(v3.ok && auth.getUserId() === 'u-a' && !writes().some(w => w.body?.p_market === 'charlotte-nc') && writes().some(w => w.body?.p_slot === 0 && w.body?.p_market === 'tampa-fl')
   && tiers.getMarketForSlot(1) === '',
   'K11 A’s genuine sign-in after B never pushes B’s pulled slot into A (A’s own local pick still is), and A is never shown B’s value');
reset(); await auth.signOutAccount(); await settle(); pendingUser = 'u-b';
const v4 = await auth.verifyOtpCode('u-b@local.test', '123456'); await settle();
ok(v4.ok && tiers.getMarketForSlot(1) === 'charlotte-nc' && writes().length === 0,
   'K12 E2: B signs in again — the server restores B’s own market (nothing written)');
console.log('— lane-5 R7: a DIRECT switch B → A (no sign-out) while the plan check is slow / failing / never answers ─');
const viaSdk = {};
for (const mode of ['slow', 'fail', 'pending']) {
  if (mode !== 'slow') { tierMode = 'ok'; pendingUser = 'u-b'; await auth.verifyOtpCode('u-b@local.test', '123456'); await settle(); }   // B (and B's market) back
  const had = tiers.getMarketForSlot(1) === 'charlotte-nc';
  reset(); earlyRenders.length = 0; tierAnswered = false; tierMode = mode; pendingUser = 'u-a';
  const sw = auth.verifyOtpCode('u-a@local.test', '123456');   // the real SDK emits SIGNED_IN for A while B is signed in
  await settle(80);
  viaSdk[mode] = { had, answered: tierAnswered, ev: events.includes('SIGNED_IN'), uid: auth.getUserId(), v: tiers.getMarketForSlot(1), rec: localStorage.getItem('marketSlotFrom_1'),
                   render: earlyRenders.some(r => r[1] === ''), local: tiers.getMarketForSlot(0), writes: writes().length };
  if (mode !== 'pending') { await sw; await settle(400); }
}
ok(['slow', 'fail', 'pending'].every(k => viaSdk[k].had && viaSdk[k].ev && !viaSdk[k].answered && viaSdk[k].uid === 'u-a' && viaSdk[k].v === '' && viaSdk[k].rec === null && viaSdk[k].render),
   'K13 R7 through the real SDK: B’s market leaves storage and the page before the plan check answers — slow, failing, never (' + JSON.stringify(viaSdk) + ')');
ok(['slow', 'fail', 'pending'].every(k => viaSdk[k].local === 'tampa-fl' && viaSdk[k].writes === 0), 'K14 …the unattributed local pick is kept and nothing is written before the plan check');
ok(calls.every(c => !/^https?:/.test(c.path)) && !calls.some(c => /supabase\.co/.test(c.path)), 'K10 every request went to the in-memory fake (no network)');

console.log(`\nf7sdk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
