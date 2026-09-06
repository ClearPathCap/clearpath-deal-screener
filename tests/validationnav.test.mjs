// ─── Wave A · A6 (2026-09-06): first blocking validation error navigation ───
// Owner/GPT ruling: when Analyze is blocked, the first blocking field must be
// scrolled into useful view, focused where appropriate, keep its visible
// message, expose accessible invalid / error semantics, and every other entered
// value must be preserved. Live Android defect: a required field above the
// viewport was flagged invisibly and nothing appeared to happen.
// Runs the REAL main.js + analyzers under the inputguard-style DOM with focus /
// scroll spies. Both error paths are exercised: required / malformed (main.js
// validateRequiredFields) and range / incomplete (format.js renderInputIssues).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/validationnav.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const tick = () => new Promise(r => setTimeout(r, 0));

globalThis.__tier = 'starter';
const SLOTS = ['bridgeport-ct', 'charlotte-nc'];
const LABELS = { 'bridgeport-ct': 'Bridgeport, CT', 'charlotte-nc': 'Charlotte, NC' };
const STUBS = {
  'supabaseClient.js': `export const supabase = { rpc: async () => ({ data: null, error: null }) };`,
  'auth.js': `export const isSignedIn = () => false; export const getUserEmail = () => '';
    const L = []; export const onAuthChange = f => L.push(f);
    export const initAuthAndEntitlement = async () => {}; export const sendOtpCode = async () => ({ ok: true, msg: '' });
    export const verifyOtpCode = async () => ({ ok: true, msg: '' }); export const signOutAccount = async () => {};
    export const redeemServerCode = async () => ({ ok: false, msg: '' }); export const syncEntitlement = async () => 'starter';`,
  'tiers.js': `export const getActiveTier = () => globalThis.__tier;
    const SLOTS = ${JSON.stringify(SLOTS)}; const LABELS = ${JSON.stringify(LABELS)};
    export const isDevMode=()=>false,setDevTier=()=>{},setCachedTier=()=>{},devModeVisible=()=>false,
    migrateMarketStorage=()=>{},redeemCode=()=>({ok:false}),hasSelectedMarkets=()=>true,
    getMarketSlots=()=>SLOTS.slice(),getMarketForSlot=(i)=>SLOTS[i]||'',setMarketSlot=()=>{},getPrimaryMarket=()=>SLOTS[0],
    getMarket2=()=>SLOTS[1],completePrimarySelection=()=>{},recordSlotChange=()=>{},recordSlotChangeAt=()=>{},clearSlotChange=()=>{},applyServerLock=()=>{},isSlotLocked=()=>false,
    slotLockedUntilDate=()=>null,slotWillLockUntilDate=()=>'',getUnlockedSlotCount=()=>2,
    isMarketUnlocked=()=>true,getMarketLabel=(x)=>LABELS[x]||x,getActiveMarketId=()=>SLOTS[0];`,
  'marketIntel.js': `export const fetchMarketIntel = async () => new Map();`,
  'install.js': `export const openInstall=()=>{},triggerInstall=()=>{},initInstallHint=()=>{};`,
  'share.js': `export const openShareApp=()=>{},shareDeal=()=>{};`,
  'marketSync.js': `export const hydrateMarketsOnAuth=async()=>({status:'signed-out',pulled:0,pushed:0}), pushMarketChange=async()=>({ok:true,local:true});`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});
