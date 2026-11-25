// Commercial C2 — finish the task that needed sign-in (C2-1/C2-3) and keep the plan out of funding
// requests (C2-6). Local wave, Aaron "COMMERCIAL C2, RELEASE PREPARATION & NATIVE CONTINUATION".
//
// §R  resumeIntent.js pure law (lifetimes, single use, the decision table, plan memory).
// §J  the whole journey with SYNTHETIC accounts: the REAL pipeline.js + storage.js against a fake
//     per-account server, and the REAL main.js resume/plan/close/checkout functions in a sandbox.
// §S  source pins (where each hook sits; what it must never do).
// §H  C2-6: the funding handoff carries no plan.
//
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/commercialc2.test.mjs
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const fails = [];
const ok = (v, label) => { if (v) pass++; else { fail++; fails.push(label); } };
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const JS = new URL('../docs/src/js/', import.meta.url).href;
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── Module-boundary stubs (test-local; same shape as wave-a1, plus a per-account uid) ──
globalThis.__authState = { signedIn: false, email: '' };
globalThis.__uid = '';
globalThis.__lastResults = { flip: null, rental: null, ltr: null, brrr: null };
globalThis.__tier = 'starter';
const server = {};            // synthetic accounts: uid -> saved deals (what get_pipeline / save_pipeline see)
// Postgres jsonb does not keep object key order: it returns keys shortest first, then by bytes (review R4-P1).
const jsonb = (v) => JSON.parse(JSON.stringify(v), (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
  ? Object.fromEntries(Object.keys(x).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map((q) => [q, x[q]])) : x);
let rpcLog = [];
let rpcFail = null;           // 'get' | 'save' | null
globalThis.__supabaseStub = {
  rpc: async (name, args) => {
    const uid = globalThis.__uid;
    rpcLog.push({ name, uid });
    if (name === 'get_pipeline') {
      if (rpcFail === 'get') return { data: null, error: { message: 'unreachable' }, status: 503 };
      return { data: jsonb(server[uid] || []), error: null, status: 200 };   // fresh objects in jsonb key order, as from the real server (R2-N3, R4-P1)
    }
    if (name === 'save_pipeline') {
      if (rpcFail === 'save') return { data: null, error: { message: 'server error' }, status: 500 };
      server[uid] = jsonb(args.p_deals);
      return { data: null, error: null, status: 200 };
    }
    return { data: null, error: null, status: 200 };
  },
};
const STUBS = {
  'supabaseClient.js': `export const supabase = globalThis.__supabaseStub;`,
  'auth.js': `export const entitlementStatus = () => 'verified';
    export const isSignedIn = () => globalThis.__authState.signedIn; export const getUserId = () => globalThis.__uid;
    export const getUserEmail = () => globalThis.__authState.email;
    export const onAuthChange = () => {}; export const initAuthAndEntitlement = async () => {};
    export const sendOtpCode = async () => ({ ok: true, msg: '' }); export const verifyOtpCode = async () => ({ ok: true, msg: '' });
    export const signOutAccount = async () => {}; export const redeemServerCode = async () => ({ ok: false, msg: '' });
    export const syncEntitlement = async () => 'starter';`,
  'flip.js': `export const getLastFlipResult = () => globalThis.__lastResults.flip;
    export const analyzeFlip=()=>{},setFlipPreset=()=>{},resetFlip=()=>{},getFlipMarket=()=>({}),clearLastFlipResult=()=>{},refreshFlipSummaries=()=>{},openFlipDetails=()=>{};`,
  'rental.js': `export const getLastRentalResult = () => globalThis.__lastResults.rental;
    export const analyzeRental=()=>{},setRentalPreset=()=>{},resetRental=()=>{},clearLastRentalResult=()=>{};`,
  'ltr.js': `export const getLastLtrResult = () => globalThis.__lastResults.ltr;
    export const analyzeLtr=()=>{},setLtrPreset=()=>{},resetLtr=()=>{},getLtrMarket=()=>({}),clearLastLtrResult=()=>{};`,
  'brrr.js': `export const getLastBrrrResult = () => globalThis.__lastResults.brrr;
    export const analyzeBrrr=()=>{},setBrrrPreset=()=>{},resetBrrr=()=>{},clearLastBrrrResult=()=>{};`,
  'clearpath.js': `export const getPipelineFundingButtonHTML = () => '';
    export const maybeShowFundingButton=()=>{},handlePipelineFundingClick=()=>{},parseCityState=()=>({}),addressHandoff=()=>({});`,
  'tiers.js': `export const getActiveTier = () => globalThis.__tier;
    export const getActiveMarketId=()=>'',getMarketLabel=(x)=>x,isMarketUnlocked=()=>true,getMarketForSlot=()=>'';`,
  'repair.js': `export const repairEstimateSnapshotFor=()=>null,repairEstimateSnapshot=()=>null;`,
  'markets.js': `export const ALL_MARKETS=[],STR_MARKETS={},FLIP_MARKETS={},LTR_MARKETS={};`,
};
registerHooks({
  resolve(spec, ctx, next) {
    const base = spec.split('/').pop();
    if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true };
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
    if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true };
    return next(url, ctx);
  },
});

// ── Minimal DOM ──
const elements = new Map();
function makeEl(id) {
  const s = new Set();
  return { id, value: '', textContent: '', innerHTML: '', style: {}, disabled: false, dataset: {}, attrs: {},
    classList: { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => (f ? s.add(c) : s.delete(c)) },
    setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, getAttribute(n) { return this.attrs[n]; },
    addEventListener() {}, removeEventListener() {}, focus() {}, closest() { return null; }, appendChild() {}, querySelector() { return null; } };
}
const el = (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
globalThis.document = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, createElement: (t) => makeEl('_' + t), body: makeEl('body') };
globalThis.window = globalThis;
if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
let alerts = 0; globalThis.alert = () => { alerts++; };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let toasts = [];
globalThis.showToast = (m) => toasts.push(m);
let pipelineOpenUpgrade = [];
globalThis.openUpgrade = (t) => pipelineOpenUpgrade.push(t);

