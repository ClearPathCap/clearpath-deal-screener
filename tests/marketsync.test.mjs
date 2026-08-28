// UX wave finding 3 — account-backed market sync (client wiring of the
// existing 0003 RPCs). Run:
//   node --import ./tests/_hooks/register-stubs.mjs tests/marketsync.test.mjs
//
// PROVEN DEFECT: a region added on the laptop never reached the iPhone on the
// same signed-in account — slots were localStorage-only, and the server RPCs
// (get_user_markets / set_user_market) had zero client call sites.
//
// THE PRECEDENCE LAW under test (first hydration must never destroy data):
//   signed out            → zero RPC, zero local change;
//   server row for a slot → server wins that slot;
//   local-only slot       → pushed UP (the migration path for existing users);
//   push refused          → local value KEPT;
//   RPC error             → nothing changes anywhere.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// localStorage-backed slots use the REAL tiers.js against this store.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { search: '', href: 'https://dealfit.example/', pathname: '/' };
globalThis.window = globalThis;
console.warn = () => {};

const session = { user: { id: 'u-sync', email: 'qa@example.com' } };
globalThis.__stubSupabase = { session: null, rpc: {} };

const auth  = await import("../docs/src/js/auth.js");
const tiers = await import("../docs/src/js/tiers.js");
const sync  = await import("../docs/src/js/marketSync.js");

const rpcCalls = () => (globalThis.__stubSupabase.rpcCalls ?? []);
const signIn  = async (rpc) => { globalThis.__stubSupabase = { session, rpc, rpcCalls: [] };
  // record calls through the generic stub
  const s = globalThis.__stubSupabase;
  await auth.initAuthAndEntitlement(); return s; };
const signOut = async () => { globalThis.__stubSupabase = { session: null, rpc: {}, rpcCalls: [] };
  await auth.initAuthAndEntitlement(); };

// ── §A · signed out: local-only behavior is untouched ────────────────────────
await signOut();
store.set('primaryMarket', 'charlotte-nc');
let r = await sync.hydrateMarketsOnAuth();
ok("[LAW] signed out → status signed-out, zero pulls/pushes", r.status === 'signed-out' && r.pulled === 0 && r.pushed === 0);
ok("[LAW] signed out → local slots untouched", tiers.getPrimaryMarket() === 'charlotte-nc');
let p = await sync.pushMarketChange(0, 'columbia-sc');
ok("[LAW] signed out pushMarketChange resolves ok:true local (no network)", p.ok === true && p.local === true);

// ── §B · server rows win their slots (pull) ──────────────────────────────────
await signIn({
  current_tier: { data: 'pro', error: null },
  get_user_markets: { data: [
    { slot_index: 0, market_id: 'lake-murray-sc', changed_at: null },
    { slot_index: 2, market_id: 'greenville-sc',  changed_at: null },
  ], error: null },
});
store.set('primaryMarket', 'charlotte-nc');       // device-local value differs from server
r = await sync.hydrateMarketsOnAuth();
ok("[DEFECT-CLOSING] hydration reports synced", r.status === 'synced');
ok("[DEFECT-CLOSING] the laptop's region reaches this device (server wins slot 0)",
   tiers.getPrimaryMarket() === 'lake-murray-sc');
ok("[DEFECT-CLOSING] sparse server slots land in place (slot 2)", tiers.getMarketForSlot(2) === 'greenville-sc');
ok("[COUNT] pulled === 2", r.pulled === 2);

// ── §C · local-only slots push UP (the safe migration path) ──────────────────
store.clear();
store.set('primaryMarket', 'charlotte-nc');
store.set('market_2', 'columbia-sc');
let setCalls = [];
await signIn({
  get_user_markets: { data: [], error: null },
  set_user_market: (args) => { setCalls.push(args); return { data: { ok: true, msg: 'Market added.' }, error: null }; },
});
r = await sync.hydrateMarketsOnAuth();
ok("[DEFECT-CLOSING] first signed-in hydration migrates local slots to the server",
   r.pushed === 2 && setCalls.length === 2);
