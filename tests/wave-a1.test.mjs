// ─── Wave A1 acceptance suite — K-11 save/delete integrity + K-12 auth chip ───
// Executes the REAL production modules (storage.js, pipeline.js, main.js —
// unmodified bytes) under Node module-customization hooks: supabaseClient.js and
// auth.js are stubbed at the module boundary, the RPC is a controllable stub,
// and no network is touched. No production test seam exists — the hooks live
// entirely in this file. Run: node tests/wave-a1.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const tick = () => new Promise(r => setTimeout(r, 0));

// ── Controllable test state ──────────────────────────────────────────────────
globalThis.__authState = { signedIn: false, email: '' };
let rpcCalls = [];
globalThis.__rpc = async () => ({ data: null, error: null });
globalThis.__supabaseStub = { rpc: (...a) => { rpcCalls.push(a[0]); return globalThis.__rpc(...a); } };
globalThis.__lastResults = { flip: null, rental: null, ltr: null, brrr: null };
globalThis.__tier = 'starter';

// ── Module-boundary stubs (test-file-local; production files stay untouched) ──
const STUBS = {
  'supabaseClient.js': `export const supabase = globalThis.__supabaseStub;`,
  'auth.js': `
    export const isSignedIn = () => globalThis.__authState.signedIn;
    export const getUserEmail = () => globalThis.__authState.email;
    const L = []; export const onAuthChange = f => L.push(f);
    globalThis.__notifyAuth = () => L.forEach(f => { try { f(); } catch {} });
    export const initAuthAndEntitlement = async () => { globalThis.__notifyAuth(); };
    export const sendOtpCode = async () => ({ ok: true, msg: '' });
    export const verifyOtpCode = async () => ({ ok: true, msg: '' });
    export const signOutAccount = async () => {};
    export const redeemServerCode = async () => ({ ok: false, msg: '' });
    export const syncEntitlement = async () => 'starter';`,
  'flip.js': `export const getLastFlipResult = () => globalThis.__lastResults.flip;
    export const analyzeFlip=()=>{},setFlipPreset=()=>{},resetFlip=()=>{};`,
  'rental.js': `export const getLastRentalResult = () => globalThis.__lastResults.rental;
    export const analyzeRental=()=>{},setRentalPreset=()=>{},resetRental=()=>{};`,
  'ltr.js': `export const getLastLtrResult = () => globalThis.__lastResults.ltr;
    export const analyzeLtr=()=>{},setLtrPreset=()=>{},resetLtr=()=>{},getLtrMarket=()=>({});`,
  'brrr.js': `export const getLastBrrrResult = () => globalThis.__lastResults.brrr;
    export const analyzeBrrr=()=>{},setBrrrPreset=()=>{},resetBrrr=()=>{};`,
  'clearpath.js': `export const getPipelineFundingButtonHTML = () => '';
    export const maybeShowFundingButton=()=>{},handlePipelineFundingClick=()=>{};`,
  // Mirrors main.js's + pipeline.js's import surface from tiers.js — grow it in
  // the same commit that grows the imports (missing name = hard ESM error).
  // UX wave: + getActiveMarketId (deal market stamping / auto-name).
  'tiers.js': `export const getActiveTier = () => globalThis.__tier;
    export const isDevMode=()=>false,setDevTier=()=>{},setCachedTier=()=>{},devModeVisible=()=>false,
    migrateMarketStorage=()=>{},redeemCode=()=>({ok:false}),hasSelectedMarkets=()=>true,
    getMarketSlots=()=>[],getMarketForSlot=()=>'',setMarketSlot=()=>{},getPrimaryMarket=()=>'',
    getMarket2=()=>'',completePrimarySelection=()=>{},recordSlotChange=()=>{},isSlotLocked=()=>false,
    slotLockedUntilDate=()=>null,slotWillLockUntilDate=()=>'',getUnlockedSlotCount=()=>2,
    isMarketUnlocked=()=>true,getMarketLabel=(x)=>x,getActiveMarketId=()=>'';`,
  'marketIntel.js': `export const fetchMarketIntel = async () => new Map();`,
  'install.js': `export const openInstall=()=>{},triggerInstall=()=>{},initInstallHint=()=>{};`,
  // This stub mirrors main.js's import surface from repair.js and must grow with
  // it — a missing name is a hard ESM instantiation error, not a silent undefined.
  // Added in the D-1 P2 batch: updateRepairRangesForMarket (M-1's no-market reset)
  // and repairFieldShouldSelectOnFocus (P2-1). Both are inert here; §D only
  // exercises the auth-chip and save-button mappers.
  'repair.js': `export const setRepairTier=()=>{},calcRepair=()=>{},useRepairEstimate=()=>{},onSelfRenoToggle=()=>{},updateRepairRangesForMarket=()=>{},repairFieldShouldSelectOnFocus=()=>false;`,
  'share.js': `export const openShareApp=()=>{},shareDeal=()=>{};`,
  'markets.js': `export const ALL_MARKETS=[],STR_MARKETS={},FLIP_MARKETS={},LTR_MARKETS={};`,
  // UX wave: main.js imports market sync; inert here — §A-§F never exercise it.
  'marketSync.js': `export const hydrateMarketsOnAuth=async()=>({status:'signed-out',pulled:0,pushed:0}),
    pushMarketChange=async()=>({ok:true,local:true});`,
};

