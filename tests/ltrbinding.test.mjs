// ─── LTR input-binding suite — form → engine → result → save → reopen → guidance ──
// Owner hold 2026-09-04 (Orange Street, Bridgeport CT): the live LTR form showed
// Vacancy 7% while the analyzed result read "(5% vacancy) $68,400". Reproduced on
// the live bytes (6dad670): (1) syncBandDefaults fired on EVERY units keystroke and
// rewrote a market-preset vacancy (Tampa 7) to the band default (5) even with no
// band change; (2) typing into a data-currency field never marked it userEdited,
// so every market-slot re-render (sub-tab switch, hydration, slot click) re-preset
// a typed rent/tax. This suite EXECUTES the real ltr.js, main.js (listeners),
// format.js (currency mask), finance.js, markets.js, storage.js and pipeline.js
// under node:module hooks with a DOM stub whose 'input' events actually fire.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/ltrbinding.test.mjs
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

// ── Controllable state ────────────────────────────────────────────────────────
globalThis.__authState = { signedIn: true, email: 'qa@local.test' };
let rpcCalls = [];
globalThis.__rpc = async () => ({ data: null, error: null });
globalThis.__supabaseStub = { rpc: (name, args) => { rpcCalls.push({ name, args: JSON.parse(JSON.stringify(args ?? null)) }); return globalThis.__rpc(name, args); } };
globalThis.__lastResults = { flip: null, rental: null, brrr: null };
globalThis.__tier = 'pro';
globalThis.__activeMarket = 'tampa-fl';
const SLOTS = ['tampa-fl', 'charlotte-nc'];
const LABELS = { 'tampa-fl': 'Tampa, FL', 'charlotte-nc': 'Charlotte, NC' };

// ── Module-boundary stubs. REAL: ltr.js, finance.js, format.js, markets.js,
//    funding.js, insuranceReadiness.js, storage.js, pipeline.js, main.js. ────────
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
  'flip.js': `export const getLastFlipResult = () => globalThis.__lastResults.flip;
    export const analyzeFlip=()=>{},setFlipPreset=()=>{},resetFlip=()=>{},getFlipMarket=()=>({});`,
  'rental.js': `export const getLastRentalResult = () => globalThis.__lastResults.rental;
    export const analyzeRental=()=>{},setRentalPreset=()=>{},resetRental=()=>{};`,
  'brrr.js': `export const getLastBrrrResult = () => globalThis.__lastResults.brrr;
    export const analyzeBrrr=()=>{},setBrrrPreset=()=>{},resetBrrr=()=>{};`,
  'clearpath.js': `export const getPipelineFundingButtonHTML = () => '';
    export const maybeShowFundingButton=()=>{},handlePipelineFundingClick=()=>{};`,
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
  'repair.js': `export const setRepairTier=()=>{},calcRepair=()=>{},useRepairEstimate=()=>{},onSelfRenoToggle=()=>{},updateRepairRangesForMarket=()=>{},repairFieldShouldSelectOnFocus=()=>false,repairEstimateSnapshot=()=>null,repairEstimateSnapshotFor=()=>null;`,
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

// ── DOM stub with WORKING input events ───────────────────────────────────────
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
    dispatchEvent(ev) { ev.target = ev.target || this; (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus() {}, blur() {}, select() {}, scrollIntoView() {}, closest() { return null; }, appendChild(c) { this.children.push(c); return c; },
    insertAdjacentElement() {}, insertAdjacentHTML() {}, before() {}, after() {}, prepend() {}, append() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
  };
}
const el = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
// Mirror index.html: every <input id="…" value="…"> default and every data-currency field.
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
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
for (const [k, val] of Object.entries({
  navigator: { userAgent: 'node', standalone: false, share: undefined },
  location: { hash: '', search: '', href: 'http://localhost/', pathname: '/', origin: 'http://localhost' },
  history: { replaceState() {}, pushState() {} },
})) { try { Object.defineProperty(globalThis, k, { value: val, configurable: true, writable: true }); } catch {} }
globalThis.alert = () => {};
const store = new Map([['primaryMarket', 'tampa-fl'], ['market_2', 'charlotte-nc'], ['hasSelectedMarkets', '1'], ['activeSlot', '0']]);
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); }, clear() { store.clear(); } };
globalThis.showToast = () => {};
globalThis.openUpgrade = () => {};
globalThis.confirm = () => true;