const elements = new Map(); const currencyEls = []; const created = [];
let docOrder = 0;
function makeEl(id) {
  const L = {}; const wrap = { _msg: null, querySelector(sel) { return sel === '.validation-msg' || sel === '.currency-msg' ? this._msg : null; }, appendChild(c) { this._msg = c; created.push(c); return c; } };
  return { id, value: '', textContent: '', innerHTML: '', style: {}, disabled: false, checked: false, dataset: {}, attrs: {}, className: '', parentNode: null, children: [], firstChild: null, validity: { badInput: false }, _order: docOrder++,
    focusCalls: [], scrollCalls: [],
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } }, contains(c) { return this._s.has(c); } },
    setAttribute(n, v) { this.attrs[n] = String(v); }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, removeAttribute(n) { delete this.attrs[n]; }, hasAttribute(n) { return n in this.attrs; },
    addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, removeEventListener() {},
    dispatchEvent(ev) { try { if (!ev.target) ev.target = this; } catch {} (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus(opts) { this.focusCalls.push(opts || null); globalThis.document.activeElement = this; }, blur() {}, select() {}, scrollIntoView(opts) { this.scrollCalls.push(opts || null); },
    // Spec-accurate document order (verification corrective 2026-09-06): node.compareDocumentPosition(other)
    // describes OTHER relative to NODE — FOLLOWING (4) when other comes after node, PRECEDING (2) before.
    compareDocumentPosition(other) { return other._order > this._order ? 4 : other._order < this._order ? 2 : 0; },
    closest(sel) { return sel === '.field' ? wrap : null; }, appendChild(c) { this.children.push(c); return c; },
    insertAdjacentElement() {}, insertAdjacentHTML() {}, before() {}, after() {}, prepend() {}, append() {}, remove() {},
    querySelector() { return null; },
    // The analyzer containers scope the malformed-currency sweep; mirror that by id prefix.
    querySelectorAll(sel) { if (sel !== '[data-currency]') return []; const pre = { 'page-flip': /^(f-|sqft$)/, 'rental-view-str': /^v-/, 'rental-view-ltr': /^l-/, 'rental-view-brrr': /^b-/ }[this.id]; return pre ? currencyEls.filter(e => pre.test(e.id)) : []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; } };
}
const el = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
const html = src('docs/index.html');
for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
  const attrs = m[1]; const id = (attrs.match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id); const v = (attrs.match(/\bvalue="([^"]*)"/) || [])[1]; if (v !== undefined) e.value = v; e.defaultValue = v !== undefined ? v : '';
  if (/\bdata-currency\b/.test(attrs)) { e.attrs['data-currency'] = ''; currencyEls.push(e); }
}
for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const opts = [...m[2].matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(o => ({ value: o[1] !== undefined ? o[1] : o[2].trim() }));
  const e = el(id); e.options = opts; e.value = opts.length ? opts[0].value : ''; e.tagName = 'SELECT';
}
// Created elements (validation messages, live regions, error boxes) get ids from the code; register them so getElementById finds them.
const createdById = new Map();
globalThis.document = { getElementById: (id) => elements.has(id) ? elements.get(id) : (createdById.get(id) || el(id)), querySelectorAll: (sel) => sel === '[data-currency]' ? currencyEls.slice() : [], querySelector: () => null,
  createElement: t => { const e = makeEl('_' + t + '_' + Math.random()); const proxy = new Proxy(e, { set(o, k, v) { o[k] = v; if (k === 'id' && v) createdById.set(v, proxy); return true; } }); return proxy; },
  body: makeEl('body'), documentElement: makeEl('html'), addEventListener() {}, removeEventListener() {}, activeElement: null };
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.scrollTo = () => {};
globalThis.Node = { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 };   // so main.js's document-order branch is LIVE in this suite
let reducedMotion = false;
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q) ? reducedMotion : false, addEventListener() {}, removeEventListener() {}, addListener() {} });
for (const [k, val] of Object.entries({ navigator: { userAgent: 'node', standalone: false, clipboard: { writeText: async () => {} } }, location: { hash: '', search: '', href: 'http://localhost/', pathname: '/', origin: 'http://localhost' }, history: { replaceState() {}, pushState() {} } })) { try { Object.defineProperty(globalThis, k, { value: val, configurable: true, writable: true }); } catch {} }
globalThis.alert = () => {};
const store = new Map([['primaryMarket', 'bridgeport-ct'], ['market_2', 'charlotte-nc'], ['hasSelectedMarkets', '1'], ['activeSlot', '0']]);
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); }, clear() { store.clear(); } };
globalThis.showToast = () => {}; globalThis.openUpgrade = () => {}; globalThis.confirm = () => true; globalThis.open = () => null;

const rental = await import(JS + 'rental.js');
const FMT = await import(JS + 'format.js');
await import(JS + 'main.js');
await tick();

const typed = (id, v) => { el(id).value = v; el(id).dispatchEvent({ type: 'input', isTrusted: true }); };
const resetSpies = () => { for (const e of elements.values()) { e.focusCalls.length = 0; e.scrollCalls.length = 0; } };
// The fake getElementById auto-creates unknown ids, so the live region lives in `elements`, not `createdById`.
const live = (prefix = 'rental') => (document.getElementById(prefix + '-a11y-status') || {}).textContent || '';

