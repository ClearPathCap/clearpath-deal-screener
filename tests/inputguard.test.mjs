// ─── Input-guard timing suite — a keystroke that lands BEFORE main.js runs ───
// Owner wave 2026-09-05, numeric-integrity edge B: on a slow load the user can
// type into a field before the module script has attached its user-edited
// listeners. The law: a recently user-entered value must NEVER silently become
// a materially different underwriting default. The guards (number-field
// listeners + the currency mask) are armed BEFORE the first market-preset
// render and treat a value that already differs from the HTML default as the
// user's. This suite types into the LTR form BEFORE importing the real main.js
// and proves the Bridgeport preset (vacancy 7 / rent 1,750) does not overwrite.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/inputguard.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const tick = () => new Promise(r => setTimeout(r, 0));

globalThis.__authState = { signedIn: false, email: '' };
globalThis.__rpc = async () => ({ data: null, error: null });
globalThis.__supabaseStub = { rpc: (name, args) => globalThis.__rpc(name, args) };
globalThis.__tier = 'starter';
globalThis.__activeMarket = 'bridgeport-ct';
const SLOTS = ['bridgeport-ct', 'charlotte-nc'];
const LABELS = { 'bridgeport-ct': 'Bridgeport, CT', 'charlotte-nc': 'Charlotte, NC' };
const STUBS = {
  'supabaseClient.js': `export const supabase = globalThis.__supabaseStub;`,
  'auth.js': `export const isSignedIn = () => false; export const getUserEmail = () => '';
    const L = []; export const onAuthChange = f => L.push(f);
    export const initAuthAndEntitlement = async () => {}; export const sendOtpCode = async () => ({ ok: true, msg: '' });
    export const verifyOtpCode = async () => ({ ok: true, msg: '' }); export const signOutAccount = async () => {};
    export const redeemServerCode = async () => ({ ok: false, msg: '' }); export const syncEntitlement = async () => 'starter';`,
  'clearpath.js': `export const getPipelineFundingButtonHTML = () => ''; export const maybeShowFundingButton=()=>{},handlePipelineFundingClick=()=>{},getFundingLabel=()=>'';`,
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
  'marketSync.js': `export const hydrateMarketsOnAuth=async()=>({status:'signed-out',pulled:0,pushed:0}), pushMarketChange=async()=>({ok:true,local:true});`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});
const elements = new Map(); const currencyEls = [];
function makeEl(id) {
  const L = {};
  return { id, value: '', textContent: '', innerHTML: '', style: {}, disabled: false, checked: false, dataset: {}, attrs: {}, className: '', parentNode: null, children: [], firstChild: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } }, contains(c) { return this._s.has(c); } },
    setAttribute(n, v) { this.attrs[n] = String(v); }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, removeAttribute(n) { delete this.attrs[n]; }, hasAttribute(n) { return n in this.attrs; },
    addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, removeEventListener() {},
    dispatchEvent(ev) { try { if (!ev.target) ev.target = this; } catch {} (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus() {}, blur() {}, select() {}, scrollIntoView() {}, closest() { return null; }, appendChild(c) { this.children.push(c); return c; },
    insertAdjacentElement() {}, insertAdjacentHTML() {}, before() {}, after() {}, prepend() {}, append() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; } };
}
const el = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
const html = readFileSync(join(ROOT, 'docs', 'index.html'), 'utf8');
for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
  const attrs = m[1]; const id = (attrs.match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id); const v = (attrs.match(/\bvalue="([^"]*)"/) || [])[1]; if (v !== undefined) e.value = v;
  e.defaultValue = v !== undefined ? v : '';
  if (/\bdata-currency\b/.test(attrs)) { e.attrs['data-currency'] = ''; currencyEls.push(e); }
}
globalThis.document = { getElementById: el, querySelectorAll: (sel) => sel === '[data-currency]' ? currencyEls.slice() : [], querySelector: () => null, createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), documentElement: makeEl('html'), addEventListener() {}, removeEventListener() {}, activeElement: null };
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.scrollTo = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
for (const [k, val] of Object.entries({ navigator: { userAgent: 'node', standalone: false, clipboard: { writeText: async () => {} } }, location: { hash: '', search: '', href: 'http://localhost/', pathname: '/', origin: 'http://localhost' }, history: { replaceState() {}, pushState() {} } })) { try { Object.defineProperty(globalThis, k, { value: val, configurable: true, writable: true }); } catch {} }
globalThis.alert = () => {};
const store = new Map([['primaryMarket', 'bridgeport-ct'], ['market_2', 'charlotte-nc'], ['hasSelectedMarkets', '1'], ['activeSlot', '0']]);
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); }, clear() { store.clear(); } };
globalThis.showToast = () => {}; globalThis.openUpgrade = () => {}; globalThis.confirm = () => true; globalThis.open = () => null;

