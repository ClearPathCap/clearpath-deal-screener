// ─── Saved-deal review suite — "Review & Re-analyze" → "Update Saved Deal" ────
// Owner law (2026-09-05): a saved deal is a historical analysis snapshot; code
// updates never rewrite it; the user may explicitly review and re-analyze it
// with current DealFit; nothing persisted changes until the user taps Update
// Saved Deal. Executes the REAL main.js (reviewDeal, prefill, banner, Save
// wrapper), pipeline.js (review state + in-place update), storage.js, the four
// REAL analyzers (flip.js / rental.js / ltr.js / brrr.js) and finance under
// node:module hooks with a DOM stub whose 'input' events fire.
// Acceptance case: Aaron's persisted Orange Street LTR record (vacancy 5) →
// review → 7 → Analyze → current 7% numbers → Update.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/dealreview.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const tick = () => new Promise(r => setTimeout(r, 0));
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

globalThis.__authState = { signedIn: true, email: 'qa@local.test' };
let rpcCalls = [];
globalThis.__rpc = async () => ({ data: null, error: null });
globalThis.__supabaseStub = { rpc: (name, args) => { rpcCalls.push({ name, args: JSON.parse(JSON.stringify(args ?? null)) }); return globalThis.__rpc(name, args); } };
globalThis.__tier = 'pro';
globalThis.__activeMarket = 'bridgeport-ct';
const SLOTS = ['bridgeport-ct', 'charlotte-nc'];
const LABELS = { 'bridgeport-ct': 'Bridgeport, CT', 'charlotte-nc': 'Charlotte, NC' };

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
    export const syncEntitlement = async () => 'pro';`,
  'clearpath.js': `export const getPipelineFundingButtonHTML = () => '';
    export const maybeShowFundingButton=()=>{},handlePipelineFundingClick=()=>{},getFundingLabel=()=>'';`,
  'tiers.js': `export const getActiveTier = () => globalThis.__tier;
    const SLOTS = ${JSON.stringify(SLOTS)}; const LABELS = ${JSON.stringify(LABELS)};
    export const isDevMode=()=>false,setDevTier=()=>{},setCachedTier=()=>{},devModeVisible=()=>false,
    migrateMarketStorage=()=>{},redeemCode=()=>({ok:false}),hasSelectedMarkets=()=>true,
    getMarketSlots=()=>SLOTS.slice(),getMarketForSlot=(i)=>SLOTS[i]||'',setMarketSlot=()=>{},getPrimaryMarket=()=>SLOTS[0],
    getMarket2=()=>SLOTS[1],completePrimarySelection=()=>{},recordSlotChange=()=>{},isSlotLocked=()=>false,
    slotLockedUntilDate=()=>null,slotWillLockUntilDate=()=>'',getUnlockedSlotCount=()=>2,
    isMarketUnlocked=()=>true,getMarketLabel=(x)=>LABELS[x]||x,getActiveMarketId=()=>globalThis.__activeMarket;`,
  'marketIntel.js': `export const fetchMarketIntel = async () => new Map();`,
  'install.js': `export const openInstall=()=>{},triggerInstall=()=>{},initInstallHint=()=>{};`,
  'share.js': `export const openShareApp=()=>{},shareDeal=()=>{};`,
  'marketSync.js': `export const hydrateMarketsOnAuth=async()=>({status:'signed-out',pulled:0,pushed:0}),
    pushMarketChange=async()=>({ok:true,local:true});`,
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

// ── DOM stub with working input events ───────────────────────────────────────
const elements = new Map();
const currencyEls = [];
function makeEl(id) {
  const L = {};
  return {
    id, value: '', textContent: '', innerHTML: '', style: {}, disabled: false, checked: false, dataset: {}, attrs: {}, className: '',
    parentNode: null, children: [], firstChild: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } },
      contains(c) { return this._s.has(c); } },
    setAttribute(n, v) { this.attrs[n] = String(v); }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, removeAttribute(n) { delete this.attrs[n]; },
    hasAttribute(n) { return n in this.attrs; },
    addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, removeEventListener() {},
    // flip.js dispatches a real `new Event('input')` (read-only target) — tolerate both shapes.
    dispatchEvent(ev) { try { if (!ev.target) ev.target = this; } catch {} (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus() {}, blur() {}, select() {}, scrollIntoView() {}, closest() { return null; }, appendChild(c) { this.children.push(c); return c; },
    insertAdjacentElement() {}, insertAdjacentHTML() {}, before() {}, after() {}, prepend() {}, append() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
  };
}
const el = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
const html = readFileSync(join(ROOT, 'docs', 'index.html'), 'utf8');
for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
  const attrs = m[1];
  const id = (attrs.match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id);
  const v = (attrs.match(/\bvalue="([^"]*)"/) || [])[1]; if (v !== undefined) e.value = v;
  if (/\bdata-currency\b/.test(attrs)) { e.attrs['data-currency'] = ''; currencyEls.push(e); }
}
globalThis.document = {
  getElementById: el,
  querySelectorAll: (sel) => sel === '[data-currency]' ? currencyEls.slice() : [],
  querySelector: () => null, createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), documentElement: makeEl('html'),
  addEventListener() {}, removeEventListener() {}, activeElement: null,
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.scrollTo = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
for (const [k, val] of Object.entries({
  navigator: { userAgent: 'node', standalone: false, share: undefined, clipboard: { writeText: async () => {} } },
  location: { hash: '', search: '', href: 'http://localhost/', pathname: '/', origin: 'http://localhost' },
  history: { replaceState() {}, pushState() {} },
})) { try { Object.defineProperty(globalThis, k, { value: val, configurable: true, writable: true }); } catch {} }
globalThis.alert = () => {};
const store = new Map([['primaryMarket', 'bridgeport-ct'], ['market_2', 'charlotte-nc'], ['hasSelectedMarkets', '1'], ['activeSlot', '0']]);
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); }, clear() { store.clear(); } };
let toasts = [];
globalThis.showToast = (m) => toasts.push(m);
globalThis.openUpgrade = () => {};
globalThis.confirm = () => true;
globalThis.open = () => null;

const typed = (id, v) => { const e = el(id); e.value = v; e.dispatchEvent({ type: 'input', isTrusted: true }); return e.value; };

const storage  = await import(JS + 'storage.js');
const pipeline = await import(JS + 'pipeline.js');
const ltr      = await import(JS + 'ltr.js');
const rental   = await import(JS + 'rental.js');
const brrr     = await import(JS + 'brrr.js');
const flip     = await import(JS + 'flip.js');
const F        = await import(JS + 'finance.js');
await import(JS + 'main.js');
await tick();

const v  = (id) => String(el(id).value);
const ue = (id) => el(id).dataset.userEdited === '1';
const snapshot = () => JSON.stringify(storage.getDeals());
const saveCalls = () => rpcCalls.filter(c => c.name === 'save_pipeline').length;

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Aaron's persisted Orange Street record (read-only SELECT on user_pipeline, 2026-09-05).
const ORANGE = { id: 1788568627683, cls: 'warm', type: 'ltr', name: 'Orange Street, Bridgeport, CT', notes: '', date: 'Sep 4, 2026',
  savedAt: '2026-09-05T00:37:07.692Z', verdict: 'Dig Deeper & Negotiate', market: 'bridgeport-ct', marketLabel: 'Bridgeport, CT',
  stats: [{ l: 'DSCR', v: '1.25' }, { l: 'CoC', v: '3.6%' }, { l: 'Cash Flow', v: '$540' }],
  data: { cc: 2, pm: 8, EGI: 68400, NOI: 49984, cls: 'warm', coc: 3.594636016481197, grm: 9.026388888888889, hoa: 0, hot: false, ins: 2300,
    ltv: 75, tax: 7044, vac: 5, addr: '73 Orange Street, Bridgeport, CT 06607', band: '1-4', down: 25, dscr: 1.2526950086051216, loan: 487425,
    rate: 7.25, rent: 6000, type: 'ltr', amort: 30, capex: 5, maint: 5, price: 649900, ptype: '2–4 Unit', units: 3,
    debtYr: 39901.172796766616, points: 1, rentYr: 72000, target: 8, capRate: 7.69102938913679, downAmt: 162475,
    verdict: 'Dig Deeper & Negotiate', capexRes: 3600, insStatus: 'valid', taxStatus: 'valid', cashFlowMo: 540.2356002694487,
    cashFlowYr: 6482.827203233384, onePctRule: 0.9232189567625788, cashToClose: 180347.25, marginOfSafety: 'fails' } };
const STR = { id: 7201, name: '5 Beach Rd — Myrtle Beach', type: 'rental', verdict: 'Solid STR', cls: 'warm', notes: 'seasonal', date: 'Sep 1, 2026', savedAt: '2026-09-01T12:00:00.000Z',
  data: { type: 'rental', addr: '5 Beach Rd, Myrtle Beach, SC', price: 400000, down: 20, rent: 60000, occ: 65, mgmt: 3, pm: 10, tax: 4000, maint: 3000, furnish: 20000, tgtCoc: 6, interestRate: 0.0675,
    cashflow: 5000, coc: 5.2, capRate: 7.5, noi: 30000, debt: 25000, downAmt: 80000, grm: 6.7, dscr: 1.2 },
  stats: [{ l: 'CoC', v: '5.2%' }, { l: 'Cap', v: '7.5%' }, { l: 'Cash Flow', v: '$5,000' }] };
const BRRR = { id: 7301, name: '77 Birch St', type: 'brrr', verdict: 'Partial BRRRR — Capital Trapped or Tight', cls: 'warm', notes: '', date: 'Sep 2, 2026', savedAt: '2026-09-02T12:00:00.000Z',
  data: { type: 'brrr', addr: '77 Birch St, Charlotte, NC', price: 250000, rehab: 40000, arv: 380000, rent: 2600, units: 1, band: '1-4', contingency: 15, cc: 2, hold: 6, carry: 600,
    acqLoan: 200000, acqRate: 10, acqPoints: 2, refiLtv: 75, refiRate: 7, refiAmort: 30, reficost: 3, season: 6, vac: 5, tax: 3000, ins: 1200, hoa: 0, maint: 5, pm: 8, capex: 5, targetDscr: 1.25, ptype: 'SFR' },
  stats: [] };
const FLIP = { id: 7401, name: '412 Oak St — Lexington', type: 'flip', verdict: 'Strong Flip Candidate', cls: 'hot', notes: 'roof', date: 'Aug 30, 2026', savedAt: '2026-08-30T12:00:00.000Z',
  data: { type: 'flip', addr: '412 Oak St, Lexington SC', ask: 200000, arv: 320000, rep: 30000, hold: 5, cc1: 2, cc2: 5, carry: 900, target: 40000, sqft: 1400, self: false,
    loan: 150000, rate: 0.10, points: 0.03, repSource: 'manual', repEstimate: null, profit: 42000, roi: 17, maxOffer: 170000 },
  stats: [] };

globalThis.__rpc = async () => ({ data: null, error: null });
await storage.hydratePipeline();
await storage.saveDeals([ORANGE, STR, BRRR, FLIP]);
rpcCalls = [];
const BASELINE = snapshot();
ok(storage.getDeals().length === 4, 'S0 four saved deals seeded (LTR = Aaron\'s Orange Street record)');

// ── §A · Review & Re-analyze on Orange Street (LTR) — no analysis, no mutation ──
console.log('— §A Review & Re-analyze: LTR (Orange Street) —');
el('ltr-results').style.display = 'block';   // stale result panel from a previous analysis
const r0 = globalThis.reviewDeal(ORANGE.id);
ok(r0.status === 'reviewing' && r0.type === 'ltr', `A1 reviewDeal enters review mode (${JSON.stringify(r0)})`);
ok(pipeline.getReviewingDealId() === ORANGE.id, 'A2 pending-update state carries the deal id');
ok(el('page-rental').classList.contains('active') && el('rental-view-ltr').style.display === '', 'A3 navigated to Rentals → Long-Term');
ok(el('ltr-results').style.display === 'none' && el('ltr-funding-btn').innerHTML === '', 'A4 stale result + funding area hidden — nothing analyzed yet');
ok(ltr.getLastLtrResult() === null, 'A5 NO automatic Analyze ran');
const expectLtr = { 'l-addr': '73 Orange Street, Bridgeport, CT 06607', 'l-price': '649,900', 'l-rent': '6,000', 'l-units': '3', 'l-down': '25', 'l-vac': '5', 'l-tax': '7,044',
  'l-ins': '2,300', 'l-hoa': '0', 'l-maint': '5', 'l-pm': '8', 'l-capex': '5', 'l-rate': '7.25', 'l-amort': '30', 'l-points': '1', 'l-cc': '2', 'l-target': '8', 'l-ptype': '2–4 Unit' };
const badLtr = Object.entries(expectLtr).filter(([id, want]) => v(id) !== want).map(([id, want]) => `${id}=${v(id)}≠${want}`);
ok(badLtr.length === 0, 'A6 every persisted raw input hydrates: ' + (badLtr.join(', ') || 'all 18 match'));
ok(v('l-vac') === '5', 'A7 the stored 5% vacancy is VISIBLE for review (Orange Street acceptance step 3)');
ok(['l-price', 'l-rent', 'l-vac', 'l-down', 'l-tax', 'l-units', 'l-pm'].every(ue), 'A8 hydrated values are marked user-edited (protected)');
ok(el('l-units').dataset.band === '1-4', 'A9 band memory seeded from the saved units (band sync stays quiet)');
ok(v('ltr-deal-name') === ORANGE.name && v('ltr-notes') === '', 'A10 name + notes carried from the saved deal');
ok(el('ltr-review-banner').style.display === 'block' && /Reviewing “Orange Street, Bridgeport, CT”/.test(el('ltr-review-banner').innerHTML) && /will not change until you tap/.test(el('ltr-review-banner').innerHTML), 'A11 banner explains the law');
ok(el('ltr-save-btn').textContent === 'Update Saved Deal', 'A12 Save reads "Update Saved Deal"');
ok(snapshot() === BASELINE && saveCalls() === 0, 'A13 saved deal unchanged, zero saves');

// presets / band defaults cannot clobber the hydrated values
globalThis.switchRentalView('ltr'); globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
el('l-units').dispatchEvent({ type: 'input', isTrusted: true });
const badClobber = Object.entries(expectLtr).filter(([id, want]) => v(id) !== want).map(([id]) => id);
ok(badClobber.length === 0, 'A14 sub-tab re-render, market switch and a units event leave every hydrated value alone: ' + (badClobber.join(', ') || 'none moved'));
ok(snapshot() === BASELINE, 'A15 …and the snapshot is still untouched');

// ── §B · user corrects vacancy → Analyze → current numbers, still nothing persisted ──
console.log('— §B correct 5 → 7, Analyze (current DealFit) —');
typed('l-vac', '7');
globalThis.analyzeLtr();
const r7 = ltr.getLastLtrResult();
ok(r7 && r7.vac === 7 && near(r7.EGI, 66960) && near(r7.NOI, 48659.2, 0.5), `B1 current engine at 7%: EGI ${r7 && r7.EGI} / NOI ${r7 && r7.NOI && r7.NOI.toFixed(1)}`);
ok(r7 && near(r7.dscr, 1.2195, 0.001) && near(r7.coc, 2.86, 0.01) && near(r7.cashFlowYr, 5158.03, 0.5) && near(r7.cashFlowMo, 429.84, 0.5), `B2 DSCR ${r7 && r7.dscr.toFixed(3)} · CoC ${r7 && r7.coc.toFixed(2)}% · CF ${r7 && r7.cashFlowYr.toFixed(0)}/yr ${r7 && r7.cashFlowMo.toFixed(0)}/mo`);
ok(r7 && r7.verdict === 'Dig Deeper & Negotiate' && r7.cls === 'warm', 'B3 verdict: Dig Deeper & Negotiate (warm)');
ok(r7 && near(r7.cashToClose, 180347.25), 'B4 cash to close $180,347.25');
ok(snapshot() === BASELINE && saveCalls() === 0, 'B5 analyzing does NOT persist — snapshot unchanged, zero saves');
ok(pipeline.getReviewingDealId() === ORANGE.id && el('ltr-save-btn').textContent === 'Update Saved Deal', 'B6 still in review mode after Analyze');
ok(v('ltr-deal-name') === ORANGE.name, 'B7 the deal name was not overwritten by the auto-name helper');

// ── §C · Update Saved Deal — same id, provenance kept, fresh inputs + outputs ──
console.log('— §C Update Saved Deal —');
el('ltr-notes').value = 'Re-analyzed at 7% vacancy';
const upd = await globalThis.saveDeal('ltr');
ok(upd && upd.status === 'saved' && upd.mode === 'updated' && upd.id === ORANGE.id, `C1 outcome ${JSON.stringify(upd)}`);
const deals = storage.getDeals();
ok(deals.length === 4 && deals.filter(d => d.id === ORANGE.id).length === 1, 'C2 same record count — updated in place, no duplicate');
const o2 = deals.find(d => d.id === ORANGE.id);
ok(o2.data.vac === 7 && near(o2.data.EGI, 66960) && near(o2.data.NOI, 48659.2, 0.5) && near(o2.data.dscr, 1.2195, 0.001), 'C3 persisted raw inputs + derived outputs are the reviewed 7% analysis');
ok(o2.name === ORANGE.name && o2.notes === 'Re-analyzed at 7% vacancy', 'C4 name preserved; notes changed only because the user edited them');
ok(o2.date === ORANGE.date && o2.savedAt === ORANGE.savedAt && o2.market === ORANGE.market && o2.marketLabel === ORANGE.marketLabel, 'C5 original saved/created provenance preserved (date, savedAt, market stamp)');
ok(typeof o2.updated === 'string' && /\w{3} \d{1,2}, \d{4}/.test(o2.updated) && /^\d{4}-\d{2}-\d{2}T/.test(o2.updatedAt), `C6 updated / updatedAt stamped (${o2.updated})`);
ok(o2.stats.some(s => s.l === 'DSCR' && s.v === '1.22') && o2.verdict === 'Dig Deeper & Negotiate', 'C7 card stats + verdict rebaked from the fresh result');
const payload = rpcCalls.filter(c => c.name === 'save_pipeline').pop();
ok(payload && payload.args.p_deals.length === 4 && payload.args.p_deals.find(d => d.id === ORANGE.id).data.vac === 7, 'C8 ONE save_pipeline RPC carried the updated record among the untouched others');
ok(deals.filter(d => d.id !== ORANGE.id).every(d => JSON.stringify(d) === JSON.stringify(JSON.parse(BASELINE).find(x => x.id === d.id))), 'C9 the other three deals are byte-identical');
ok(pipeline.getReviewingDealId() === null && el('ltr-review-banner').style.display === 'none', 'C10 review mode ended; banner gone');
ok(el('ltr-save-btn').textContent === 'Saved ✓', 'C11 Save button follows the normal Saved ✓ path');
const AFTER_UPDATE = snapshot();
pipeline.renderPipeline();
const cardHtml = el('pipeline-list').innerHTML;
ok(/Saved inputs/.test(cardHtml) && /Rent \$6,000\/mo · Vacancy 7% · Down 25% · 3 units/.test(cardHtml), 'C12 expanded card shows the saved-inputs line for the updated record');
ok(/Saved Sep 4, 2026 · Updated /.test(cardHtml), 'C13 card footer shows Saved … · Updated …');
ok(/Review &amp; Re-analyze/.test(cardHtml) && (cardHtml.match(/reviewDeal\(/g) || []).length === 4, 'C14 every card (all four types) carries Review & Re-analyze');

// ── §D · leaving review mode without updating leaves the snapshot untouched ──
console.log('— §D cancel / clear paths —');
globalThis.reviewDeal(ORANGE.id);
typed('l-vac', '9');
const cancel = globalThis.cancelDealReview('ltr');
ok(cancel.status === 'cancelled' && pipeline.getReviewingDealId() === null && el('ltr-review-banner').style.display === 'none' && el('ltr-save-btn').textContent === 'Save', 'D1 Cancel review exits the mode (banner gone, Save restored)');
ok(snapshot() === AFTER_UPDATE, 'D2 snapshot untouched after cancel');
globalThis.reviewDeal(ORANGE.id);
globalThis.clearNewDeal('ltr');
ok(pipeline.getReviewingDealId() === null && el('ltr-save-btn').textContent === 'Save' && !ue('l-vac') && !ue('l-price'), 'D3 Clear & New Deal exits the mode and releases the prefill protection');
ok(snapshot() === AFTER_UPDATE, 'D4 snapshot untouched after clear');
globalThis.reviewDeal(ORANGE.id);
globalThis.showPage('pipeline');
ok(pipeline.getReviewingDealId() === ORANGE.id && snapshot() === AFTER_UPDATE, 'D5 navigating away persists nothing (mode stays pending, snapshot untouched)');
globalThis.cancelDealReview('ltr');
// A normal new save while NOT reviewing still creates a new record (no accidental update).
globalThis.analyzeLtr(); el('ltr-deal-name').value = 'Fresh copy';
const fresh = await globalThis.saveDeal('ltr');
ok(fresh.status === 'saved' && !fresh.mode && storage.getDeals().length === 5, 'D6 outside review mode, Save still creates a new deal');
const freshId = storage.getDeals().find(d => d.name === 'Fresh copy').id;

// ── §E · STR path ────────────────────────────────────────────────────────────
console.log('— §E STR path —');
const before = snapshot();
const rs = globalThis.reviewDeal(STR.id);
ok(rs.status === 'reviewing' && el('rental-view-str').style.display === '' && el('rental-results').style.display === 'none', 'E1 STR review navigates to Short-Term, no analysis');
const expectStr = { 'v-addr': '5 Beach Rd, Myrtle Beach, SC', 'v-price': '400,000', 'v-rent': '60,000', 'v-down': '20', 'v-occ': '65', 'v-mgmt': '3', 'v-pm': '10', 'v-tax': '4,000', 'v-maint': '3,000', 'v-furnish': '20,000', 'v-target': '6', 'v-interest-rate': '6.75' };
const badStr = Object.entries(expectStr).filter(([id, want]) => v(id) !== want).map(([id, want]) => `${id}=${v(id)}≠${want}`);
ok(badStr.length === 0, 'E2 STR raw inputs hydrate: ' + (badStr.join(', ') || 'all 12 match'));
globalThis.switchRentalView('str'); globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
ok(v('v-occ') === '65' && v('v-rent') === '60,000' && v('v-down') === '20', 'E3 STR preset re-renders never overwrite hydrated occupancy / rent / down');
ok(rental.getLastRentalResult() === null && snapshot() === before, 'E4 no auto-analyze, nothing persisted');
typed('v-occ', '70');
globalThis.analyzeRental();
const rr = rental.getLastRentalResult();
ok(rr && rr.price === 400000 && rr.rent === 60000 && rr.occ === 70, `E5 current STR engine ran on the reviewed inputs (occ ${rr && rr.occ})`);
ok(snapshot() === before, 'E6 analyzing did not persist');
const updS = await globalThis.saveDeal('rental');
const s2 = storage.getDeals().find(d => d.id === STR.id);
ok(updS.mode === 'updated' && storage.getDeals().length === 5 && s2.data.occ === 70 && s2.name === STR.name && s2.notes === 'seasonal' && s2.savedAt === STR.savedAt && s2.updated, 'E7 STR Update Saved Deal: same id, occ 70, name/notes/savedAt kept, updated stamped');

// ── §F · BRRRR path ──────────────────────────────────────────────────────────
console.log('— §F BRRRR path —');
const beforeB = snapshot();
const rb = globalThis.reviewDeal(BRRR.id);
ok(rb.status === 'reviewing' && el('rental-view-brrr').style.display === '' && el('brrr-results').style.display === 'none', 'F1 BRRRR review navigates to the BRRRR view, no analysis');
const expectB = { 'b-addr': '77 Birch St, Charlotte, NC', 'b-price': '250,000', 'b-rehab': '40,000', 'b-arv': '380,000', 'b-rent': '2,600', 'b-units': '1', 'b-contingency': '15', 'b-cc': '2', 'b-hold': '6', 'b-carry': '600',
  'b-acqloan': '200,000', 'b-acqrate': '10', 'b-acqpoints': '2', 'b-refiltv': '75', 'b-refirate': '7', 'b-refiamort': '30', 'b-reficost': '3', 'b-season': '6', 'b-vac': '5', 'b-tax': '3,000', 'b-ins': '1,200', 'b-hoa': '0', 'b-maint': '5', 'b-pm': '8', 'b-capex': '5', 'b-targetdscr': '1.25', 'b-ptype': 'SFR' };
const badB = Object.entries(expectB).filter(([id, want]) => v(id) !== want).map(([id, want]) => `${id}=${v(id)}≠${want}`);
ok(badB.length === 0, 'F2 BRRRR raw inputs hydrate: ' + (badB.join(', ') || 'all 27 match'));
globalThis.switchRentalView('brrr'); globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
el('b-units').dispatchEvent({ type: 'input', isTrusted: true });
ok(v('b-rent') === '2,600' && v('b-tax') === '3,000' && v('b-arv') === '380,000' && v('b-carry') === '600' && v('b-vac') === '5', 'F3 BRRRR presets / band sync never overwrite hydrated values');
ok(brrr.getLastBrrrResult() === null && snapshot() === beforeB, 'F4 no auto-analyze, nothing persisted');
typed('b-vac', '7');
globalThis.analyzeBrrr();
const rbr = brrr.getLastBrrrResult();
ok(rbr && rbr.price === 250000 && rbr.vac === 7 && rbr.rent === 2600, `F5 current BRRRR engine ran on the reviewed inputs (vac ${rbr && rbr.vac})`);
ok(snapshot() === beforeB, 'F6 analyzing did not persist');
const updB = await globalThis.saveDeal('brrr');
const b2 = storage.getDeals().find(d => d.id === BRRR.id);
ok(updB.mode === 'updated' && storage.getDeals().length === 5 && b2.data.vac === 7 && b2.name === BRRR.name && b2.savedAt === BRRR.savedAt && b2.updated, 'F7 BRRRR Update Saved Deal: same id, vac 7, provenance kept');

// ── §G · Fix & Flip path (alongside the existing card editor) ───────────────
console.log('— §G Fix & Flip path —');
const beforeF = snapshot();
const rf = globalThis.reviewDeal(FLIP.id);
ok(rf.status === 'reviewing' && el('page-flip').classList.contains('active') && el('flip-results').style.display === 'none', 'G1 flip review navigates to Fix & Flip, no analysis');
const expectF = { 'f-addr': '412 Oak St, Lexington SC', 'f-ask': '200,000', 'f-arv': '320,000', 'f-rep': '30,000', 'f-hold': '5', 'f-cc1': '2', 'f-cc2': '5', 'f-carry': '900', 'f-target': '40,000', 'sqft': '1400', 'f-loan': '150,000', 'f-rate': '10', 'f-points': '3' };
const badF = Object.entries(expectF).filter(([id, want]) => v(id) !== want).map(([id, want]) => `${id}=${v(id)}≠${want}`);
ok(badF.length === 0, 'G2 flip raw inputs hydrate (fractions → whole percents): ' + (badF.join(', ') || 'all 13 match'));
ok(el('self-reno').checked === false && ue('f-rep') && ue('f-target') && ue('f-carry') && ue('f-hold'), 'G3 repair / target / carry / hold protected from estimator and market preset');
globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
ok(v('f-carry') === '900' && v('f-hold') === '5' && v('f-target') === '40,000' && v('f-rep') === '30,000', 'G4 flip preset re-render leaves hydrated carry / hold / target / repairs alone');
ok(flip.getLastFlipResult() === null && snapshot() === beforeF, 'G5 no auto-analyze, nothing persisted');
typed('f-ask', '190000');
globalThis.analyzeFlip();
const rfl = flip.getLastFlipResult();
ok(rfl && rfl.ask === 190000 && rfl.arv === 320000 && rfl.rep === 30000 && rfl.loan === 150000 && near(rfl.rate, 0.10) && near(rfl.points, 0.03), 'G6 current flip engine ran on the reviewed inputs (ask 190,000; financing intact)');
ok(snapshot() === beforeF, 'G7 analyzing did not persist');
const updF = await globalThis.saveDeal('flip');
const f2 = storage.getDeals().find(d => d.id === FLIP.id);
ok(updF.mode === 'updated' && storage.getDeals().length === 5 && f2.data.ask === 190000 && f2.name === FLIP.name && f2.notes === 'roof' && f2.savedAt === FLIP.savedAt && f2.updated, 'G8 flip Update Saved Deal: same id, ask 190,000, name/notes/savedAt kept');
ok(typeof pipeline.startDealEdit === 'function' && typeof pipeline.saveDealEdits === 'function', 'G9 the existing flip card editor is untouched (parallel entry, same persistence coordinator)');

// ── §H · source pins (same-commit law) + BRRRR user-visible spelling ─────────
console.log('— §H pins —');
const plSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'pipeline.js'), 'utf8');
const mainSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
const cpSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'clearpath.js'), 'utf8');
const finSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'finance.js'), 'utf8');
ok(/const reviewing = reviewingDealId != null \? deals\.find/.test(plSrc) && /candidate = deals\.map\(x => x\.id === reviewing\.id \? updatedDeal : x\)/.test(plSrc), 'H1 update path replaces the reviewed id in place through the same saveDeals coordinator');
ok(/\.\.\.reviewing, name, notes,/.test(plSrc) && /updatedAt: now\.toISOString\(\)/.test(plSrc), 'H2 provenance spread + updated stamps');
ok(/id:      Date\.now\(\),/.test(plSrc) && /candidate = \[deal, \.\.\.deals\]/.test(plSrc), 'H3 new-deal path unchanged');
ok(/reviewDeal\(\$\{d\.id\}\)/.test(plSrc) && /Review &amp; Re-analyze/.test(plSrc) && /savedInputsLine\(d\)/.test(plSrc), 'H4 card carries the action + saved-inputs line');
ok(/function reviewDeal\(id\)/.test(mainSrc) && !/analyzeLtr\(\)|analyzeFlip\(\)|analyzeRental\(\)|analyzeBrrr\(\)/.test(mainSrc.slice(mainSrc.indexOf('function reviewDeal(id)'), mainSrc.indexOf('function exitReviewUI'))), 'H5 reviewDeal never calls an analyzer');
ok(/el\.dataset\.userEdited = '1';\s*\n\s*delete el\.dataset\.autoFilled;/.test(mainSrc), 'H6 prefill marks every value user-edited');
const htmlText = html.replace(/<!--[\s\S]*?-->/g, '');
ok(/🔄 BRRRR<\/button>/.test(htmlText) && /BRRRR Breakdown/.test(htmlText) && /e\.g\. BRRRR 77 Birch St/.test(htmlText) && !/BRRR[^R]/.test(htmlText.replace(/[a-z-]*brrr[a-z-]*/g, '')), 'H7 index.html user-visible copy says BRRRR (tab, breakdown, placeholder)');
ok(/'BRRRR \(Bridge → DSCR Refi\)'/.test(plSrc) && /'brrr' \? 'BRRRR'/.test(plSrc), 'H8 pipeline card copy says BRRRR');
ok(/'Explore BRRRR Funding'/.test(cpSrc) && /'Explore Multifamily BRRRR'/.test(cpSrc), 'H9 funding CTA says BRRRR');
ok(/"Textbook BRRRR — Capital Recycled"/.test(finSrc) && /"Partial BRRRR — Capital Trapped or Tight"/.test(finSrc) && /"BRRRR Breaks — Rework the Numbers"/.test(finSrc) && !/"[^"]*\bBRRR\b[^"]*"/.test(finSrc.split('\n').filter(l => /verdict\s*=|vsub\s*=|\+ "/.test(l)).join('\n')), 'H10 BRRRR verdict copy normalized');
ok(/brrr\.js|'brrr'/.test(mainSrc) && /switchRentalView\('brrr'/.test(htmlText), 'H11 internal brrr identifiers untouched');
// Owner decision (2026-09-05): human-facing copy in clipboard/handoff summaries,
// share text and the shared-deal page also says BRRRR; machine tokens stay.
const shareSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'share.js'), 'utf8');
const sharedViewSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'sharedView.js'), 'utf8');
const fundingSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'funding.js'), 'utf8');
ok(/'DEAL SCREENER SUMMARY — BRRRR \(Bridge → DSCR Cash-Out Refi\)'/.test(cpSrc) && /lines\.push\('BRRRR ANALYSIS'\)/.test(shareSrc) && /deal\.type === 'brrr' \? 'BRRRR'/.test(sharedViewSrc),
   'H12 clipboard/handoff summary header, share text and shared-deal label say BRRRR');
ok(!/BRRR(?!R)/.test([cpSrc, shareSrc, sharedViewSrc, plSrc, finSrc].map(s => s.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).map(l => l.replace(/\/\/.*$/, '').replace(/BRRR_ASSUMPTIONS/g, '')).join('\n')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')),
   'H13 no human-facing 4-R "BRRR" string literal remains in clearpath/share/sharedView/pipeline/finance');
ok(/purpose/.test(fundingSrc) && /'brrr'/.test(fundingSrc + cpSrc) && /type === 'brrr'/.test(cpSrc), 'H14 machine tokens (purpose / type "brrr") untouched');

console.log(`\ndealreview: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