console.log('— §A required path: the first blocking field is revealed, the rest untouched —');
typed('v-rent', '90,000'); typed('v-occ', '65'); typed('v-maint', '3,000'); el('v-price').value = '';
resetSpies();
globalThis.analyzeRental();
{
  const p = el('v-price');
  ok(p.classList.contains('field-error'), 'A1 the field is still marked (existing behaviour retained)');
  ok(p.scrollCalls.length === 1 && p.scrollCalls[0].block === 'center', `A2 scrolled into a useful position (centre) exactly once (got ${JSON.stringify(p.scrollCalls)})`);
  ok(p.focusCalls.length === 1 && p.focusCalls[0] && p.focusCalls[0].preventScroll === true, 'A3 focused without a second scroll');
  ok(p.attrs['aria-invalid'] === 'true', 'A4 aria-invalid exposed');
  ok(p.attrs['aria-describedby'] === 'v-price-error', `A5 aria-describedby points at the visible message (got ${p.attrs['aria-describedby']})`);
  const msg = createdById.get('v-price-error');
  ok(msg && msg.textContent === 'Required — enter Purchase Price', 'A6 the visible message is retained with the id the field references');
  ok(/Required — enter Purchase Price/.test(live()), `A7 announced through the polite live region (got "${live()}")`);
  ok(el('v-rent').value === '90,000' && el('v-occ').value === '65' && el('v-maint').value === '3,000', 'A8 every other entered value preserved');
  ok(el('rental-results').style.display !== 'block', 'A9 no analysis ran');
  ok([...elements.values()].filter(e => e.scrollCalls.length).length === 1, 'A10 no other element was scrolled');
}

console.log('— §B two missing required fields → ONE reveal, the first in form order —');
el('v-price').value = ''; el('v-rent').value = ''; resetSpies();
globalThis.analyzeRental();
ok(el('v-price').scrollCalls.length === 1 && el('v-rent').scrollCalls.length === 0 && el('v-price').focusCalls.length === 1 && el('v-rent').focusCalls.length === 0, 'B1 only the first field (Purchase Price) is revealed; Revenue is marked but not jumped to');
ok(el('v-rent').classList.contains('field-error'), 'B2 the second field still shows its own message');
ok(el('v-price')._order < el('v-rent')._order && typeof el('v-price').compareDocumentPosition === 'function' && typeof Node !== 'undefined', 'B3 (harness) the document-order branch is live: nodes are ordered and Node exists');
ok(el('v-price').attrs['aria-invalid'] === 'true' && !el('v-rent').attrs['aria-invalid'], 'B4 only the revealed field carries aria-invalid (the second is visually marked only)');
// Fix & Flip: three required fields blank → the FIRST (Asking Price), never Repair Costs.
el('f-ask').value = ''; el('f-arv').value = ''; el('f-rep').value = ''; resetSpies();
globalThis.analyzeFlip();
ok(el('f-ask').focusCalls.length === 1 && el('f-arv').focusCalls.length === 0 && el('f-rep').focusCalls.length === 0, `B5 flip with all three required blank reveals f-ask (first in document order), not f-rep (got ask ${el('f-ask').focusCalls.length} / arv ${el('f-arv').focusCalls.length} / rep ${el('f-rep').focusCalls.length})`);
// BRRRR: four required fields blank → b-price.
el('b-price').value = ''; el('b-rehab').value = ''; el('b-arv').value = ''; el('b-rent').value = ''; resetSpies();
globalThis.analyzeBrrr();
ok(el('b-price').focusCalls.length === 1 && el('b-rent').focusCalls.length === 0 && el('b-arv').focusCalls.length === 0, 'B6 BRRRR with all four required blank reveals b-price, not b-rent');