registerHooks({
  resolve(spec, ctx, next) {
    const base = spec.split('/').pop();
    if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) {
      return { url: 'stub:' + base, shortCircuit: true };
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
    if (url.startsWith('file:') && url.includes('/docs/src/js/')) {
      return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true };
    }
    return next(url, ctx);
  },
});

// ── Minimal DOM / browser stubs ──────────────────────────────────────────────
const elements = new Map();
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', style: {}, disabled: false,
    checked: false, dataset: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } },
      contains(c) { return this._s.has(c); },
    },
    attrs: {},
    setAttribute(n, v) { this.attrs[n] = v; },
    getAttribute(n) { return this.attrs[n]; },
    addEventListener() {}, removeEventListener() {}, focus() {},
    closest() { return null; }, appendChild() {}, querySelector() { return null; },
  };
}
const el = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
globalThis.document = {
  getElementById: el,
  querySelectorAll: () => [], querySelector: () => null,
  createElement: t => makeEl('_' + t), body: makeEl('body'),
};
globalThis.window = globalThis;
globalThis.alert = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let toasts = [];
globalThis.showToast = (m) => toasts.push(m);
globalThis.openUpgrade = () => {};  // pipeline sections; main.js replaces it later

const storage = await import(JS + 'storage.js');
const pipeline = await import(JS + 'pipeline.js');

// deferred-RPC helper
function deferRpc() {
  let resolve, reject;
  globalThis.__rpc = () => new Promise((res, rej) => {
    resolve = (v) => res(v ?? { data: null, error: null });
    reject = (e) => rej(e);
  });
  return { resolve: (v) => resolve(v), reject: (e) => reject(e) };
}
const okRpc = () => { globalThis.__rpc = async () => ({ data: null, error: null }); };

console.log('— §A storage.js mutation coordinator (real module, stubbed RPC) —');

// A1: signed-out refusal at the storage boundary, no RPC
rpcCalls = [];
globalThis.__authState.signedIn = false;
let r = await storage.saveDeals([{ id: 1 }]);
ok(r.ok === false && r.reason === 'auth', 'A1 signed-out saveDeals -> {ok:false, auth}');
ok(rpcCalls.length === 0, 'A1 no RPC issued signed-out');
ok(storage.getDeals().length === 0, 'A1 cache untouched');

// A2: success commits ONLY after RPC resolution (gate 7a)
globalThis.__authState.signedIn = true;
// RE-PINNED in the UX-wave hardening commit (same-commit law): saveDeals now
// carries a silent-wipe guard — a wholesale replace may only build on a cache
// the server confirmed this session. The A-pins therefore hydrate ONCE here
// (a successful round-trip; okRpc's {data:null} = legitimate empty pipeline)
// exactly as the real boot chain does via syncPipelineOnAuth. The A9/A10 pins
// below prove the guard itself.
okRpc();
await storage.hydratePipeline();
let d = deferRpc();
let p = storage.saveDeals([{ id: 1 }]);
await tick();
ok(storage.getDeals().length === 0, 'A2 cache NOT committed before RPC resolves');
d.resolve();
r = await p;
ok(r.ok === true, 'A2 resolves {ok:true}');
ok(storage.getDeals().length === 1 && storage.getDeals()[0].id === 1, 'A2 cache committed after resolution');