const typed = (id, v) => { const e = el(id); e.value = v; e.dispatchEvent({ type: 'input', isTrusted: true }); return e.value; };
const synthetic = (id, v) => { const e = el(id); e.value = v; e.dispatchEvent({ type: 'input', isTrusted: false }); return e.value; };

const storage  = await import(JS + 'storage.js');
const pipeline = await import(JS + 'pipeline.js');
const ltr      = await import(JS + 'ltr.js');
const F        = await import(JS + 'finance.js');
await import(JS + 'main.js');   // real listeners: userEdited marks, syncBandDefaults, currency mask
await tick();

// A real <input> coerces every .value write to a string; the stub keeps whatever
// type the code wrote (setLtrPreset writes a Number for vacancy) — read as string.
const v = (id) => String(el(id).value);
const ue = (id) => el(id).dataset.userEdited === '1';
const breakdown = () => el('ltr-breakdown').innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ── §A · market preset state after init (Tampa: rent2br 1750, vacancy 0.065 → 7) ──
console.log('— §A preset state (Tampa) —');
ok(v('l-rent') === '1,750', `A1 market preset fills monthly rent 1,750 (got "${v('l-rent')}") — the owner's earlier screenshot`);
ok(v('l-vac') === '7', `A2 market preset fills vacancy 7 (Math.round(6.5)) (got "${v('l-vac')}")`);
ok(v('l-down') === '20' && v('l-units') === '1', 'A3 down 20 / units 1 defaults from index.html');
ok(!ue('l-rent') && !ue('l-vac'), 'A4 programmatic preset writes are NOT user edits');

// ── §B · units keystroke within the same band must not touch the % fields ──────
console.log('— §B units keystroke (1 → 3, still band 1–4) —');
typed('l-units', '3');
ok(v('l-vac') === '7', `B1 vacancy survives a same-band units edit (got "${v('l-vac')}") — live defect: became 5`);
ok(v('l-down') === '20' && v('l-pm') === '8' && v('l-maint') === '5' && v('l-capex') === '5', 'B2 down/pm/maint/capex untouched within the band');
typed('l-units', '2');
ok(v('l-vac') === '7', 'B3 a second same-band edit still leaves vacancy alone');
typed('l-units', '3');

// ── §C · typed dollar values are user edits; the preset never overwrites them ──
console.log('— §C typed currency fields vs market preset re-render —');
typed('l-rent', '6000');
ok(v('l-rent') === '6,000' && ue('l-rent'), `C1 typing rent formats to 6,000 AND marks it user-edited (got "${v('l-rent')}", ue=${ue('l-rent')})`);
typed('l-price', '649900'); typed('l-tax', '7044'); typed('l-ins', '2300'); typed('l-hoa', '0'); typed('l-down', '25');
ok(v('l-price') === '649,900' && v('l-tax') === '7,044' && v('l-ins') === '2,300' && v('l-down') === '25', 'C2 the Orange Street inputs are in the form');
globalThis.switchRentalView('ltr');      // sub-tab switch → renderMarketSlots → setLtrPreset (the live drift trigger)
ok(v('l-rent') === '6,000', `C3 sub-tab round-trip keeps the typed rent (got "${v('l-rent')}") — live defect: reverted to 1,750`);
ok(v('l-tax') === '7,044', `C4 sub-tab round-trip keeps the typed taxes (got "${v('l-tax')}") — live defect: reverted to 6,369`);
ok(v('l-vac') === '7' && v('l-down') === '25', 'C5 vacancy (preset 7) and typed down (25) intact after the re-render');
synthetic('b-hoa', '0');
ok(!ue('b-hoa') && v('b-hoa') === '0', 'C6 a synthetic re-format event (flip.js f-carry pattern) formats but does NOT claim user authorship');
globalThis.handleSlotClick(1, 'charlotte-nc');   // switch active market → renderAllSlots → Charlotte preset (rent2br 1757, vac 5.1 → 5)
ok(v('l-rent') === '6,000' && v('l-tax') === '7,044', 'C7 switching the active market never replaces a typed rent/tax');
ok(v('l-vac') === '5', `C8 an UNtyped vacancy follows the active market by design (Charlotte → 5) (got "${v('l-vac')}")`);
globalThis.handleSlotClick(0, 'tampa-fl');
ok(v('l-vac') === '7', 'C9 …and back to Tampa → 7 (form and market agree; nothing hidden)');