const RI = await import(JS + 'resumeIntent.js');
const storage = await import(JS + 'storage.js');
const pipeline = await import(JS + 'pipeline.js');
// Native-readiness integration (product/native-on-c2): startCheckout now begins with the app-only guard and
// redirects through platform.js. The sandbox gets the REAL web answer of that seam (no Capacitor here, so
// paymentsInApp() is true); appPayment must never run on the web, so reaching it fails the journey.
const platform = await import(JS + 'platform.js');

// ═══ §R pure law ═══════════════════════════════════════════════════════════════
console.log('— §R resumeIntent law —');
{
  let t = 1_000_000;
  const clock = () => t;
  const si = RI.createSaveIntent(clock);
  ok(si.note('ltr', null) === null && si.peek() === null, 'R1 a Save tapped before any analysis notes nothing (nothing to finish)');
  const R = { verdict: 'x' };
  const n = si.note('ltr', R);
  ok(n && n.type === 'ltr' && n.result === R && n.dealId === t && si.peek() === n, 'R2 the intent holds the type, the analysis by identity and a fixed deal id');
  ok(Object.keys(n).sort().join() === 'at,dealId,result,type', 'R3 no form text, email or account is held — only type, result reference, time and id');
  t += RI.RESUME_TTL_MS - 1; ok(si.peek() === n, 'R4 still pending one ms before 15 minutes');
  t += 1; ok(si.peek() === null, 'R5 expired at 15 minutes (the sign-in code lifetime)');
  si.note('ltr', R); ok(si.take() && si.take() === null && si.peek() === null, 'R6 single use: take() empties it');
  si.note('ltr', R); si.cancel(); ok(si.peek() === null, 'R7 cancel() empties it');
  t = 5; si.note('ltr', R); t = 4; ok(si.peek() === null, 'R8 a clock that ran backwards expires the intent (never trusted as fresh)');

  const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  t = 2_000_000;
  const pi = RI.createPlanIntent(store, clock);
  ok(pi.note('enterprise') === null && pi.peek() === null && !(RI.PLAN_KEY in mem), 'R9 only investor/pro are remembered');
  pi.note('investor');
  ok(pi.peek()?.tier === 'investor' && JSON.parse(mem[RI.PLAN_KEY]).tier === 'investor'
     && Object.keys(JSON.parse(mem[RI.PLAN_KEY])).sort().join() === 'at,tier', 'R10 the plan is stored as {tier, at} only — no account, price or card data');
  t += RI.RESUME_TTL_MS; ok(pi.peek() === null && !(RI.PLAN_KEY in mem), 'R11 a remembered plan expires at 15 minutes and is removed');
  mem[RI.PLAN_KEY] = '{not json'; ok(pi.peek() === null && !(RI.PLAN_KEY in mem), 'R12 a corrupted value is dropped, never parsed into a plan');
  mem[RI.PLAN_KEY] = JSON.stringify({ tier: 'pro', at: t, price: 0 }); ok(pi.peek()?.tier === 'pro' && Object.keys(pi.peek()).join() === 'tier', 'R13 peek returns the tier alone');
  pi.cancel(); ok(!(RI.PLAN_KEY in mem), 'R14 cancel removes it');
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const pt = RI.createPlanIntent(throwing, clock);
  let threw = false; try { pt.note('pro'); pt.peek(); pt.cancel(); } catch { threw = true; }
  ok(!threw && pt.peek() === null, 'R15 blocked storage never throws (the plan is simply not remembered)');

  const D = (o) => RI.saveResumeDecision({ type: 'ltr', result: R, dealId: 77 }, { signedIn: true, loadState: 'ok', uid: 'u', armedUid: 'u', currentResult: R, owner: '', reviewing: false, deals: [], allowance: 25, ...o });
  ok(RI.saveResumeDecision(null, {}).action === 'none', 'R16 no intent → nothing');
  ok(D({ signedIn: false }).action === 'wait', 'R17 not signed in → wait');
  ok(D({ loadState: 'loading' }).action === 'wait' && D({ loadState: 'idle' }).action === 'wait', 'R18 the account\'s pipeline has not loaded → wait (never build a save on an unconfirmed pipeline)');
  ok(D({ loadState: 'failed' }).action === 'wait' && D({ loadState: 'failed' }).reason === 'unreachable', 'R19 load failed → wait, flagged unreachable');
  ok(D({ owner: 'u-x' }).reason === 'owned', 'R20 the form holds an account\'s saved deal → drop');
  ok(D({ reviewing: true }).reason === 'review', 'R21 a saved deal is under review → drop (never an overwrite)');
  ok(D({ currentResult: { verdict: 'x' } }).reason === 'changed', 'R22 a different analysis object (even with equal fields) → drop');
  ok(D({ deals: [{ id: 77, data: JSON.parse(JSON.stringify(R)) }] }).reason === 'already-saved' && D({ deals: [{ id: 77 }] }).action === 'save', 'R23 the fixed id holding this analysis (a server copy) → drop; the same id on another deal is not a repeat');
  ok(D({ deals: Array.from({ length: 25 }, (_, i) => ({ id: i })) }).reason === 'full', 'R24 pipeline at the uniform allowance → drop');
  ok(D({}).action === 'save', 'R25 otherwise → save');
  ok(Object.values(RI.RESUME_DROP_MSG).concat(RI.RESUME_WAIT_MSG, RI.RESUME_SAVED_MSG).every((m) => !/upgrade|plan|subscribe|unlimited|\$|investor|pro\b/i.test(m)),
     'R26 no resume message pitches a plan');
}