// A3: busy — second mutation issues no second RPC, cache unchanged (gate 8)
rpcCalls = [];
d = deferRpc();
p = storage.saveDeals([{ id: 1 }, { id: 2 }]);
await tick();
let r2 = await storage.saveDeals([{ id: 99 }]);
ok(r2.ok === false && r2.reason === 'busy', 'A3 concurrent mutation -> busy');
ok(rpcCalls.length === 1, 'A3 exactly one RPC in flight');
ok(storage.getDeals().length === 1, 'A3 cache unchanged during flight');
d.resolve();
r = await p;
ok(r.ok === true && storage.getDeals().length === 2, 'A3 first mutation commits after resolve');

// A4: RPC error (no status) -> other, cache unchanged (gate 7b)
d = deferRpc();
p = storage.saveDeals([{ id: 3 }]);
await tick();
d.resolve({ data: null, error: { message: 'boom' } });
r = await p;
ok(r.ok === false && r.reason === 'other', 'A4 error without status -> other');
ok(storage.getDeals().length === 2, 'A4 failed write does not commit');

// A5: stable status codes classify as auth — no message matching
for (const status of [401, 403]) {
  d = deferRpc();
  p = storage.saveDeals([{ id: 4 }]);
  await tick();
  d.resolve({ data: null, error: { message: 'x', status } });
  r = await p;
  ok(r.ok === false && r.reason === 'auth', `A5 error status ${status} -> auth`);
}

// A6: proven signed-out at failure time -> auth
d = deferRpc();
p = storage.saveDeals([{ id: 5 }]);
await tick();
globalThis.__authState.signedIn = false;
d.reject(new Error('network'));
r = await p;
ok(r.ok === false && r.reason === 'auth', 'A6 signed-out at failure time -> auth');
globalThis.__authState.signedIn = true;

// A7: unexpected throw releases the lock (gate 7c)
globalThis.__rpc = async () => { throw new Error('unexpected'); };
r = await storage.saveDeals([{ id: 6 }]);
ok(r.ok === false, 'A7 throw -> {ok:false}');
okRpc();
r = await storage.saveDeals([{ id: 7 }]);
ok(r.ok === true && storage.getDeals()[0].id === 7, 'A7 lock released — next mutation proceeds');

// A8: the RPC uses a snapshot — later mutation of the caller array cannot alter it
const cand = [{ id: 8 }];
d = deferRpc();
p = storage.saveDeals(cand);
cand.push({ id: 'injected' });
await tick(); d.resolve(); r = await p;
ok(r.ok === true && storage.getDeals().length === 1 && storage.getDeals()[0].id === 8, 'A8 snapshot immune to caller mutation');

// A9/A10 · UX-wave silent-wipe guard: an unheard server never authorizes a
// wholesale replace. Sign-out drops hydration knowledge; a FAILED hydrate must
// leave saveDeals refusing 'stale' with ZERO save RPC (existing server deals
// cannot be erased); a subsequent SUCCESSFUL hydrate re-arms saves.
storage.clearPipelineCache();                       // sign-out path: knowledge dies
globalThis.__rpc = async () => ({ data: null, error: { message: 'hydrate down' } });
await storage.hydratePipeline();                    // fails — flag must stay false
rpcCalls = [];
r = await storage.saveDeals([{ id: 'wipe-attempt' }]);
ok(r.ok === false && r.reason === 'stale', 'A9 unproven hydration -> {ok:false, stale}');
ok(rpcCalls.filter(n => n === 'save_pipeline').length === 0, 'A9 zero save RPC — server deals cannot be erased');
okRpc();
await storage.hydratePipeline();                    // legit round-trip (empty is fine)
r = await storage.saveDeals([{ id: 10 }]);
ok(r.ok === true && storage.getDeals()[0].id === 10, 'A10 successful re-hydrate re-arms saves');

console.log('— §B pipeline.js saveDeal — all seven statuses (real module) —');

const fakeLtr = { verdict: 'Dig Deeper & Negotiate', cls: 'warm', dscr: 1.5, coc: 10, cashFlowMo: 100 };
const nameEl = el('ltr-deal-name'), notesEl = el('ltr-notes');