// ── §D · Analyze binds exactly what is in the form (vacancy 7) ─────────────────
console.log('— §D analyze at 7% —');
globalThis.analyzeLtr();
let r = ltr.getLastLtrResult();
ok(r && r.vac === 7, `D1 result-model vacancy = 7 (got ${r && r.vac})`);
ok(r && r.rent === 6000 && r.rentYr === 72000, `D2 result-model rent 6,000/mo → $72,000/yr (got ${r && r.rent})`);
ok(r && near(r.EGI, 66960), `D3 EGI at 7% = $66,960 (got ${r && r.EGI})`);
const NOI7 = 66960 - 66960 * 0.08 - 72000 * 0.05 - 7044 - 2300;
ok(r && near(r.NOI, NOI7, 0.5), `D4 NOI at 7% = ${NOI7.toFixed(2)} (got ${r && r.NOI})`);
ok(/Effective gross income \(7% vacancy\)/.test(breakdown()) && /\$66,960/.test(breakdown()), `D5 rendered row reads "(7% vacancy) $66,960" (got: ${breakdown().slice(0, 140)})`);
const orange7 = { dscr: r.dscr, coc: r.coc, cashFlowYr: r.cashFlowYr, cashFlowMo: r.cashFlowMo, NOI: r.NOI, EGI: r.EGI, verdict: r.verdict, cls: r.cls, mos: r.marginOfSafety };
console.log('  Orange Street @7%: ' + JSON.stringify(orange7));

// ── §E · vacancy 5 stays 5; changing vacancy changes NOI/DSCR ─────────────────
console.log('— §E analyze at 5% (the live numbers) and back —');
typed('l-vac', '5');
globalThis.analyzeLtr(); r = ltr.getLastLtrResult();
ok(r.vac === 5 && near(r.EGI, 68400) && near(r.NOI, 49984, 0.5), `E1 typed 5 → EGI 68,400 / NOI 49,984 — the owner's live result reproduced at 5 (got ${r.EGI} / ${r.NOI})`);
ok(near(r.dscr, 1.253, 0.002), `E2 DSCR 1.25 at 5% (got ${r.dscr})`);
ok(/\(5% vacancy\)/.test(breakdown()) && /\$68,400/.test(breakdown()), 'E3 rendered row reads "(5% vacancy) $68,400"');
const dscr5 = r.dscr, noi5 = r.NOI;
typed('l-vac', '7');
globalThis.analyzeLtr(); r = ltr.getLastLtrResult();
ok(r.vac === 7 && near(r.EGI, 66960) && r.NOI < noi5 && r.dscr < dscr5, `E4 back to 7 → lower NOI/DSCR (${r.NOI.toFixed(0)} / ${r.dscr.toFixed(3)} vs ${noi5.toFixed(0)} / ${dscr5.toFixed(3)})`);
ok(ue('l-vac'), 'E5 a typed vacancy is user-edited (presets and band sync leave it alone from now on)');
globalThis.handleSlotClick(1, 'charlotte-nc'); globalThis.handleSlotClick(0, 'tampa-fl');
ok(v('l-vac') === '7', 'E6 …proven: a market round-trip no longer moves a typed vacancy');

// ── §F · rent follows the submitted value deterministically ───────────────────
console.log('— §F monthly rent 1,750 vs 6,000 —');
typed('l-rent', '1750'); globalThis.analyzeLtr(); r = ltr.getLastLtrResult();
ok(r.rent === 1750 && r.rentYr === 21000, `F1 rent 1,750 → $21,000/yr (got ${r.rent})`);
typed('l-rent', '6000'); globalThis.analyzeLtr(); r = ltr.getLastLtrResult();
ok(r.rent === 6000 && r.rentYr === 72000 && r.vac === 7, `F2 rent 6,000 → $72,000/yr at 7% (got ${r.rent} / ${r.vac})`);
globalThis.switchRentalView('ltr'); globalThis.switchRentalView('ltr');
ok(v('l-rent') === '6,000', 'F3 repeated re-renders never drag a typed rent back to the market default');

