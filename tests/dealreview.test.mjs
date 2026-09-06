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
    export const maybeShowFundingButton=()=>{},handlePipelineFundingClick=()=>{},getFundingLabel=()=>'';
    export const parseCityState=()=>({}),addressHandoff=()=>({});   // Wave A · A1 import surface (real parser proven in handoffutil / addrfields)`,
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
  e.defaultValue = v !== undefined ? v : '';           // the HTML value attribute, as in a browser
  if (/\bdata-currency\b/.test(attrs)) { e.attrs['data-currency'] = ''; currencyEls.push(e); }
}
// Real option lists for the selects the review touches (property type).
for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id);
  e.options = [...m[2].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(o => ({ value: (o[1].match(/\bvalue="([^"]*)"/) || [])[1] ?? o[2].trim(), text: o[2].trim() }));
  if (e.options.length && !e.value) e.value = e.options[0].value;
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

// ── §I · adversarial-review correctives (executed probes → pins) ─────────────
console.log('— §I review correctives —');
// I1 (blocker): a stale result from ANOTHER deal must never become the update.
globalThis.cancelDealReview('ltr'); globalThis.clearNewDeal('ltr');
typed('l-price', '300000'); typed('l-rent', '3000'); typed('l-tax', '3000'); typed('l-ins', '1000');
globalThis.analyzeLtr();
ok(ltr.getLastLtrResult() && ltr.getLastLtrResult().price === 300000, 'I1a an unrelated LTR analysis is live');
const beforeI = snapshot();
globalThis.reviewDeal(ORANGE.id);
ok(ltr.getLastLtrResult() === null, 'I1b entering a review INVALIDATES the analyzer\'s last result');
const staleTry = await globalThis.saveDeal('ltr');
ok(staleTry.status === 'refused-result' && snapshot() === beforeI, `I1c Update without Analyze is refused (${staleTry.status}); snapshot untouched`);
ok(pipeline.getReviewingDealId() === ORANGE.id && el('ltr-save-btn').textContent === 'Update Saved Deal', 'I1d review still pending after the refusal');
// I2 (major): the Saved ✓ revert handler must not relabel a pending review to "Save".
el('page-rental').dispatchEvent({ type: 'input', isTrusted: true });
ok(el('ltr-save-btn').textContent === 'Update Saved Deal', 'I2 first keystroke after a previous save keeps "Update Saved Deal"');
// I3 (major): a second review of a DIFFERENT type exits the first analyzer's review UI.
globalThis.reviewDeal(STR.id);
ok(pipeline.getReviewingDealId() === STR.id && el('ltr-review-banner').style.display === 'none' && el('ltr-save-btn').textContent === 'Save' && !ue('l-vac'), 'I3 reviewing STR exits the LTR review UI and releases its protection');
globalThis.cancelDealReview('rental');
// I4 (major): deleting the reviewed deal ends the review everywhere.
globalThis.reviewDeal(freshId);
ok(pipeline.getReviewingDealId() === freshId && el('ltr-review-banner').style.display === 'block', 'I4a reviewing the throwaway deal');
pipeline.requestDelete(freshId);
const del = await pipeline.confirmDelete();
ok(del.status === 'deleted' && pipeline.getReviewingDealId() === null && el('ltr-review-banner').style.display === 'none' && el('ltr-save-btn').textContent === 'Save', `I4b delete ends the review (${del.status}); banner gone, Save restored`);
// I5 (major): pending ('missing') taxes / insurance prefill BLANK — never a fabricated $0.
const PENDING = { ...ORANGE, id: 7601, name: 'Pending expenses', data: { ...ORANGE.data, tax: 0, taxStatus: 'missing', ins: 0, insStatus: 'missing' } };
await storage.saveDeals([...storage.getDeals(), PENDING]);
globalThis.reviewDeal(7601);
ok(v('l-tax') === '' && v('l-ins') === '' && ue('l-tax') && ue('l-ins'), 'I5a missing taxes/insurance hydrate BLANK and protected');
globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
ok(v('l-tax') === '', 'I5b …and the market preset cannot fabricate a tax figure into them');
globalThis.analyzeLtr();
ok(ltr.getLastLtrResult().insStatus === 'missing' && ltr.getLastLtrResult().taxStatus === 'missing', 'I5c re-analysis keeps the expenses PENDING (status missing, not explicit_zero)');
globalThis.cancelDealReview('ltr');
// I6 (major): a legacy record without a field resets that field to the analyzer default.
globalThis.reviewDeal(FLIP.id);
ok(v('f-loan') === '150,000' && v('sqft') === '1400', 'I6a financed flip hydrates loan + sqft');
const LEGACY_FLIP = { ...FLIP, id: 7701, name: 'Legacy flip', data: { type: 'flip', addr: '9 Old Rd', ask: 150000, arv: 240000, rep: 20000, hold: 5, cc1: 2, cc2: 5, carry: 900, target: 40000 } };
await storage.saveDeals([...storage.getDeals(), LEGACY_FLIP]);
globalThis.reviewDeal(7701);
ok(v('f-loan') === '' && v('sqft') === '' && v('f-rate') === el('f-rate').defaultValue && v('f-points') === el('f-points').defaultValue && !ue('f-loan') && !ue('f-rate'), `I6b legacy flip resets loan/sqft/rate/points to defaults (loan "${v('f-loan')}", rate "${v('f-rate')}")`);
globalThis.cancelDealReview('flip');
// I7 (major): STR self-manage toggle runs its handler.
const STR_SELF = { ...STR, id: 7801, name: 'Self-managed STR', data: { ...STR.data, pm: 0 } };
await storage.saveDeals([...storage.getDeals(), STR_SELF]);
globalThis.reviewDeal(7801);
ok(el('self-manage-toggle').checked === true && el('self-manage-field').style.display === 'none', 'I7a pm 0 → self-managed: toggle on, PM field hidden');
globalThis.reviewDeal(STR.id);
ok(el('self-manage-toggle').checked === false && el('self-manage-field').style.display !== 'none' && v('v-pm') === '10', 'I7b pm 10 → hired: toggle off, PM field shown with 10');
// I8 (minor): STR preset no longer overwrites a hydrated 0 mgmt / down.
const STR_ZERO = { ...STR, id: 7901, name: 'No platform fee', data: { ...STR.data, mgmt: 0 } };
await storage.saveDeals([...storage.getDeals(), STR_ZERO]);
globalThis.reviewDeal(7901);
globalThis.switchRentalView('str');
ok(v('v-mgmt') === '0', `I8 a hydrated 0% platform fee survives the STR preset (got "${v('v-mgmt')}")`);
globalThis.cancelDealReview('rental');
// I9 (minor): stored 'Multifamily' maps to the 5–8 option through the band sync.
const MF = { ...ORANGE, id: 8001, name: 'Six-plex', data: { ...ORANGE.data, units: 6, ptype: 'Multifamily', band: '5-8', rent: 9500, down: 30 } };
await storage.saveDeals([...storage.getDeals(), MF]);
globalThis.reviewDeal(8001);
ok(v('l-ptype') === '5–8 Unit' && el('l-units').dataset.band === '5-8' && v('l-vac') === '5' && v('l-down') === '30', `I9 6-unit review: ptype "${v('l-ptype')}", band memory 5-8, hydrated vac/down kept`);
globalThis.cancelDealReview('ltr');
// I10 (minor): stale surfaces from a previous analysis are hidden on review.
el('flip-guide').style.display = ''; el('l-band-notice').style.display = 'block'; el('ltr-input-errors').style.display = 'block';
globalThis.reviewDeal(FLIP.id);
ok(el('flip-guide').style.display === 'none', 'I10a flip guide hidden on flip review');
globalThis.reviewDeal(ORANGE.id);
ok(el('l-band-notice').style.display === 'none' && el('ltr-input-errors').style.display === 'none', 'I10b LTR band notice + input-errors box hidden on LTR review');
// I11 (minor): cancel releases the prefill protection (pre-wave preset law resumes).
globalThis.cancelDealReview('ltr');
ok(!ue('l-vac') && !ue('l-rent') && pipeline.getReviewingDealId() === null, 'I11 cancel releases protection');
// I12: pins for the in-flight guard and the delete hook.
const plSrc2 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'pipeline.js'), 'utf8');
ok(/if \(reviewingDealId === reviewing\.id\) reviewingDealId = null;/.test(plSrc2) && /if \(doomed && reviewingDealId === doomed\.id\)/.test(plSrc2), 'I12 in-flight update guard + delete hook present');

// ── §J · owner-paid utilities through the UI: form → engine → save → reopen → review ──
console.log('— §J owner-paid utilities (UI + persistence) —');
globalThis.cancelDealReview('ltr'); globalThis.clearNewDeal('ltr');
ok(v('l-util') === '0' && el('l-util').attrs['data-currency'] !== undefined, 'J1 LTR has an Owner-Paid Utilities money field defaulting to $0');
ok(v('b-util') === '0' && v('v-util') === '0', 'J2 BRRRR and STR carry the same field (shared law)');
const orange2 = { 'l-price': '649900', 'l-rent': '6000', 'l-units': '3', 'l-down': '25', 'l-vac': '7', 'l-tax': '8000', 'l-ins': '2358', 'l-hoa': '0', 'l-maint': '5', 'l-pm': '8', 'l-capex': '5', 'l-rate': '7.25', 'l-amort': '30', 'l-points': '1', 'l-cc': '2', 'l-target': '8' };
for (const [id, val] of Object.entries(orange2)) typed(id, val);
typed('l-addr', '73 Orange Street, Bridgeport, CT 06607');
globalThis.analyzeLtr();
const r0u = ltr.getLastLtrResult();
ok(r0u && r0u.util === 0 && near(r0u.NOI, 47645.2, 0.5) && r0u.dscr.toFixed(2) === '1.19', `J3 zero-utility baseline through the analyzer: NOI ${r0u && r0u.NOI.toFixed(1)}, DSCR ${r0u && r0u.dscr.toFixed(2)}`);
typed('l-util', '1200');
globalThis.analyzeLtr();
const r1u = ltr.getLastLtrResult();
ok(r1u && r1u.util === 1200 && near(r1u.NOI, 47645.2 - 1200, 0.5), `J4 utilities 1,200 → NOI ${r1u && r1u.NOI.toFixed(1)} (dollar-for-dollar through the UI)`);
ok(/Owner-paid utilities/.test(el('ltr-breakdown').innerHTML) && /\$1,200/.test(el('ltr-breakdown').innerHTML), 'J5 breakdown shows the utilities line');
el('ltr-deal-name').value = 'Orange Street — with utilities';
const su = await globalThis.saveDeal('ltr');
const savedU = storage.getDeals().find(d => d.name === 'Orange Street — with utilities');
ok(su.status === 'saved' && savedU && savedU.data.util === 1200, 'J6 save persists the raw utility input');
const payloadU = rpcCalls.filter(c => c.name === 'save_pipeline').pop().args.p_deals.find(d => d.name === 'Orange Street — with utilities');
ok(payloadU && payloadU.data.util === 1200 && near(payloadU.data.NOI, 46445.2, 0.5), 'J7 RPC payload carries util + the utilities-adjusted NOI');
pipeline.renderPipeline();
ok(/Owner-paid utilities<\/span><span class="dv">\$1,200\/yr/.test(el('pipeline-list').innerHTML) && /Utilities \$1,200\/yr/.test(el('pipeline-list').innerHTML), 'J8 expanded card shows the utilities row and the saved-inputs line');
globalThis.reviewDeal(savedU.id);
ok(v('l-util') === '1,200' && ue('l-util'), 'J9 Review & Re-analyze hydrates utilities, protected');
globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
ok(v('l-util') === '1,200', 'J10 market presets cannot overwrite it');
ok(snapshot().includes('"util":1200') && ltr.getLastLtrResult() === null, 'J11 review itself persists nothing and runs no analysis');
globalThis.cancelDealReview('ltr');
// A truly legacy record (saved before the field existed): no util key at all.
const ORANGE_LEGACY = { ...ORANGE, id: 8101, name: 'Legacy Orange (no utilities key)' };
delete ORANGE_LEGACY.data.util;
await storage.saveDeals([...storage.getDeals(), ORANGE_LEGACY]);
globalThis.reviewDeal(8101);
ok(v('l-util') === '0' && !ue('l-util'), `J12 a legacy record without the field hydrates the $0 default (not pending, not an error) (got "${v('l-util')}", ue=${ue('l-util')})`);
globalThis.analyzeLtr();
ok(ltr.getLastLtrResult() && ltr.getLastLtrResult().util === 0, 'J13 legacy re-analysis runs at $0 utilities');
ok(!/Pending/.test(el('lvlabel').textContent) && /Owner-paid utilities<\/span><span class="dv">\$0\/yr/.test((pipeline.renderPipeline(), el('pipeline-list').innerHTML)), 'J13b the legacy card shows Utilities $0/yr, never pending');
ok(F.ltrGuidance(savedU.data).current.util === 1200 && near(F.ltrGuidance(savedU.data).current.NOI, savedU.data.NOI, 1e-6), 'J14 pipeline guidance consumes the saved utility through the same engine');
globalThis.cancelDealReview('ltr');
const shareSrc2 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'share.js'), 'utf8');
const cpSrc2 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'clearpath.js'), 'utf8');
// Contract wave 2026-09-05 (owner dispatch): the CPC URL now ITEMIZES the expense
// as `annualUtilities` (LTR/BRRRR/STR; F&F untouched) — the URL-level proof lives
// in tests/handoffutil.test.mjs. This pin keeps the share/clipboard law and
// confirms the itemization is wired through the one handoff helper only.
ok(/Owner-paid utilities: ' \+ money\(data\.util\)/.test(shareSrc2) && /Owner-Paid Utilities \(annual\): \$/.test(cpSrc2) && (cpSrc2.match(/annualUtilities: utilitiesHandoff\(r\.util\)/g) || []).length === 2, 'J15 share text + clipboard summaries carry the expense; the CPC URL contract itemizes it via utilitiesHandoff (LTR/BRRRR + STR)');

// ── §K · stale-result indicator ──────────────────────────────────────────────
console.log('— §K stale result —');
globalThis.clearNewDeal('ltr');
for (const [id, val] of Object.entries(orange2)) typed(id, val);
globalThis.analyzeLtr();
const bump = (containerId) => el(containerId).dispatchEvent({ type: 'input', isTrusted: true });
ok(!el('ltr-results').classList.contains('is-stale') && el('ltr-stale').style.display === 'none', 'K1 fresh analysis is not stale');
typed('l-vac', '9'); bump('rental-view-ltr');
ok(el('ltr-results').classList.contains('is-stale') && el('ltr-stale').style.display === '', 'K2 changing a material input marks the visible result stale (notice shown)');
ok(ltr.getLastLtrResult().vac === 7 && el('ltr-results').style.display === 'block', 'K3 nothing recalculated, prior result not erased (still the 7% analysis on screen)');
const staleSave = await globalThis.saveDeal('ltr');
ok(staleSave.status === 'refused-stale', 'K4 saving a stale result is refused');
typed('l-vac', '7'); bump('rental-view-ltr');
ok(!el('ltr-results').classList.contains('is-stale'), 'K5 reverting the input by hand un-stales (signature law, not a dirty flag)');
typed('l-util', '500'); bump('rental-view-ltr');
ok(el('ltr-results').classList.contains('is-stale'), 'K6 the utilities field is a material input');
globalThis.analyzeLtr();
ok(!el('ltr-results').classList.contains('is-stale') && ltr.getLastLtrResult().util === 500, 'K7 re-Analyze clears the stale state and produces the current result');
el('l-self-manage-toggle').checked = true; el('rental-view-ltr').dispatchEvent({ type: 'change', isTrusted: true });
ok(el('ltr-results').classList.contains('is-stale'), 'K8 a toggle change marks stale too');
el('l-self-manage-toggle').checked = false; bump('rental-view-ltr');
ok(!el('ltr-results').classList.contains('is-stale'), 'K8b toggling back un-stales');
// Programmatic writers count: an UNTYPED vacancy follows the market preset, so a
// market switch after Analyze changes the form under the result.
globalThis.clearNewDeal('ltr');
delete el('l-vac').dataset.userEdited;          // a fresh session: vacancy never typed
globalThis.switchRentalView('ltr');              // Bridgeport preset fills 7
for (const [id, val] of Object.entries(orange2)) if (id !== 'l-vac') typed(id, val);
ok(v('l-vac') === '7' && !ue('l-vac'), `K9a vacancy is the market preset, not typed (got "${v('l-vac')}", ue=${ue('l-vac')})`);
globalThis.analyzeLtr();
globalThis.handleSlotClick(1, 'charlotte-nc');
ok(v('l-vac') === '5' && el('ltr-results').classList.contains('is-stale'), `K9 a market switch that rewrites an untyped input marks stale (vac now "${v('l-vac')}")`);
globalThis.handleSlotClick(0, 'bridgeport-ct');
ok(v('l-vac') === '7' && !el('ltr-results').classList.contains('is-stale'), 'K10 …and switching back un-stales');
// review-mode coexistence
globalThis.reviewDeal(savedU.id);
ok(!el('ltr-results').classList.contains('is-stale') && el('ltr-stale').style.display === 'none', 'K11 entering a review hides the result and drops the stale watch');
globalThis.analyzeLtr();
typed('l-util', '900'); bump('rental-view-ltr');
const staleUpd = await globalThis.saveDeal('ltr');
ok(staleUpd.status === 'refused-stale' && storage.getDeals().find(d => d.id === savedU.id).data.util === 1200, 'K12 Update Saved Deal is refused while stale; snapshot untouched');
globalThis.analyzeLtr();
const okUpd = await globalThis.saveDeal('ltr');
ok(okUpd.mode === 'updated' && storage.getDeals().find(d => d.id === savedU.id).data.util === 900, 'K13 after re-Analyze the update lands with the current inputs');
// other analyzers share the behaviour
globalThis.reviewDeal(STR.id); globalThis.analyzeRental();
typed('v-occ', '60'); bump('rental-view-str');
ok(el('rental-results').classList.contains('is-stale'), 'K14 STR stale');
globalThis.cancelDealReview('rental');
globalThis.reviewDeal(BRRR.id); globalThis.analyzeBrrr();
typed('b-rent', '2500'); bump('rental-view-brrr');
ok(el('brrr-results').classList.contains('is-stale'), 'K15 BRRRR stale');
globalThis.cancelDealReview('brrr');
globalThis.reviewDeal(FLIP.id); globalThis.analyzeFlip();
typed('f-ask', '195000'); bump('page-flip');
ok(el('flip-results').classList.contains('is-stale'), 'K16 flip stale');
globalThis.cancelDealReview('flip');

// ── §L · numeric-input integrity (badInput → blocking error, never a default) ──
console.log('— §L incomplete numbers —');
globalThis.clearNewDeal('ltr');
for (const [id, val] of Object.entries(orange2)) typed(id, val);
el('l-vac').value = ''; el('l-vac').validity = { badInput: true };     // what a browser reports for "7."
globalThis.analyzeLtr();
ok(ltr.getLastLtrResult() === null && el('ltr-results').style.display === 'none', 'L1 an incomplete vacancy blocks the analysis (no band default stood in)');
el('l-vac').validity = { badInput: false }; typed('l-vac', '7');
globalThis.analyzeLtr();
ok(ltr.getLastLtrResult() && ltr.getLastLtrResult().vac === 7, 'L2 completing the number lets the analysis run at the typed value');
el('l-units').validity = { badInput: true }; el('l-units').value = ''; el('l-units').dispatchEvent({ type: 'input', isTrusted: true });
ok(v('l-vac') === '7' && v('l-pm') === '8', 'L3 a half-typed unit count never fires the band-default rewrite');
el('l-units').validity = { badInput: false }; typed('l-units', '3');
globalThis.reviewDeal(STR.id);
el('v-occ').value = ''; el('v-occ').validity = { badInput: true };
globalThis.analyzeRental();
ok(rental.getLastRentalResult() === null, 'L4 STR: incomplete occupancy blocks (the old code defaulted it to 65)');
el('v-occ').validity = { badInput: false }; globalThis.cancelDealReview('rental');
globalThis.reviewDeal(FLIP.id);
el('f-hold').value = ''; el('f-hold').validity = { badInput: true };
globalThis.analyzeFlip();
ok(flip.getLastFlipResult() === null, 'L5 flip: incomplete hold blocks (the old code defaulted it to 5)');
el('f-hold').validity = { badInput: false }; globalThis.cancelDealReview('flip');
const fmtSrc2 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'format.js'), 'utf8');
const mainSrc2 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
ok(/export function inputIsIncomplete\(el\)/.test(fmtSrc2) && /el\.validity && el\.validity\.badInput/.test(fmtSrc2), 'L6 one shared incomplete-number detector');
ok(/initCurrencyInputs\(\);\n\/\/ User-edited guards/.test(mainSrc2) && mainSrc2.indexOf("['l-down','l-vac','l-pm'") < mainSrc2.indexOf('\nrenderAllSlots();'), 'L7 user-edited guards + currency mask are armed BEFORE the first preset render');
ok(/el\.value !== '' && el\.value !== \(el\.defaultValue == null \? '' : String\(el\.defaultValue\)\)\) el\.dataset\.userEdited = '1';/.test(mainSrc2) && /el\.dataset\.userEdited = '1';\n    \/\/ Format any pre-populated values on init/.test(fmtSrc2), 'L8 a value already differing from the HTML default at arm time is treated as the user\'s');