// B1 refused-auth (no RPC)
rpcCalls = []; toasts = [];
globalThis.__authState.signedIn = false;
r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-auth', 'B1 signed-out -> refused-auth');
ok(rpcCalls.length === 0, 'B1 no RPC');

// B2 refused-name
globalThis.__authState.signedIn = true;
nameEl.value = '   ';
r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-name', 'B2 blank name -> refused-name');

// B3 refused-result
nameEl.value = 'Test Deal'; notesEl.value = '';
globalThis.__lastResults.ltr = null;
r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-result', 'B3 no analyzed result -> refused-result');

// B4 — RE-PINNED in the Wave 5 commit (same-commit law): capacity is now a
// UNIFORM allowance (storage.PIPELINE_ALLOWANCE, every tier — §18-1: capacity
// is not a tier differentiator). The old pin proved starter refused at 2 while
// paid tiers were unlimited; the new pins prove BOTH halves of the new law:
// a starter under the allowance saves freely, and EVERY tier is refused at the
// allowance — including pro, which the old law exempted.
okRpc();
await storage.saveDeals([{ id: 8, name: 'a', type: 'ltr', verdict: 'x', cls: 'warm', data: {}, stats: [], date: '', notes: '' },
                         { id: 9, name: 'b', type: 'ltr', verdict: 'x', cls: 'warm', data: {}, stats: [], date: '', notes: '' }]);
globalThis.__tier = 'starter';
globalThis.__lastResults.ltr = fakeLtr;
r = await pipeline.saveDeal('ltr');
ok(r.status === 'saved', 'B4a starter under the uniform allowance -> saved (old 2-deal starter cap gone)');
{ // Fill to the allowance and prove the refusal is tier-blind (pro refused too).
  const filler = [];
  for (let i = 0; i < storage.PIPELINE_ALLOWANCE; i++) {
    filler.push({ id: 100 + i, name: 'f' + i, type: 'ltr', verdict: 'x', cls: 'warm', data: {}, stats: [], date: '', notes: '' });
  }
  await storage.saveDeals(filler);
}
globalThis.__tier = 'pro';
r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-cap', 'B4b at the allowance every tier is refused — pro included');
globalThis.__tier = 'starter';
r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-cap', 'B4c starter refused at the same uniform bound');
// Restore the 2-deal cache the B5 sequence depends on.
await storage.saveDeals([{ id: 8, name: 'a', type: 'ltr', verdict: 'x', cls: 'warm', data: {}, stats: [], date: '', notes: '' },
                         { id: 9, name: 'b', type: 'ltr', verdict: 'x', cls: 'warm', data: {}, stats: [], date: '', notes: '' }]);

// B5 saved — toast + commit only AFTER resolution (gates 1-2)
globalThis.__tier = 'pro'; toasts = [];
d = deferRpc();
p = pipeline.saveDeal('ltr');
await tick();
ok(!toasts.includes('Deal saved to pipeline'), 'B5 no success toast before RPC resolves');
ok(storage.getDeals().length === 2, 'B5 cache unchanged before RPC resolves');
d.resolve();
r = await p;
ok(r.status === 'saved', 'B5 -> saved');
ok(toasts.includes('Deal saved to pipeline'), 'B5 success toast after confirmed write');
ok(storage.getDeals().length === 3 && storage.getDeals()[0].name === 'Test Deal', 'B5 cache committed after write');

// B6 refused-busy (lock held by a storage-level mutation)
toasts = [];
d = deferRpc();
p = storage.saveDeals(storage.getDeals());
await tick();
r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-busy', 'B6 concurrent -> refused-busy');
ok(toasts.includes('Another pipeline update is in progress.'), 'B6 generic busy feedback');
d.resolve(); await p;

// B7 save-failed, both classes
d = deferRpc(); p = pipeline.saveDeal('ltr'); await tick();
d.resolve({ data: null, error: { message: 'x', status: 401 } });
r = await p;
ok(r.status === 'save-failed' && r.failureClass === 'auth', 'B7 401 -> save-failed/auth');
globalThis.__rpc = async () => { throw new Error('conn'); };
r = await pipeline.saveDeal('ltr');
ok(r.status === 'save-failed' && r.failureClass === 'other', 'B7 network throw -> save-failed/other');
okRpc();

console.log('— §C pipeline.js confirmDelete — all four statuses (real module) —');