// ═══ §J journey with synthetic accounts ═══════════════════════════════════════
console.log('— §J journey (synthetic accounts) —');
const mj = rd('docs/src/js/main.js');
const fnBody = (name) => {
  for (const pre of ['\nfunction ', '\nasync function ', '\nexport function ']) {
    const i = mj.indexOf(pre + name + '(');
    if (i >= 0) { const j = mj.indexOf('\n}\n', i + 1); return mj.slice(i + 1, j + 2).replace(/^export /, ''); }
  }
  throw new Error('missing ' + name);
};
const stateBlock = (mj.match(/\nconst planIntent = createPlanIntent[^\n]*\nconst PLAN_NAME[^\n]*\nlet _resumeArmed[^\n]*\n/) || [''])[0];
ok(!!stateBlock, 'J0 main.js declares the C2 state (plan memory, plan names, resume flags) in one block');
const PAID_LEAD = (mj.match(/const PAID_PLANS_LEAD\s*=\s*\n?\s*('[^']*');/) || [])[1] || "''";
// Review R1-F4: the REAL Save-button wrapper (stale-result law, button state) is in the sandbox too, so a
// resume and the person's own tap run exactly the production path.
const NAMES = ['closeModal', 'cancelResume', 'cancelResumeAndPlan', 'armResumeAfterSignIn', 'resumeAfterSignIn', 'continuePlanCheckout',
               'renderPlanContinue', 'refreshSheetAfterSignIn', 'upgradeModalLayout', 'configureUpgradeModal', 'startCheckout',
               'saveButtonUI', 'saveDeal'];
const sandboxSrc = 'let _lastUpgradeTrigger = "general"; let _openModalCount = 1; let _scrollLockY = 0; const PAID_PLANS_LEAD = ' + PAID_LEAD + ';\n'
  + stateBlock + NAMES.map(fnBody).join('\n')
  + '\nreturn { closeModal, armResumeAfterSignIn, resumeAfterSignIn, continuePlanCheckout, configureUpgradeModal, startCheckout, planIntent, saveDeal,'
  + ' armed: () => _resumeArmed };';

const sess = {}; const sessionStore = { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); }, removeItem: (k) => { delete sess[k]; } };
const analyzerOwner = { flip: '', rental: '', ltr: '', brrr: '' };
const log = [];            // ordered events: save rpc, offers, checkouts
let checkoutInvokes = [];
const holder = {};
const env = {
  window: { sessionStorage: sessionStore, scrollTo() {} },
  document: globalThis.document,
  isSignedIn: () => globalThis.__authState.signedIn,
  getActiveTier: () => globalThis.__tier,
  createPlanIntent: RI.createPlanIntent, pendingSave: RI.pendingSave, saveResumeDecision: RI.saveResumeDecision,
  RESUME_DROP_MSG: RI.RESUME_DROP_MSG, RESUME_WAIT_MSG: RI.RESUME_WAIT_MSG,
  pipelineLoadState: storage.pipelineLoadState, getDeals: storage.getDeals, PIPELINE_ALLOWANCE: storage.PIPELINE_ALLOWANCE,
  currentResultFor: pipeline.currentResultFor, getReviewingDealId: pipeline.getReviewingDealId, analyzerOwner,
  _saveDeal: async (t, o) => { const r = await pipeline.saveDeal(t, o); log.push('save:' + r.status); return r; },
  isStale: () => false, exitReviewUI: () => {}, releaseReviewProtection: () => {}, reviewPendingFor: () => false,
  getUserId: () => globalThis.__uid, entitlementStatus: () => (globalThis.__entitlementStatus || 'verified'),
  showToast: (m) => toasts.push(m),
  openUpgrade: (t) => { log.push('offer:' + t); holder.api.configureUpgradeModal(t); el('modal-upgrade').classList.add('active'); },
  resetStaleCodeStep: () => {}, applyAccountPriority: () => {},
  sheetClosed: () => {}, recordSheetClose: () => {},
  supabase: { functions: { invoke: async (name, body) => { checkoutInvokes.push({ name, body }); log.push('checkout:' + body.body.tier); return { data: { url: 'https://checkout.stripe.test/x' }, error: null }; } } },
  logFunctionsFailure: () => {}, location: { href: '' },
  paymentsInApp: platform.paymentsInApp, NATIVE_PAYMENT_MESSAGE: platform.NATIVE_PAYMENT_MESSAGE,
  appPayment: async () => { throw new Error('appPayment reached on the web'); },
  openPaymentPage: (url) => { env.location.href = url; return true; },   // platform.openPaymentPage's web branch, on the sandbox location
};
const api = holder.api = new Function(...Object.keys(env), sandboxSrc)(...Object.values(env));
pipeline.onPipelineReloaded(api.resumeAfterSignIn);   // as main.js does (pinned in §S)

const name = el('ltr-deal-name'), notes = el('ltr-notes');
const reset = () => { toasts = []; log.length = 0; rpcLog = []; rpcFail = null; checkoutInvokes = []; pipelineOpenUpgrade = []; };
const signOut = () => { globalThis.__authState.signedIn = false; globalThis.__uid = ''; storage.clearPipelineCache(); };
const signInAs = (uid) => { globalThis.__authState.signedIn = true; globalThis.__uid = uid; storage.dropForeignPipeline(); };
const openSheet = () => el('modal-upgrade').classList.add('active');
const sheetOpen = () => el('modal-upgrade').classList.contains('active');
const same = (d, R) => !!d && RI.sameAnalysis(d.data, R);
const deal = (i, extra) => ({ id: 1000 + i, name: 'existing ' + i, type: 'ltr', verdict: 'v', cls: 'warm', data: {}, stats: [], date: '', notes: '', ...extra });

server['u-a'] = [deal(1), deal(2)];
server['u-b'] = [];
server['u-full'] = Array.from({ length: 25 }, (_, i) => deal(10 + i));
server['u-c'] = [deal(50, { name: 'C private deal', notes: 'C-only notes' })];

// J1–J5: the happy path for account A
reset(); signOut();
const R1 = { n: 1, verdict: 'Pass', cls: 'good', type: 'ltr' };
globalThis.__lastResults.ltr = R1; name.value = 'Elm St duplex'; notes.value = 'typed signed out';
let r = await pipeline.saveDeal('ltr');
ok(r.status === 'refused-auth' && pipelineOpenUpgrade[0] === 'save' && RI.pendingSave.peek()?.result === R1, 'J1 signed out: Save opens sign-in and remembers this analysis');
openSheet();
signInAs('u-a');                          // verify succeeded; this account's pipeline is not loaded yet
api.armResumeAfterSignIn();
await tick();
ok(!sheetOpen() && api.armed() && RI.pendingSave.peek()?.result === R1 && !rpcLog.some((x) => x.name === 'save_pipeline'),
   'J2 sign-in closes the sheet back to the analysis; nothing is saved before the account\'s own pipeline loads');