ok("[DEFECT-CLOSING] pushes carry the exact slot/market pairs",
   JSON.stringify(setCalls) === JSON.stringify([
     { p_slot: 0, p_market: 'charlotte-nc' }, { p_slot: 1, p_market: 'columbia-sc' }]));
ok("[LAW] local slots are NOT destroyed by migration", tiers.getPrimaryMarket() === 'charlotte-nc'
   && tiers.getMarketForSlot(1) === 'columbia-sc');

// ── §D · push refused → local kept; RPC error → nothing changes ──────────────
store.clear();
store.set('market_5', 'asheville-nc');            // a slot beyond a starter cap
await signIn({
  get_user_markets: { data: [], error: null },
  set_user_market: () => ({ data: { ok: false, msg: 'That market slot is not unlocked on your plan.' }, error: null }),
});
r = await sync.hydrateMarketsOnAuth();
ok("[LAW] refused push → pushed 0, local value KEPT (visible on this device)",
   r.pushed === 0 && tiers.getMarketForSlot(4) === 'asheville-nc');

store.clear();
store.set('primaryMarket', 'charlotte-nc');
await signIn({ get_user_markets: { error: { message: 'boom' }, data: null } });
r = await sync.hydrateMarketsOnAuth();
ok("[LAW] RPC error → status error, zero local change",
   r.status === 'error' && tiers.getPrimaryMarket() === 'charlotte-nc');

// ── §E · signed-in slot change is server-first ───────────────────────────────
await signIn({ set_user_market: (a) => ({ data: { ok: true, msg: 'Market updated.', lockedUntil: null }, error: null }) });
p = await sync.pushMarketChange(1, 'columbia-sc');
ok("[DEFECT-CLOSING] signed-in change asks the server and passes its answer through", p.ok === true);
await signIn({ set_user_market: () => ({ data: { ok: false, msg: 'This market is locked until the cooldown ends.', lockedUntil: 'x' }, error: null }) });
p = await sync.pushMarketChange(1, 'columbia-sc');
ok("[DEFECT-CLOSING] a server cooldown refusal reaches the caller verbatim",
   p.ok === false && /cooldown/.test(p.msg));
await signIn({ set_user_market: { error: { message: 'net down' }, data: null } });
p = await sync.pushMarketChange(1, 'columbia-sc');
ok("[LAW] transport failure is a refusal, never a silent local commit", p.ok === false);

// ── §F · wiring pins ─────────────────────────────────────────────────────────
const mainSrc = src("docs/src/js/main.js");
ok("[DEFECT-CLOSING] hydration joins the auth chain", /onAuthChange\(syncMarketsOnAuth\)/.test(mainSrc));
ok("[DEFECT-CLOSING] the picker commits server-first",
   /const res = await pushMarketChange\(slot, marketId\);\s*\n\s*if \(!res\.ok\) \{/.test(mainSrc));
ok("[PRESERVATION] a sync that changes slots re-renders through the M-1-safe path",
   /renderAllSlots\(\);\s+\/\/ M-1 stays correct/.test(mainSrc));
ok("[PRESERVATION] no second persistence architecture — the module calls the 0003 RPCs",
   /rpc\('get_user_markets'\)/.test(src("docs/src/js/marketSync.js"))
   && /rpc\('set_user_market', \{ p_slot: slot, p_market: marketId \}\)/.test(src("docs/src/js/marketSync.js")));
ok("[PRESERVATION] sign-out does not clear local market slots",
   !/clearMarket|removeItem\('primaryMarket'\)/.test(src("docs/src/js/marketSync.js")));
ok("[PRESERVATION] active slot stays device-local (no server active-slot invented)",
   !/active/i.test(src("docs/src/js/marketSync.js").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')));

console.log(`\nmarketsync: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Account-backed market sync law holds ✓");