const ev = { stopPropagation() {} };
const existingId = storage.getDeals()[1].id;   // {id:8} seeded row

// C1 refused-auth (entry gate)
globalThis.__authState.signedIn = false;
r = await pipeline.confirmDelete();
ok(r.status === 'refused-auth', 'C1 signed-out confirmDelete -> refused-auth');
globalThis.__authState.signedIn = true;

// C2 stale/duplicate invocation (no pending delete) -> refused-busy, silent
r = await pipeline.confirmDelete();
ok(r.status === 'refused-busy', 'C2 no-pending duplicate -> refused-busy');

// C3 delete-failed other — row retained
const before = storage.getDeals().length;
pipeline.requestDelete(existingId, ev);
globalThis.__rpc = async () => ({ data: null, error: { message: 'boom' } });
r = await pipeline.confirmDelete();
ok(r.status === 'delete-failed' && r.failureClass === 'other', 'C3 RPC error -> delete-failed/other');
ok(storage.getDeals().length === before, 'C3 row retained on failure');

// C4 delete-failed auth
pipeline.requestDelete(existingId, ev);
globalThis.__rpc = async () => ({ data: null, error: { message: 'x', status: 403 } });
r = await pipeline.confirmDelete();
ok(r.status === 'delete-failed' && r.failureClass === 'auth', 'C4 403 -> delete-failed/auth');
ok(storage.getDeals().length === before, 'C4 row retained on auth failure');

// C5 refused-busy with retained pending id, then successful retry
okRpc();
pipeline.requestDelete(existingId, ev);
d = deferRpc();
p = storage.saveDeals(storage.getDeals());   // hold the lock
await tick();
r = await pipeline.confirmDelete();
ok(r.status === 'refused-busy', 'C5 lock held -> refused-busy');
ok(storage.getDeals().length === before, 'C5 row retained while busy');
d.resolve(); await p;
okRpc();
r = await pipeline.confirmDelete();          // pending id retained -> retry works
ok(r.status === 'deleted', 'C5 retry after lock clears -> deleted');
ok(storage.getDeals().every(x => x.id !== existingId), 'C5 row gone after confirmed delete');
ok(el('pipeline-list').innerHTML.length > 0, 'C5 pipeline re-rendered after success');

console.log('— §D main.js — auth chip + button mappers (real module) —');

globalThis.__authState = { signedIn: false, email: 'user@example.com' };
await import(JS + 'main.js');
await tick();  // let the initAuthAndEntitlement().then readiness chain run

ok(typeof globalThis.authChipUI === 'function' && typeof globalThis.saveButtonUI === 'function'
   && typeof globalThis.handleAuthChipClick === 'function', 'D0 mappers + handler exposed');

// D1 init state
for (const signedIn of [false, true]) {
  const ui = globalThis.authChipUI(false, signedIn);
  ok(ui.label === '…' && ui.action === null, `D1 init (signedIn=${signedIn}) -> neutral, no action`);
}
// D2 resolved states
let ui = globalThis.authChipUI(true, false);
ok(ui.label === 'Sign in' && ui.action === 'signin', 'D2 signed-out -> Sign in / signin');
ui = globalThis.authChipUI(true, true);
ok(ui.label === 'Signed in' && ui.action === 'account', 'D2 signed-in -> Signed in / account');
// D3 no email leak in any persistent-state output
for (const [rdy, sin] of [[false, false], [false, true], [true, false], [true, true]]) {
  const u = globalThis.authChipUI(rdy, sin);
  ok(!String(u.label).includes('@') && !String(u.aria).includes('@'), `D3 no email in chip output (${rdy},${sin})`);
}
// D4 opener action per resolved state (executable: distinct modal titles).
// Tier must be starter — configureUpgradeModal overwrites the headline on pro.
globalThis.__tier = 'starter';
const modal = el('modal-upgrade'), title = el('upgrade-modal-title');
globalThis.handleAuthChipClick();   // signed-out (ready flipped by boot chain)
ok(modal.classList.contains('active'), 'D4 signed-out click opens modal');
// RE-PINNED in the D-1 P1-B commit (same-commit law — reasoning, not deletion).
//
// This read "Never lose a deal you've already found" — the paid 'save' upsell
// headline — and it passed because it pinned the DEFECT. A signed-out visitor
// tapping "Sign in" was shown a paid pitch, with the free email field and Send
// code sitting below both Subscribe buttons. D-1 confirmed that live. The
// chip's ROUTING is unchanged (same shared modal, same 'save' trigger); what
// changed is what a signed-out visitor is shown once it opens. The assertion's
// actual intent — the two resolved states yield DISTINCT, state-truthful views
// — is preserved, and strengthened by the second pin.
ok(title.textContent === 'Sign in or create a free account', 'D4 signed-out -> free-account view');
ok(!/never lose a deal|4 markets/i.test(title.textContent),
   'D4 signed-out is never headlined by a paid upsell (D-1 P1-B)');