// ── §G · save → payload → reopen preserves rent and vacancy ───────────────────
console.log('— §G save / reopen —');
await storage.hydratePipeline();                 // arm the silent-wipe guard (successful round-trip)
el('ltr-deal-name').value = '73 Orange Street — Bridgeport CT';
rpcCalls = [];
const saved = await pipeline.saveDeal('ltr');
ok(saved.status === 'saved', `G1 saveDeal('ltr') → saved (got ${JSON.stringify(saved)})`);
const deal = storage.getDeals().find(d => d.type === 'ltr');
ok(deal && deal.data.vac === 7 && deal.data.rent === 6000, `G2 cached saved deal carries vac 7 / rent 6000 (got ${deal && deal.data.vac} / ${deal && deal.data.rent})`);
const savePayload = rpcCalls.find(c => c.name === 'save_pipeline');
const pd = savePayload && (savePayload.args.p_deals || []).find(d => d.type === 'ltr');
ok(pd && pd.data.vac === 7 && pd.data.rent === 6000 && near(pd.data.EGI, 66960), `G3 the save_pipeline RPC payload carries vac 7 / rent 6000 / EGI 66,960 (got ${pd && JSON.stringify([pd.data.vac, pd.data.rent, pd.data.EGI])})`);
// Reopen: fresh hydrate from the server copy of that payload.
const serverCopy = JSON.parse(JSON.stringify(savePayload.args.p_deals));
storage.clearPipelineCache();
globalThis.__rpc = async (name) => name === 'get_pipeline' ? { data: JSON.parse(JSON.stringify(serverCopy)), error: null } : { data: null, error: null };
await storage.hydratePipeline();
const reopened = storage.getDeals().find(d => d.type === 'ltr');
ok(reopened && reopened.data.vac === 7 && reopened.data.rent === 6000 && near(reopened.data.NOI, NOI7, 0.5), `G4 reopened deal keeps vac 7 / rent 6000 / NOI (got ${reopened && JSON.stringify([reopened.data.vac, reopened.data.rent, reopened.data.NOI])})`);
pipeline.renderPipeline();
const cardHtml = el('pipeline-list').innerHTML;
ok(/\$6,000/.test(cardHtml) && /Long-Term Rental/.test(cardHtml), 'G5 the reopened LTR card shows the analyzed monthly rent $6,000');

// ── §H · LTR Guidance consumes the same canonical rent/vacancy as the result ──
console.log('— §H guidance input —');
if (typeof F.ltrGuidance !== 'function') {
  ok(false, 'H0 ltrGuidance is exported (parity corrective 8d1c4cb)');
} else {
  const gLive = F.ltrGuidance(ltr.getLastLtrResult());
  const gSaved = F.ltrGuidance(reopened.data);
  ok(gLive && near(gLive.current.EGI, r.EGI) && near(gLive.current.NOI, r.NOI) && near(gLive.current.dscr, r.dscr, 1e-9), 'H1 guidance(live result) recomputes the identical EGI/NOI/DSCR (same rent, same vacancy)');
  ok(gSaved && near(gSaved.current.EGI, r.EGI) && near(gSaved.current.NOI, r.NOI) && near(gSaved.current.dscr, r.dscr, 1e-9), 'H2 guidance(reopened deal) recomputes the identical EGI/NOI/DSCR');
  ok(gLive && gLive.verdict === r.verdict && gLive.cls === r.cls, 'H3 guidance verdict equals the analyzer verdict');
  const inp = F.ltrEngineInput(reopened.data);
  ok(inp.vac === 7 && inp.rentMo === 6000, `H4 ltrEngineInput maps saved rent→rentMo and passes vac through untouched (got ${inp.vac} / ${inp.rentMo})`);
}