// ── The race: the user has ALREADY typed before main.js runs ─────────────────
el('l-vac').value = '9';          // number field (HTML default 5; Bridgeport preset would write 7)
el('l-rent').value = '4,000';     // currency field (no HTML default; preset would write 1,750)
el('l-down').value = '20';        // untouched default — must stay preset/default-driven
el('b-units').value = '6';        // BRRRR: a 5–8 unit count typed before main.js ran

const ltr = await import(JS + 'ltr.js');
await import(JS + 'main.js');
await tick();

console.log('— §A early keystrokes survive the first preset render —');
ok(el('l-vac').dataset.userEdited === '1', 'A1 a number field that already differed from its HTML default is marked user-edited at arm time');
ok(el('l-vac').value === '9', `A2 the Bridgeport preset (7) did NOT overwrite the early-typed vacancy (got "${el('l-vac').value}")`);
ok(el('l-rent').dataset.userEdited === '1', 'A3 a currency field typed before the mask armed is marked user-edited');
ok(el('l-rent').value === '4,000', `A4 the preset (1,750) did NOT overwrite the early-typed rent (got "${el('l-rent').value}")`);
ok(!el('l-down').dataset.userEdited && el('l-down').value === '20', 'A5 an untouched default is not claimed as a user edit');
ok(el('l-tax').value !== '' || el('l-price').value === '', 'A6 tax preset behaviour unchanged (price-dependent)');

console.log('— §B the analysis binds the early-typed values —');
el('l-price').value = '649,900'; el('l-price').dispatchEvent({ type: 'input', isTrusted: true });
el('l-tax').value = '8,000'; el('l-tax').dispatchEvent({ type: 'input', isTrusted: true });
el('l-ins').value = '2,358'; el('l-ins').dispatchEvent({ type: 'input', isTrusted: true });
globalThis.switchRentalView('ltr');
ok(el('l-vac').value === '9' && el('l-rent').value === '4,000', 'B1 a sub-tab re-render still honours them');
globalThis.analyzeLtr();
const r = ltr.getLastLtrResult();
ok(r && r.vac === 9 && r.rent === 4000, `B2 Analyze ran at vacancy 9 / rent 4,000 (got ${r && r.vac} / ${r && r.rent}) — never the market default`);

console.log('— §C an early-typed unit count gets its band defaults —');
const sv = (id) => String(el(id).value);   // band sync writes Numbers; a browser input coerces to string
ok(el('b-units').value === '6' && el('b-units').dataset.band === '5-8', `C1 BRRRR units typed pre-init is kept and the band memory settled on 5-8 (got ${el('b-units').dataset.band})`);
ok(sv('b-vac') === '10' && sv('b-pm') === '9' && sv('b-maint') === '8' && sv('b-capex') === '6', `C2 the 5–8 defaults were applied once at init (vac ${sv('b-vac')}, pm ${sv('b-pm')}, maint ${sv('b-maint')}, capex ${sv('b-capex')})`);
ok(el('l-units').dataset.band === '1-4' && sv('l-pm') === '8', 'C3 an untouched unit count keeps the 1–4 defaults');

console.log(`\ninputguard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