// ── §M · Clear & New Deal starts a genuinely fresh analyzer state ────────────
console.log('— §M Clear & New Deal —');
globalThis.cancelDealReview('ltr'); globalThis.clearNewDeal('ltr');
for (const [id, val] of Object.entries(orange2)) typed(id, val);
typed('l-vac', '9'); typed('l-pm', '10'); typed('l-util', '1200');
globalThis.analyzeLtr();
ok(ue('l-vac') && ue('l-pm') && ue('l-util') && ue('l-rent') && ltr.getLastLtrResult().vac === 9 && ltr.getLastLtrResult().pm === 10 && ltr.getLastLtrResult().util === 1200, 'M1 custom vacancy / PM / utilities typed, protected, analyzed');
typed('l-vac', '8'); el('rental-view-ltr').dispatchEvent({ type: 'input', isTrusted: true });
ok(el('ltr-results').classList.contains('is-stale'), 'M2 result went stale before the clear');
const beforeClear = snapshot();
globalThis.clearNewDeal('ltr');
ok(!ue('l-vac') && !ue('l-pm') && !ue('l-util') && !ue('l-rent') && !ue('l-tax') && !ue('l-down'), 'M3 every protection flag of the analyzer is released');
ok(v('l-pm') === '8' && v('l-util') === '0' && v('l-down') === '20' && v('l-units') === '1' && v('l-price') === '' && v('l-rent') === '1,750' && v('l-vac') === '7', `M4 fields return to defaults and the normal preset applies again (pm ${v('l-pm')}, util ${v('l-util')}, rent ${v('l-rent')}, vac ${v('l-vac')})`);
ok(!el('ltr-results').classList.contains('is-stale') && el('ltr-stale').style.display === 'none' && pipeline.getReviewingDealId() === null && el('ltr-review-banner').style.display === 'none', 'M5 stale state and review/update mode are cleared');
ok(el('l-units').dataset.band === '1-4', 'M6 band memory re-seeded from the default unit count');
globalThis.handleSlotClick(1, 'charlotte-nc');
ok(v('l-vac') === '5' && v('l-rent') === '1,757', 'M7 the next market preset can write vacancy and rent again (no prior-deal protection)');
globalThis.handleSlotClick(0, 'bridgeport-ct');
typed('l-units', '6');
ok(v('l-pm') === '9' && v('l-maint') === '8' && v('l-capex') === '6', 'M8 the next band change can write its defaults again');
typed('l-units', '1');
ok(snapshot() === beforeClear, 'M9 no saved deal was mutated by the clear');
globalThis.reviewDeal(savedU.id);
ok(v('l-util') === '900' && ue('l-util') && ue('l-vac'), 'M10 Review & Re-analyze still hydrates and protects saved values after a clear');
globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'bridgeport-ct');
ok(v('l-util') === '900', 'M11 …and presets still cannot overwrite hydrated values');
globalThis.cancelDealReview('ltr'); globalThis.clearNewDeal('ltr');
ok(!ue('l-util') && v('l-util') === '0', 'M12 clearing after a review releases the hydrated protection too');
// BRRRR + STR parity of the reset
globalThis.clearNewDeal('brrr'); typed('b-vac', '9'); typed('b-util', '600'); globalThis.clearNewDeal('brrr');
ok(!ue('b-vac') && !ue('b-util') && v('b-vac') === '5' && v('b-util') === '0', 'M13 BRRRR clear releases protection and restores defaults');
globalThis.clearNewDeal('rental'); typed('v-occ', '80'); typed('v-util', '600'); globalThis.clearNewDeal('rental');
ok(!ue('v-occ') && !ue('v-util') && v('v-util') === '0', 'M14 STR clear releases protection and restores defaults');
const mainSrc3 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
ok(/function resetAnalyzerProtection\(type\)/.test(mainSrc3) && /  resetAnalyzerProtection\(type\);\n  \{ const rid = getReviewingDealId\(\);/.test(mainSrc3), 'M15 one shared reset, called from clearNewDeal before the per-type initialization');

// ── §N · adversarial-review correctives (opex wave) ─────────────────────────
console.log('— §N opex-wave correctives —');
globalThis.clearNewDeal('ltr');
for (const [id, val] of Object.entries(orange2)) typed(id, val);
globalThis.analyzeLtr();
ok(ltr.getLastLtrResult() && ltr.getLastLtrResult().vac === 7, 'N1a a good analysis is live');
el('l-units').validity = { badInput: true }; el('l-units').value = '';
globalThis.analyzeLtr();                       // validation abort — no result rendered
el('l-units').validity = { badInput: false }; el('l-units').value = '3';
el('ltr-deal-name').value = 'Abort then save';
const abortSave = await globalThis.saveDeal('ltr');
ok(abortSave.status === 'refused-result' && !storage.getDeals().some(d => d.name === 'Abort then save'), `N1 after a validation abort, Save cannot persist the PRIOR analysis (${abortSave.status})`);
// blank unit count behaves as before (falls through to the 1–4 path) — on a
// fresh form whose % fields are NOT user-typed (band defaults may write them)
globalThis.clearNewDeal('ltr');
typed('l-price', '649900'); typed('l-rent', '6000'); typed('l-tax', '8000'); typed('l-ins', '2358');
typed('l-units', '6');
ok(v('l-pm') === '9' && v('l-maint') === '8', `N2a units 6 applied the 5–8 defaults (pm ${v('l-pm')}, maint ${v('l-maint')})`);
typed('l-units', '');
ok(v('l-pm') === '8' && el('l-units').dataset.band === '1-4', `N2 a genuinely BLANK unit count resets a stale 5–8 state (pm ${v('l-pm')}) — only an incomplete entry is ignored`);
el('l-units').validity = { badInput: true };
el('l-units').dispatchEvent({ type: 'input', isTrusted: true });
ok(v('l-pm') === '8', 'N2b …and an incomplete entry still never fires the band rewrite');
el('l-units').validity = { badInput: false }; typed('l-units', '3');
// flip guide adopt-target re-runs the analysis and must not read as stale
globalThis.reviewDeal(FLIP.id); globalThis.analyzeFlip();
const tBefore = flip.getLastFlipResult().target;
el('fg-adopt').dispatchEvent({ type: 'click', isTrusted: true });
ok(flip.getLastFlipResult() && !el('flip-results').classList.contains('is-stale'), `N3 "Use DealFit midpoint" re-analyzes without a false stale state (target ${tBefore} → ${flip.getLastFlipResult().target})`);
globalThis.cancelDealReview('flip');
const cssSrc = readFileSync(join(ROOT, 'docs', 'src', 'css', 'styles.css'), 'utf8');
ok(/\.results\.is-stale \.btn-get-funding,\.results\.is-stale \.btn-action,\.results\.is-stale \.verdict-whatif,\.results\.is-stale \.whatif-link\{pointer-events:none\}/.test(cssSrc), 'N4 a stale result cannot hand off / share / open guidance until re-analyzed');
ok(F.computeLtr({ price: 100000, rentMo: 1000, vac: 7 }).vac === 7 && F.ltrGuidance({ type: 'ltr', price: 649900, rent: 6000, vac: 7, tax: 8000, ins: 2358 }).current.vac === 7, 'N5 guidance current.vac is a real number');
const mainSrc4 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
ok(/else \{ clearStaleWatch\(type\); CLEAR_RESULT\[type\]\(\); \}/.test(mainSrc4) && /if \(unitsEl && unitsEl\.validity && unitsEl\.validity\.badInput\) return null;/.test(mainSrc4), 'N6 pins: abort invalidates the result; band guard is badInput-only');

// ── §O · stale-numeric lens correctives ─────────────────────────────────────
console.log('— §O stale lens correctives —');
globalThis.clearNewDeal('ltr');
for (const [id, val] of Object.entries(orange2)) typed(id, val);
typed('l-addr', '73 Orange Street, Bridgeport, CT 06607');
globalThis.analyzeLtr();
ok(el('ltr-funding-btn-trigger').disabled === false && el('lv-whatif').disabled === false, 'O1a fresh result: funding trigger + guidance affordance enabled');
typed('l-rent', '4000'); bump('rental-view-ltr');
ok(el('ltr-results').classList.contains('is-stale') && el('ltr-funding-btn-trigger').disabled === true && el('ltr-funding-btn-trigger').getAttribute('aria-disabled') === 'true' && el('lv-whatif').disabled === true, 'O1 while stale, the funding trigger and guidance affordance are DISABLED (keyboard-proof, not CSS-only)');
globalThis.analyzeLtr();
ok(!el('ltr-funding-btn-trigger').disabled && !el('lv-whatif').disabled, 'O1b re-Analyze re-enables them');
typed('l-addr', '99 Other Ave, Stamford, CT'); bump('rental-view-ltr');
ok(el('ltr-results').classList.contains('is-stale'), 'O2 an address edit marks stale (the saved record and handoff carry the Analyze-time address)');
const addrSave = await globalThis.saveDeal('ltr');
ok(addrSave.status === 'refused-stale', 'O2b …so Save is refused until re-analyzed');
typed('l-addr', '73 Orange Street, Bridgeport, CT 06607'); bump('rental-view-ltr');
ok(!el('ltr-results').classList.contains('is-stale'), 'O2c reverting the address un-stales');
const plSrc3 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'pipeline.js'), 'utf8');
ok(/refused-stale, produced by the main\.js Save wrapper/.test(plSrc3), 'O3 the outcome contract comment lists refused-stale');
const mainSrc5 = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
ok(/u\.dataset\.band = propertyBand\(parseNumOpt\(u\.defaultValue != null \? u\.defaultValue : u\.value\)\);\n  if \(propertyBand\(parseNumOpt\(u\.value\)\) !== u\.dataset\.band\) syncBandDefaults\(p\);/.test(mainSrc5), 'O4 an early-typed unit count applies its band defaults once at init (executed in inputguard)');

console.log(`\ndealreview: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