// ── §I · finance / verdict law unchanged ─────────────────────────────────────
console.log('— §I finance law unchanged —');
const ORANGE = { price: 649900, rentMo: 6000, units: 3, down: 25, tax: 7044, ins: 2300, hoa: 0, maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8 };
const m5 = F.computeLtr({ ...ORANGE, vac: 5 }), m7 = F.computeLtr({ ...ORANGE, vac: 7 }), mU = F.computeLtr({ ...ORANGE });
ok(near(m5.EGI, 68400) && near(m5.NOI, 49984, 0.5) && near(m5.dscr, 1.253, 0.002), 'I1 computeLtr @5%: EGI 68,400 / NOI 49,984 / DSCR 1.25 (owner numbers)');
ok(near(m7.EGI, 66960) && near(m7.NOI, NOI7, 0.5), 'I2 computeLtr @7%: EGI 66,960 = 72,000 × 0.93');
ok(near(mU.EGI, m5.EGI), 'I3 vacancy omitted (user supplied nothing) → the band default 5% still applies — valid defaults preserved');
ok(F.BAND_RULES['1-4'].vac === 5 && F.BAND_RULES['5-8'].vac === 10 && F.BAND_RULES['1-4'].hotDscr === 1.25, 'I4 BAND_RULES untouched');
ok(F.ltrVerdict(m5).verdict === 'Dig Deeper & Negotiate' && F.ltrVerdict(m5).cls === 'warm', 'I5 verdict text/class at the live numbers unchanged');
ok(typeof F.ltrGates === 'function' && F.ltrGates(m5).survives === false, 'I6 ltrGates still reports the failing stress bar (8d1c4cb parity intact)');

// ── §J · band-change law preserved (documented behaviour) + BRRR parity ──────
console.log('— §J band change + BRRR parity —');
typed('l-units', '6');
ok(v('l-pm') === '9' && v('l-maint') === '8' && v('l-capex') === '6', `J1 crossing into 5–8 refreshes band-derived pm/maint/capex (got ${v('l-pm')}/${v('l-maint')}/${v('l-capex')})`);
ok(v('l-vac') === '7' && v('l-down') === '25', 'J2 …but never a field the user typed (vacancy 7, down 25 stay)');
typed('l-units', '3');
ok(v('l-pm') === '8' && v('l-maint') === '5' && v('l-capex') === '5', 'J3 crossing back to 1–4 restores that band\'s defaults for untyped fields');
el('b-vac').value = '7'; delete el('b-vac').dataset.userEdited;   // a preset-style programmatic write
typed('b-units', '3');
ok(v('b-vac') === '7', `J4 BRRR: a same-band units edit leaves a preset vacancy alone (got "${v('b-vac')}")`);
typed('b-units', '6');
ok(v('b-vac') === '10', `J5 BRRR: a real band change applies the 5–8 default (got "${v('b-vac')}")`);
typed('b-rent', '4200');
ok(v('b-rent') === '4,200' && ue('b-rent'), 'J6 BRRR typed rent is user-edited (setBrrrPreset guard now honoured)');

// ── §K · source pins (same-commit law) ───────────────────────────────────────
const mainSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'main.js'), 'utf8');
const fmtSrc  = readFileSync(join(ROOT, 'docs', 'src', 'js', 'format.js'), 'utf8');
ok(/if \(unitsEl && unitsEl\.dataset\.band === band\) return band;/.test(mainSrc) && /u\.dataset\.band = propertyBand\(parseNumOpt\(u\.value\)\);/.test(mainSrc), 'K1 syncBandDefaults is band-change gated and seeded at init');
ok(/if \(!e \|\| e\.isTrusted\) el\.dataset\.userEdited = '1';/.test(fmtSrc), 'K2 the currency mask marks trusted keystrokes user-edited (shared source)');
ok(!/l-vac[\s\S]{0,200}=\s*5\b/.test(readFileSync(join(ROOT, 'docs', 'src', 'js', 'ltr.js'), 'utf8').replace(/BAND_RULES\[band\]\.vac/g, '')), 'K3 ltr.js never hard-forces 5% outside the band default');

console.log(`\nltrbinding: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