ok(!log.some((e) => e.startsWith('offer')), 'J3 no plan pitch appears at sign-in');
await storage.hydratePipeline(); await api.resumeAfterSignIn(); await tick();
const a = server['u-a'];
ok(a.length === 3 && same(a[0], R1) && a[0].name === 'Elm St duplex' && a[0].notes === 'typed signed out'
   && a.slice(1).map((d) => d.id).join() === '1001,1002', 'J4 after the load, the deal is saved ONCE into A, first, with A\'s own deals intact');
ok(toasts.includes(RI.RESUME_SAVED_MSG) && !api.armed() && RI.pendingSave.peek() === null, 'J5 the save is confirmed ("deal saved to your pipeline") and the intent is spent');
const savedId = a[0].id;
reset(); await api.resumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(!rpcLog.some((x) => x.name === 'save_pipeline') && server['u-a'].length === 3, 'J6 later loads (reconnect, another tab) never save it again');
r = await pipeline.saveDeal('ltr', { resume: { type: 'ltr', result: R1, dealId: savedId } });
ok(r.status === 'saved' && r.mode === 'already' && !rpcLog.some((x) => x.name === 'save_pipeline') && server['u-a'].length === 3,
   'J7 a retried resume for an id already saved is a no-op (no duplicate)');

// J8: identity — B signs in on the same device; A's deals never reach B, B's save never touches A
reset(); signOut(); signInAs('u-b'); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(!rpcLog.some((x) => x.name === 'save_pipeline') && server['u-b'].length === 0 && storage.getDeals().length === 0 && server['u-a'].length === 3,
   'J8 a different account signing in later receives nothing (no intent carries over; A\'s pipeline is never shown or copied)');

// J9: the analysis changed before sign-in finished → dropped, nothing written
reset(); signOut();
const R2 = { n: 2, verdict: 'Pass', type: 'ltr' };
globalThis.__lastResults.ltr = R2; await pipeline.saveDeal('ltr');
globalThis.__lastResults.ltr = { verdict: 'Fail', type: 'ltr' };   // re-analyzed with other numbers
openSheet(); signInAs('u-b'); api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-b'].length === 0 && toasts.includes(RI.RESUME_DROP_MSG.changed) && RI.pendingSave.peek() === null,
   'J9 the analysis changed while signing in → nothing saved; "tap Save to save the one on screen"');

// J10: capacity
reset(); signOut(); globalThis.__lastResults.ltr = R2; await pipeline.saveDeal('ltr');
openSheet(); signInAs('u-full'); api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-full'].length === 25 && toasts.includes(RI.RESUME_DROP_MSG.full) && !rpcLog.some((x) => x.name === 'save_pipeline'),
   'J10 a full pipeline: nothing is replaced or dropped; the person is told to make room');

// J11: the pipeline cannot load yet → wait (told once), then save when it does
reset(); signOut(); globalThis.__lastResults.ltr = R2; await pipeline.saveDeal('ltr');
openSheet(); signInAs('u-b'); rpcFail = 'get';
api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(toasts.filter((m) => m === RI.RESUME_WAIT_MSG).length === 1 && !rpcLog.some((x) => x.name === 'save_pipeline') && RI.pendingSave.peek(),
   'J11 the pipeline is unreachable: nothing is written, the person is told once, the intent waits');
rpcFail = null; await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-b'].length === 1 && same(server['u-b'][0], R2), 'J12 …and it saves once the pipeline loads');

// J13: the save itself fails → spent, no automatic retry, no duplicate; a manual Save still works
reset(); signOut(); const R3 = { n: 3, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R3; await pipeline.saveDeal('ltr');
openSheet(); signInAs('u-b'); await storage.hydratePipeline(); rpcFail = 'save'; api.armResumeAfterSignIn(); await tick(); await tick();
await tick(); await tick(); await tick();   // the real Save wrapper adds awaits before the RPC settles
ok(server['u-b'].length === 1 && rpcLog.filter((x) => x.name === 'save_pipeline').length === 1 && RI.pendingSave.peek() === null && !api.armed(),
   'J13 a failed save is tried once (spent, no retry loop) and leaves the server unchanged');
rpcFail = null; await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-b'].length === 1, 'J14 …and a later load does not resurrect it');
r = await pipeline.saveDeal('ltr'); ok(r.status === 'saved' && server['u-b'].length === 2, 'J15 the person\'s own Save tap still saves normally');

// J16: cancellation — closing the sign-in sheet signed out abandons both intents
reset(); signOut(); globalThis.__lastResults.ltr = R3; await pipeline.saveDeal('ltr');
await api.startCheckout('pro');
openSheet(); api.closeModal('modal-upgrade');
ok(RI.pendingSave.peek() === null && api.planIntent.peek() === null, 'J16 closing the sign-in sheet cancels the pending save and the remembered plan');
signInAs('u-b'); api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-b'].length === 2, 'J17 …so a later sign-in saves nothing');

// J18: failed authentication — a wrong code never arms; the intent survives for the correct one
reset(); signOut(); globalThis.__lastResults.ltr = R3; await pipeline.saveDeal('ltr'); openSheet();
await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(RI.pendingSave.peek() && sheetOpen() && !api.armed(), 'J18 still signed out (a wrong or expired code): the intent waits, the sheet stays, nothing saved');
// J19: another tab signs in (no arm in THIS tab): never saves on its own
signInAs('u-c'); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-c'].length === 1 && !rpcLog.some((x) => x.name === 'save_pipeline'), 'J19 a sign-in that did not happen in this tab\'s sheet never finishes the save');
RI.pendingSave.cancel(); el('modal-upgrade').classList.remove('active');

// J20: a form holding an account's saved deal is never re-saved by the resume
reset(); signOut(); globalThis.__lastResults.ltr = R3; await pipeline.saveDeal('ltr'); analyzerOwner.ltr = 'u-c';
openSheet(); signInAs('u-c'); await storage.hydratePipeline(); api.armResumeAfterSignIn(); await tick();
ok(server['u-c'].length === 1 && toasts.includes(RI.RESUME_DROP_MSG.owned), 'J20 the form holds an account\'s saved deal → nothing written');
analyzerOwner.ltr = '';