console.log('— §C range path (format.js): the offending field is revealed and the previous marks are cleared —');
typed('v-price', '250,000'); typed('v-rent', '90,000'); typed('v-down', '150'); resetSpies();
globalThis.analyzeRental();
{
  const d = el('v-down'), p = el('v-price');
  ok(d.attrs['aria-invalid'] === 'true' && d.focusCalls.length === 1 && d.scrollCalls.length === 1, 'C1 the out-of-range field is revealed (focus + scroll + aria)');
  ok(d.attrs['aria-describedby'] === 'v-down-issue', `C2 aria-describedby targets the error row in its own id namespace (got ${d.attrs['aria-describedby']})`);
  ok(/id="v-down-issue"/.test(el('rental-input-errors').innerHTML || (createdById.get('rental-input-errors') || {}).innerHTML || ''), 'C3 the error row carries the id');
  ok(!p.attrs['aria-invalid'] && !p.attrs['aria-describedby'], 'C4 the previously-blocking Purchase Price lost its stale aria marks once it passed');
  ok(/Down payment: must be between/.test(live()), `C5 the range error is announced (got "${live()}")`);
  ok(el('v-price').value === '250,000' && el('v-rent').value === '90,000', 'C6 other values preserved');
  // Consecutive BLOCKED runs: the marks describe the current run only.
  typed('v-down', '20'); el('v-rent').value = ''; resetSpies();
  globalThis.analyzeRental();
  ok(!el('v-down').attrs['aria-invalid'] && !el('v-down').attrs['aria-describedby'], 'C7 a field that passed on the next blocked run loses its aria marks (no stale aria-invalid)');
  ok(el('v-rent').attrs['aria-invalid'] === 'true' && el('v-rent').focusCalls.length === 1, 'C8 …and the new blocking field is the only one marked and revealed');
  typed('v-rent', '90,000');
}

console.log('— §C2 pass-2 correctives: stale rows across paths, Clear & New Deal, malformed-mask aria —');
{
  // run N blocks on the RANGE path, run N+1 blocks on the REQUIRED path → the old range row must not linger.
  typed('v-down', '150'); typed('v-price', '250,000'); typed('v-rent', '90,000'); globalThis.analyzeRental();
  ok(/v-down-issue/.test((document.getElementById('rental-input-errors') || {}).innerHTML || ''), 'C9a range row rendered');
  typed('v-down', '20'); el('v-price').value = ''; resetSpies(); globalThis.analyzeRental();
  const boxHtml = (document.getElementById('rental-input-errors') || {}).innerHTML || '';
  ok(!/v-down-issue/.test(boxHtml) && document.getElementById('rental-input-errors').style.display === 'none', 'C9 a required-path block wipes the previous run\'s visible range rows (no stale error for a field that passed)');
  ok(!el('v-down').attrs['aria-invalid'] && el('v-price').attrs['aria-invalid'] === 'true', 'C10 …and its aria marks');
  // Clear & New Deal resets validation state entirely.
  typed('v-price', '250,000'); typed('v-down', '150'); globalThis.analyzeRental();
  globalThis.clearNewDeal('rental');
  ok(!el('v-down').attrs['aria-invalid'] && !el('v-down').attrs['aria-describedby'] && live() === '' && document.getElementById('rental-input-errors').style.display === 'none', 'C11 Clear & New Deal clears the marks, the live region and the error box');
  // A malformed currency field keeps the mask's own aria-invalid even when the reveal's marks are cleared.
  typed('l-price', '12abc'); typed('l-rent', '2,100'); globalThis.analyzeLtr();
  ok(el('l-price').attrs['aria-invalid'] === 'true' && el('l-price').classList.contains('input-invalid'), 'C12 a malformed amount is revealed and the mask flags it');
  el('l-rent').value = ''; globalThis.analyzeLtr();   // still malformed; another field also blocks — the malformed one is first in form order
  ok(el('l-price').attrs['aria-invalid'] === 'true', 'C13 the mask\'s aria-invalid on a still-malformed field survives a later run\'s clear');
  typed('l-price', '260,000'); typed('l-rent', '2,100'); globalThis.analyzeLtr();
  ok(!el('l-price').attrs['aria-invalid'] && !el('l-price').classList.contains('input-invalid'), 'C14 …and goes when the amount is fixed');
  typed('v-price', '250,000'); typed('v-rent', '90,000'); typed('v-down', '20');
}

console.log('— §D a valid run clears everything and analyzes —');
typed('v-down', '20'); resetSpies();
globalThis.analyzeRental();
ok(el('rental-results').style.display === 'block' && rental.getLastRentalResult() !== null, 'D1 the analysis ran');
ok(!el('v-down').attrs['aria-invalid'] && !el('v-down').attrs['aria-describedby'], 'D2 the range field lost its aria marks');
ok(live() === '', 'D3 the live region is emptied');
ok([...elements.values()].every(e => e.id === 'rental-results' || (e.focusCalls.length === 0 && e.scrollCalls.length === 0)), 'D4 a valid run focuses / scrolls no FIELD (the analyzer\'s own results scroll on rental-results is the only movement)');