modal.classList.remove('active');
globalThis.__authState.signedIn = true;
globalThis.handleAuthChipClick();
ok(modal.classList.contains('active'), 'D4 signed-in click opens modal');
ok(title.textContent === 'Upgrade Your Plan', 'D4 signed-in -> account view (general trigger)');
ok(title.textContent !== 'Sign in or create a free account',
   'D4 the two resolved states remain distinct (original D4 intent)');
// D5 saveButtonUI: success reachable ONLY from 'saved'
const statuses = ['refused-auth', 'refused-name', 'refused-result', 'refused-cap', 'refused-busy', 'save-failed', undefined];
ok(globalThis.saveButtonUI('saved').saved === true && globalThis.saveButtonUI('saved').label === 'Saved ✓', 'D5 saved -> Saved ✓');
for (const s of statuses) {
  const u = globalThis.saveButtonUI(s);
  ok(u.saved === false && u.label === null, `D5 ${s} -> no success state`);
}

console.log('— §E markup / copy (gate 10) —');

const html = readFileSync(join(ROOT, 'docs', 'index.html'), 'utf8');
const utilBar = html.slice(html.indexOf('util-bar'), html.indexOf('PAGE'));
ok(utilBar.includes('id="auth-chip"'), 'E1 auth chip lives in util-bar');
ok(/<button[^>]*id="auth-chip"/.test(html), 'E2 chip is a <button> (keyboard-operable)');
ok(/id="auth-chip"[^>]*aria-label=/.test(html) || /aria-label=[^>]*id="auth-chip"/.test(html), 'E3 chip has an accessible name');
ok(!/id="auth-chip"[^>]*@/.test(html), 'E4 no email in persistent chip markup');
ok(html.includes('When signed in, saved pipeline deals are stored with your account.'), 'E5 D4 replacement sentence present');
// stale sentence absent across the DEPLOYED app (docs/, recursive). The repo-root
// legacy deal-screener-v3.html copy is outside the A1 allowlist — reported to CC.
const stale = 'all data stays on this device';
let staleHits = 0;
(function scan(dir) {
  for (const f of readdirSync(dir)) {
    const fp = join(dir, f);
    if (statSync(fp).isDirectory()) { scan(fp); continue; }
    if (/\.(html|js|css|json|md|txt)$/i.test(f) && readFileSync(fp, 'utf8').includes(stale)) staleHits++;
  }
})(join(ROOT, 'docs'));
ok(staleHits === 0, 'E6 stale device-only sentence absent across docs/');

console.log('— §F static supplements (gates 1–3) —');

const storageSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'storage.js'), 'utf8');
const pipelineSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'pipeline.js'), 'utf8');
const mainSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
ok(!storageSrc.includes('pushPipeline') && !pipelineSrc.includes('pushPipeline') && !mainSrc.includes('pushPipeline'), 'F1 pushPipeline eliminated');
ok(storageSrc.includes('finally'), 'F2 storage lock released in finally');
const sdCalls = [...pipelineSrc.matchAll(/(?<![.\w])saveDeals\(/g)].length;
const sdAwaited = [...pipelineSrc.matchAll(/await saveDeals\(/g)].length;
ok(sdCalls >= 2 && sdCalls === sdAwaited, `F3 every production saveDeals call awaited (${sdAwaited}/${sdCalls})`);
ok(!/textContent\s*=\s*'Saved ✓'/.test(mainSrc), 'F4 no direct unconditional Saved ✓ assignment in main.js');
ok(/btn\.classList\.toggle\('saved', ui\.saved\)/.test(mainSrc), 'F5 saved class driven by the pure mapping only');

console.log(`\nwave-a1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