// J21: under review, a resume never updates the reviewed deal
reset(); signInAs('u-c'); await storage.hydratePipeline(); pipeline.beginDealReview(1050);
r = await pipeline.saveDeal('ltr', { resume: { type: 'ltr', result: globalThis.__lastResults.ltr, dealId: 9 } });
ok(r.status === 'refused-review' && server['u-c'].length === 1 && server['u-c'][0].name === 'C private deal', 'J21 a resume during a review is refused (never an overwrite)');
pipeline.endDealReview();
r = await pipeline.saveDeal('ltr', { resume: { type: 'ltr', result: { other: true }, dealId: 9 } });
ok(r.status === 'refused-changed' && server['u-c'].length === 1, 'J22 the pipeline itself refuses a resume whose analysis is not the one on screen');

// ── Plan memory (C2-3) ──
console.log('— §J plan memory —');
reset(); signOut(); globalThis.__tier = 'starter';
await api.startCheckout('investor');
ok(checkoutInvokes.length === 0 && api.planIntent.peek()?.tier === 'investor', 'J23 Subscribe while signed out remembers the plan and starts no checkout');
openSheet(); signInAs('u-b'); api.armResumeAfterSignIn();
ok(el('upgrade-continue').style.display === '' && el('upgrade-continue-btn').textContent === 'Continue to Investor checkout'
   && /Continue to Investor checkout/.test(el('upgrade-modal-title').textContent)
   && /Nothing is charged until you confirm/.test(el('upgrade-subhead').textContent) && checkoutInvokes.length === 0,
   'J24 after sign-in the sheet offers "Continue to Investor checkout" — and still nothing is started or charged');
api.continuePlanCheckout(); await tick();
ok(checkoutInvokes.length === 1 && checkoutInvokes[0].body.body.tier === 'investor' && api.planIntent.peek() === null,
   'J25 only the explicit tap opens checkout, once, for the remembered plan; the memory is spent');
reset(); api.continuePlanCheckout(); await tick();
ok(checkoutInvokes.length === 0, 'J26 a second tap with nothing remembered starts nothing');

reset(); signOut(); await api.startCheckout('pro'); signInAs('u-a'); globalThis.__tier = 'investor'; openSheet(); api.armResumeAfterSignIn();
ok(api.planIntent.peek() === null && el('upgrade-continue').style.display === 'none' && checkoutInvokes.length === 0,
   'J27 an account that is already paid drops the remembered plan (no second subscription offered)');
globalThis.__tier = 'starter';
reset(); signOut(); await api.startCheckout('pro'); signInAs('u-b'); openSheet(); api.armResumeAfterSignIn(); api.closeModal('modal-upgrade');
ok(api.planIntent.peek() === null && checkoutInvokes.length === 0, 'J28 closing the signed-in offer declines it (nothing started, nothing remembered)');