console.log('— §E reduced motion → instant scroll —');
reducedMotion = true; el('v-price').value = ''; resetSpies();
globalThis.analyzeRental();
ok(el('v-price').scrollCalls.length === 1 && el('v-price').scrollCalls[0].behavior === 'auto', `E1 prefers-reduced-motion uses behavior:auto (got ${JSON.stringify(el('v-price').scrollCalls[0])})`);
reducedMotion = false; typed('v-price', '250,000');

console.log('— §F the same behaviour on the LTR analyzer (shared helper) —');
el('l-price').value = ''; typed('l-rent', '2,100'); resetSpies();
globalThis.analyzeLtr();
ok(el('l-price').focusCalls.length === 1 && el('l-price').scrollCalls.length === 1 && el('l-price').attrs['aria-invalid'] === 'true', 'F1 LTR required path reveals l-price');
ok(live('ltr') === 'Required — enter Purchase Price', `F2 LTR has its own live region (got "${live('ltr')}")`);

console.log('— §G malformed currency is a blocking field too —');
typed('l-price', '12abc'); resetSpies();
globalThis.analyzeLtr();
ok(el('l-price').focusCalls.length === 1 && el('l-price').attrs['aria-invalid'] === 'true' && /valid dollar amount/.test(live('ltr')), `G1 a malformed amount is revealed and announced (got "${live('ltr')}")`);

console.log('— §H pure helper + source pins —');
{
  const fake = makeEl('x-field'); elements.set('x-field', fake);
  ok(FMT.revealBlockingField('x-field', 'msg', 'zz') === true && fake.attrs['aria-invalid'] === 'true' && fake.focusCalls.length === 1, 'H1 revealBlockingField marks, focuses and returns true');
  ok(FMT.revealBlockingField('does-not-exist-' + Math.random(), 'msg', 'zz') === true, 'H2 (fake DOM auto-creates unknown ids — real DOM returns false for a missing field)');
  FMT.clearBlockingMarks('zz'); ok(!fake.attrs['aria-invalid'], 'H3 clearBlockingMarks removes the marks it made');
  const css = src('docs/src/css/styles.css'), fmtSrc = src('docs/src/js/format.js'), mainSrc = src('docs/src/js/main.js');
  ok(/\.sr-only\{position:absolute;width:1px;height:1px/.test(css), 'H4 the live region is visually hidden but present to assistive tech');
  ok(/aria-live', 'polite'/.test(fmtSrc) && /role', 'status'/.test(fmtSrc), 'H5 the live region is polite (no interruption)');
  ok(/revealBlockingField\(errors\[0\]\.field/.test(fmtSrc) && /revealBlockingField\(first\.id, first\.message, prefix\)/.test(mainSrc), 'H6 both error paths reveal through the one shared helper');
  ok(/a\.el\.compareDocumentPosition\(b\.el\) & Node\.DOCUMENT_POSITION_FOLLOWING/.test(mainSrc), 'H8 the document-order comparator reads "b follows a" (operands in spec order)');
  ok(/clearBlockingMarks\(prefix\);\s+\/\/ A6: aria marks describe THIS run only/.test(mainSrc) && /clearBlockingMarks\(prefix\);\s+\/\/ A6: marks describe THIS run only/.test(fmtSrc), 'H9 both paths clear last run\'s marks at the start of a run');
  ok(/id="\$\{x\.field\}-issue"/.test(fmtSrc) && /msg\.id = f\.id \+ '-error'/.test(mainSrc), 'H10 the two message kinds live in distinct id namespaces (-error / -issue) — no duplicate ids');
  ok(/clearBlockingMarks\(type === 'rental' \? 'rental' : type\);\s+\/\/ A6: the rows just wiped/.test(mainSrc), 'H11 entering a review releases the marks with the rows it wipes (no dangling describedby)');
  ok(/clearBlockingMarks\(prefix\); const box = document\.getElementById\(prefix \+ '-input-errors'\); if \(box\) \{ box\.innerHTML = ''; box\.style\.display = 'none'; \}/.test(mainSrc), 'H12 Clear & New Deal resets validation state');
  ok(/contains\('input-invalid'\)\)\) el\.removeAttribute\?\.\('aria-invalid'\)/.test(fmtSrc), 'H13 clearBlockingMarks leaves the currency mask\'s aria-invalid on a still-malformed field');
  ok(/preventScroll: true/.test(fmtSrc) && /block: 'center'/.test(fmtSrc), 'H7 focus never triggers a second scroll; the scroll centres the field');
}

console.log(`\nvalidationnav: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