// Save + plan: the offer comes only AFTER the save is confirmed
reset(); signOut(); const R4 = { n: 4, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R4;
await pipeline.saveDeal('ltr'); await api.startCheckout('pro'); openSheet();
signInAs('u-b'); api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn(); await tick();
const iSave = log.indexOf('save:saved'), iOffer = log.indexOf('offer:plan');
ok(iSave >= 0 && iOffer > iSave && !log.some((e) => e.startsWith('checkout')) && el('upgrade-continue-btn').textContent === 'Continue to Pro checkout',
   'J29 saving AND a chosen plan: the deal is saved first, then "Continue to Pro checkout" is offered — never started');
reset(); el('modal-upgrade').classList.remove('active'); api.planIntent.cancel();
signOut(); const R5 = { n: 5, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R5;
await pipeline.saveDeal('ltr'); await api.startCheckout('pro'); openSheet();
signInAs('u-full'); await storage.hydratePipeline(); api.armResumeAfterSignIn(); await tick();
ok(!log.includes('offer:plan') && api.planIntent.peek()?.tier === 'pro', 'J30 a save that did not happen is never followed by an offer');
api.planIntent.cancel();

// ── Review round 1 regressions ──
console.log('— §J review round 1 —');
// F1: a waiting resume + the person's own Save tap never makes two copies
reset(); signOut(); server['u-d'] = [];
const R6 = { n: 6, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R6;
await api.saveDeal('ltr');                                   // the real wrapper, signed out
openSheet(); signInAs('u-d'); rpcFail = 'get'; api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(api.armed() && toasts.includes(RI.RESUME_WAIT_MSG), 'J31 setup: signed in, pipeline unreachable, the save waits');
rpcFail = null;
await api.saveDeal('ltr');                                   // own tap: refused stale, the retry re-load starts
await tick(); await tick();
ok(!api.armed() && RI.pendingSave.peek() === null, 'J31 the person\'s own Save tap supersedes the waiting resume');
await api.saveDeal('ltr');
await storage.hydratePipeline(); await api.resumeAfterSignIn();   // later auth notifies (visibility, refresh, reconnect)
ok(server['u-d'].filter((d) => same(d, R6)).length === 1, 'J32 the analysis is in the pipeline exactly once (review R1-F1 repro)');
{ const d = RI.saveResumeDecision({ type: 'ltr', result: R6, dealId: 1 }, { signedIn: true, loadState: 'ok', uid: 'u', armedUid: 'u', currentResult: R6, owner: '', reviewing: false, deals: [{ id: 2, data: R6 }], allowance: 25 });
  ok(d.reason === 'already-saved', 'J33 the same analysis object already in this session\'s cache (any id) counts as already saved'); }

// F2: a retry's successful re-load (not an auth event) finishes a waiting save
reset(); signOut(); server['u-e'] = [];
const R7 = { n: 7, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R7; await api.saveDeal('ltr');
openSheet(); signInAs('u-e'); rpcFail = 'get'; api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
rpcFail = null;
{ let fired = 0; pipeline.onPipelineReloaded(() => { fired++; });
  globalThis.__lastResults.flip = { verdict: 'x', type: 'flip' };
  el('flip-deal-name').value = 'flip'; el('flip-notes').value = '';
  await api.saveDeal('flip');                                 // the person saves ANOTHER analyzer: stale → reloadPipeline()
  await tick(); await tick(); await tick();
  ok(fired >= 1, 'J34 a Save on another analyzer leaves the waiting save; its stale retry re-load notifies subscribers');
  ok(server['u-e'].filter((d) => same(d, R7)).length === 1 && !api.armed(), 'J35 …and the waiting save finishes on that load, without any auth event (review R1-F2)');
  globalThis.__lastResults.flip = null; }

// F3: armed for one account, another account appears (other tab / sign-out then in): nothing saved, nothing said
reset(); signOut(); server['u-f'] = []; server['u-g'] = [];
const R8 = { n: 8, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R8; await api.saveDeal('ltr');
openSheet(); signInAs('u-f'); rpcFail = 'get'; api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
rpcFail = null; toasts = [];
signInAs('u-g'); await storage.hydratePipeline(); await api.resumeAfterSignIn();
ok(server['u-g'].length === 0 && server['u-f'].length === 0 && !api.armed() && RI.pendingSave.peek() === null
   && !toasts.some((m) => /Signed in/.test(m)), 'J36 a resume armed for one account is dropped silently when another account is signed in (review R1-F3)');
ok(/if \(leftAccount\) cancelResumeAndPlan\(\);/.test(fnBody('hideForeignAccountData')), 'J37 an account switch also ends both intents at the identity boundary');

// F5: the plan offer needs a sign-in in this tab and a verified plan check
reset(); signOut(); await api.startCheckout('pro'); signInAs('u-b'); openSheet(); api.configureUpgradeModal('general');
ok(el('upgrade-continue').style.display === 'none', 'J38 a session not signed in from this tab (restored, other tab) is not offered the remembered plan');
globalThis.__entitlementStatus = 'unverified'; api.armResumeAfterSignIn(); api.configureUpgradeModal('general');
ok(el('upgrade-continue').style.display === 'none' && checkoutInvokes.length === 0, 'J39 an unverified plan check (could be a paid account) is never offered a purchase');
globalThis.__entitlementStatus = 'verified'; api.configureUpgradeModal('general');
ok(el('upgrade-continue').style.display === '', 'J40 …and is offered once the plan check verifies Starter');
api.closeModal('modal-upgrade');
ok(RI.RESUME_DROP_MSG.review === 'Signed in. Finish or cancel the review, then tap Save.', 'J41 the review message never points at overwriting the reviewed deal (review R1-F9)');

// ── Review round 2 regressions ──
console.log('— §J review round 2 —');
// N2: saving another analyzer while the LTR save waits — the LTR save still happens, the flip is the person's own
reset(); signOut(); server['u-h'] = [];
const R9 = { n: 9, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R9; await api.saveDeal('ltr');
openSheet(); signInAs('u-h'); rpcFail = 'get'; api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn();
rpcFail = null;
const F9 = { n: 90, verdict: 'x', type: 'flip' }; globalThis.__lastResults.flip = F9; el('flip-deal-name').value = 'my flip';
await api.saveDeal('flip'); await tick(); await tick(); await tick();
ok(api.armed() === false && server['u-h'].filter((d) => same(d, R9)).length === 1, 'J42 the waiting LTR save still finishes after the person saves a flip (review R2-N2)');
await api.saveDeal('flip');
ok(server['u-h'].filter((d) => same(d, F9)).length === 1 && server['u-h'].filter((d) => same(d, R9)).length === 1, 'J43 …each analysis exactly once');
globalThis.__lastResults.flip = null;
// N1: resume save with a remembered plan and an UNVERIFIED plan check → no sheet at all
reset(); signOut(); server['u-i'] = [];
const R10 = { n: 10, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R10;
await api.saveDeal('ltr'); await api.startCheckout('pro'); openSheet();
globalThis.__entitlementStatus = 'unverified';
signInAs('u-i'); api.armResumeAfterSignIn(); await storage.hydratePipeline(); await api.resumeAfterSignIn(); await tick();
ok(log.includes('save:saved') && !log.includes('offer:plan') && !sheetOpen() && api.planIntent.peek()?.tier === 'pro',
   'J44 saved; with the plan check unverified no sheet opens at all, and the remembered plan waits (review R2-N1)');
globalThis.__entitlementStatus = 'verified'; openSheet(); api.configureUpgradeModal('general');
ok(el('upgrade-continue').style.display === '' && checkoutInvokes.length === 0, 'J45 …once verified, an open sheet offers it (still only a tap starts checkout)');
api.closeModal('modal-upgrade');
// N4: an intent armed with no account id is never finished
{ const d = RI.saveResumeDecision({ type: 'ltr', result: R10, dealId: 3 }, { signedIn: true, loadState: 'ok', uid: 'u-x', armedUid: '', currentResult: R10, owner: '', reviewing: false, deals: [], allowance: 25 });
  ok(d.action === 'drop' && d.reason === 'account', 'J46 a resume with no recorded account is dropped, never saved to whoever is signed in (review R2-N4)'); }
// N3: after a re-load (fresh objects) a resume's fixed id still prevents a duplicate
reset(); signInAs('u-i'); await storage.hydratePipeline();
{ const saved = storage.getDeals().find((d) => same(d, R10));
  const d = RI.saveResumeDecision({ type: 'ltr', result: R10, dealId: saved ? saved.id : -1 }, { signedIn: true, loadState: 'ok', uid: 'u-i', armedUid: 'u-i', currentResult: R10, owner: '', reviewing: false, deals: storage.getDeals(), allowance: 25 });
  ok(!!saved && saved.data !== R10 && d.reason === 'already-saved', 'J47 after a re-load the cache holds server copies; the fixed id is what blocks a duplicate'); }

// ── Review round 3 regression (N8) ──
console.log('— §J review round 3 —');
{ let t = 5000; const si = RI.createSaveIntent(() => t);
  const a1 = si.note('ltr', { n: 'a' }), a2 = si.note('ltr', { n: 'b' });
  ok(a1.dealId === 5000 && a2.dealId === 5001, 'J48 two notes in one millisecond never share a fixed id');
  const other = { id: 7000, type: 'ltr', data: { n: 'unrelated' } };
  const mine = { n: 'mine' };
  const d = RI.saveResumeDecision({ type: 'ltr', result: mine, dealId: 7000 }, { signedIn: true, loadState: 'ok', uid: 'u', armedUid: 'u', currentResult: mine, owner: '', reviewing: false, deals: [other], allowance: 25 });
  ok(d.action === 'save', 'J49 an unrelated deal that happens to hold the same id is not "already saved"'); }
reset(); signOut(); server['u-j'] = [{ id: 424242, name: 'old', type: 'ltr', verdict: 'v', cls: 'warm', data: { n: 'old' }, stats: [], date: '', notes: '' }];
{ const R11 = { n: 11, verdict: 'Pass', type: 'ltr' }; globalThis.__lastResults.ltr = R11;
  signInAs('u-j'); await storage.hydratePipeline();
  const r = await pipeline.saveDeal('ltr', { resume: { type: 'ltr', result: R11, dealId: 424242 } });
  const ids = server['u-j'].map((d) => d.id);
  ok(r.status === 'saved' && server['u-j'].length === 2 && new Set(ids).size === 2 && server['u-j'].some((d) => same(d, R11)) && server['u-j'].some((d) => d.name === 'old'),
     'J50 …the resume saves under a fresh id: both deals kept, ids unique'); }

// ── Review round 4 regression (P1) ──
{ const A = { verdict: 'Pass', cls: 'good', stats: { cap: 7.1, dscr: 1.3 }, list: [{ b: 1, a: 2 }] };
  ok(RI.sameAnalysis(A, jsonb(A)) && JSON.stringify(A) !== JSON.stringify(jsonb(A)), 'J51 a server (jsonb-ordered) copy of an analysis is recognised as the same analysis');
  ok(!RI.sameAnalysis(A, { ...A, verdict: 'Fail' }) && !RI.sameAnalysis({ list: [1, 2] }, { list: [2, 1] }), 'J52 …while different values, or a reordered ARRAY, are not'); }

// ── Review D regression (D1): the after-save offer never opens over another open sheet ──
{ const src = fnBody('resumeAfterSignIn');
  ok(/planIntent\.peek\(\) && _openModalCount === 0\) openUpgrade\('plan'\);/.test(src), 'J53 the after-save plan offer requires that no other sheet is open (review D-D1)'); }

// ── Device-test finding T1 (2026-11-25, synthetic browser run): a same-market re-render (sign-in's market
// hydration, a sub-tab switch) re-ran the LTR/BRRR preset, which late-filled the empty tax from the typed
// price, staled the live result, and refused the save waiting for sign-in. The REAL renderMarketSlots runs here.
{ const calls = []; const classes = [];
  const el = { classList: { add: (c) => classes.push(c) } };
  const container = { innerHTML: '', querySelector: () => el };
  let market = 'charlotte-nc';
  const envT = {
    document: { getElementById: () => container },
    getUnlockedSlotCount: () => 2, getMarketForSlot: (i) => (i === 0 ? market : null),
    getMarketLabel: () => 'Charlotte, NC', slotDisplayName: (s) => s, getActiveTier: () => 'starter', hasAnalyzedOnce: () => false,
    setFlipPreset: (id) => calls.push('flip:' + id), setLtrPreset: (id) => calls.push('ltr:' + id),
    setBrrrPreset: (id) => calls.push('brrr:' + id), setRentalPreset: (id) => calls.push('rental:' + id),
    updateRentRangeHint: (id) => calls.push('hint:' + id), updateRepairRangesForMarket: (id) => calls.push('repair:' + id),
  };
  const srcT = 'let _activeSlot = 0;\n'
    + (mj.match(/\nconst staleSignature = [^\n]*\n/) || [''])[0]
    + (mj.match(/\nconst _presetMarket = [^\n]*\n/) || ['\nconst _presetMarket = {};\n'])[0]   // absent before T1: the checks fail, never crash
    + fnBody('renderMarketSlots') + '\nreturn { renderMarketSlots, staleSignature, _presetMarket };';
  const T = new Function(...Object.keys(envT), srcT)(...Object.values(envT));
  const render = (t) => { calls.length = 0; classes.length = 0; T.renderMarketSlots(t + '-slots', t); return calls.slice(); };
  ok(JSON.stringify(render('ltr')) === '["ltr:charlotte-nc"]' && JSON.stringify(render('ltr')) === '["ltr:charlotte-nc"]',
    'T1a no live result: every render applies the market preset, as before');
  T.staleSignature.ltr = 'sig';
  ok(JSON.stringify(render('ltr')) === '[]' && classes.includes('slot-active'),
    'T1b a live LTR result + the same market: the re-render keeps the inputs (no preset) and still marks the active slot');
  market = 'raleigh-nc';
  ok(JSON.stringify(render('ltr')) === '["ltr:raleigh-nc"]', 'T1c a live result but a DIFFERENT market: the preset applies (the stale law then flags the result)');
  market = null; render('ltr'); market = 'raleigh-nc';
  ok(JSON.stringify(render('ltr')) === '["ltr:raleigh-nc"]', 'T1d the market went away and came back: the preset applies again');
  T.staleSignature.ltr = null;
  ok(JSON.stringify(render('ltr')) === '["ltr:raleigh-nc"]', 'T1e the watch cleared (Clear & New Deal / no result): the preset applies');
  render('brrr'); T.staleSignature.brrr = 'sig';
  ok(JSON.stringify(render('brrr')) === '[]', 'T1f BRRR: the same rule (its tax follows the ARV)');
  render('flip'); T.staleSignature.flip = 'sig';
  ok(JSON.stringify(render('flip')) === '[]' && classes.includes('active'), 'T1g Flip: no preset re-run, and the slot keeps the class the preset adds (active)');
  render('rental'); T.staleSignature.rental = 'sig';
  ok(JSON.stringify(render('rental')) === '["hint:raleigh-nc"]', 'T1h STR: no preset re-run; the display-only rent-range hint still updates');
  const cnd = fnBody('clearNewDeal');
  ok(cnd.indexOf('clearStaleWatch(type)') > 0 && cnd.indexOf('clearStaleWatch(type)') < cnd.indexOf("renderMarketSlots('ltr-slots', 'ltr')"),
    'T1i Clear & New Deal clears the stale watch BEFORE it re-renders, so the next deal gets the market preset'); }

// ── 9+-unit referral disclaimer (owner-approved copy-only engine exemption, 2026-11-25) ──
{ const LINE = 'Estimate only — not a loan offer, approval, or guarantee of terms. Business-purpose, non-owner-occupied investment property only. Clear Path Capital is a broker; final terms come from the lender.';
  for (const [f, bid] of [['ltr.js', 'l-manual-review-btn'], ['brrr.js', 'b-manual-review-btn']]) {
    const src = rd('docs/src/js/' + f);
    const i = src.indexOf('id="' + bid + '"');
    const after = src.slice(i, i + 600);
    ok(i > 0 && after.includes(LINE) && after.indexOf(LINE) < after.indexOf("';\n"), 'RF1 ' + f + ': the 9+-unit Submit for Review notice carries the standard estimate / business-purpose / broker line');
    ok(src.split(LINE).length === 2,'RF2 ' + f + ': the line appears exactly once');
  } }

// ═══ §S source pins ════════════════════════════════════════════════════════════
console.log('— §S source pins —');
{
  const v = fnBody('verifySignInCode');
  const okBranch = v.slice(v.indexOf('if (result.ok)'), v.indexOf('} else if (input)'));
  ok(/armResumeAfterSignIn\(\);/.test(okBranch) && (v.match(/armResumeAfterSignIn/g) || []).length === 1, 'S1 the code sign-in arms the resume only in its success branch');
  ok(/if \(result\.ok\) \{ clearPending\(_signinStore\); refreshSheetAfterSignIn\(\); armResumeAfterSignIn\(\); \}/.test(fnBody('finishLinkSignIn')), 'S2 the (inert) link sign-in arms it only on success');
  ok((mj.match(/armResumeAfterSignIn\(\);/g) || []).length === 2 && (mj.match(/armResumeAfterSignIn/g) || []).length === 3, 'S3 nothing else arms a resume (restored sessions, other tabs and refreshes never do)');
  ok(/resumeAfterSignIn\(\);\s*\/\/ Commercial C2/.test(fnBody('syncPipelineOnAuth')) && fnBody('syncPipelineOnAuth').indexOf('await hydratePipeline()') < fnBody('syncPipelineOnAuth').indexOf('resumeAfterSignIn()'),
     'S4 a pending save is re-checked only after the account\'s own pipeline load');
  ok(/cancelResumeAndPlan\(\);/.test(fnBody('doSignOut')), 'S5 sign-out cancels both intents');
  ok(/\nonPipelineReloaded\(resumeAfterSignIn\);/.test(mj) && (rd('docs/src/js/pipeline.js').match(/reloadPipeline\(\);/g) || []).length === 3,
     'S12 every retry re-load (save, delete, edit) goes through reloadPipeline, which main.js subscribes to');
  ok(/async function saveDeal\(type, opts\) \{[\s\S]{0,400}if \(!\(opts && opts\.resume\) && pendingSave\.peek\(\)\?\.type === type\) cancelResume\(\);/.test(mj) && /await _saveDeal\(type, opts\)/.test(mj), 'S6 the Save button wrapper (stale-result law first) forwards the resume to pipeline.saveDeal');
  const auto = ['armResumeAfterSignIn', 'resumeAfterSignIn', 'configureUpgradeModal', 'renderPlanContinue', 'closeModal'].map(fnBody).join('\n');
  ok(!/startCheckout\(|functions\.invoke/.test(auto), 'S7 no automatic path calls checkout — only continuePlanCheckout (a tap) and the Subscribe buttons');
  ok(/onclick="continuePlanCheckout\(\)"/.test(rd('docs/index.html')) && /id="upgrade-continue" style="display:none/.test(rd('docs/index.html')),
     'S8 the continue button is hidden by default and acts only on a tap');
  const ps = rd('docs/src/js/pipeline.js');
  ok(/if \(!resume\) pendingSave\.note\(type, currentResultFor\(type\)\);/.test(ps) && ps.indexOf('pendingSave.note') < ps.indexOf("return { status: 'refused-auth' }"),
     'S9 only a signed-out Save tap notes a pending save');
  ok(!/sessionStorage|localStorage/.test(rd('docs/src/js/resumeIntent.js').replace(/\/\/[^\n]*/g, '')), 'S10 the save intent is memory-only (resumeIntent.js names no browser storage)');
  ok(!/getActiveTier|tier/.test(fnBody('armResumeAfterSignIn') + fnBody('resumeAfterSignIn').replace(/planIntent/g, '')), 'S11 finishing a save never depends on the plan (uniform allowance)');
}

// ═══ §H C2-6 the funding handoff carries no plan ═══════════════════════════════
console.log('— §H handoff —');
{
  const F = await import(JS + 'funding.js');
  for (const t of ['starter', 'investor', 'pro']) {
    globalThis.__tier = t;
    const u = new URL(F.buildCpcUrl({ pp: 100000, loan: 80000, addr: '1 Test St', purpose: 'purchase' }));
    ok(u.searchParams.get('src') === 'dealscreener' && !u.searchParams.has('tier') && u.hash === '#submit', `H1 ${t}: src=dealscreener, no tier`);
  }
  globalThis.__tier = 'starter';
  const fs = rd('docs/src/js/funding.js'), cp = rd('docs/src/js/clearpath.js');
  ok(!/getActiveTier|tiers\.js/.test(fs) && !/p\.set\('tier'/.test(fs), 'H2 funding.js reads no plan');
  ok(!/getActiveTier|tiers\.js/.test(cp) && /tag:\s+'\[DealFit Submission\]',/.test(cp) && !/\[(Starter|Investor|Pro) Submission\]/.test(cp),
     'H3 the clipboard summary carries one neutral tag for every account');
}

console.log(`commercialc2: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
