// ─── Wave A · A1 (2026-09-06): structured City / State on every analyzer ─────
// Owner/GPT ruling: harden the parser, prefer blank over wrong, add editable
// City + State to all four analyzers, auto-fill only when parsing is confident,
// never overwrite a user's explicit edit, include the 9+ referral handoffs.
// Runs the REAL main.js + analyzers + clearpath.js under the inputguard-style DOM
// (only auth / supabase / tiers / intel / install / share / marketSync are
// stubbed). Parser shapes and handoff precedence are pinned in
// tests/handoffutil.test.mjs §13; this suite proves the live form behaviour.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/addrfields.test.mjs
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
const elements = new Map(); const currencyEls = [];
function makeEl(id) {
  const L = {};
  return { id, value: '', textContent: '', innerHTML: '', style: {}, disabled: false, checked: false, dataset: {}, attrs: {}, className: '', parentNode: null, children: [], firstChild: null, validity: { badInput: false },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } }, contains(c) { return this._s.has(c); } },
    setAttribute(n, v) { this.attrs[n] = String(v); }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, removeAttribute(n) { delete this.attrs[n]; }, hasAttribute(n) { return n in this.attrs; },
    addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, removeEventListener() {},
    dispatchEvent(ev) { try { if (!ev.target) ev.target = this; } catch {} (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus() {}, blur() {}, select() {}, scrollIntoView() {}, closest() { return null; }, appendChild(c) { this.children.push(c); return c; },
    insertAdjacentElement() {}, insertAdjacentHTML() {}, before() {}, after() {}, prepend() {}, append() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; } };
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
globalThis.document = { getElementById: el, querySelectorAll: (sel) => sel === '[data-currency]' ? currencyEls.slice() : [], querySelector: () => null, createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), documentElement: makeEl('html'), addEventListener() {}, removeEventListener() {}, activeElement: null };
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.scrollTo = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
for (const [k, val] of Object.entries({ navigator: { userAgent: 'node', standalone: false, clipboard: { writeText: async () => {} } }, location: { hash: '', search: '', href: 'http://localhost/', pathname: '/', origin: 'http://localhost' }, history: { replaceState() {}, pushState() {} } })) { try { Object.defineProperty(globalThis, k, { value: val, configurable: true, writable: true }); } catch {} }
globalThis.alert = () => {};
const store = new Map([['primaryMarket', 'bridgeport-ct'], ['market_2', 'charlotte-nc'], ['hasSelectedMarkets', '1'], ['activeSlot', '0']]);
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); }, clear() { store.clear(); } };
globalThis.showToast = () => {}; globalThis.openUpgrade = () => {}; globalThis.confirm = () => true;
const opened = []; globalThis.open = (u) => { opened.push(String(u)); return null; };

const rental = await import(JS + 'rental.js');
const ltr = await import(JS + 'ltr.js');
await import(JS + 'main.js');
await tick();

const typed = (id, v) => { el(id).value = v; el(id).dispatchEvent({ type: 'input', isTrusted: true }); };
const paramsOf = (u) => Object.fromEntries(new URL(u).searchParams.entries());

console.log('— §A the address auto-fills City / State when the parse is confident —');
typed('v-addr', '6001 S Kings Hwy, Myrtle Beach, SC 29575, USA');
ok(el('v-city').value === 'Myrtle Beach' && el('v-state').value === 'SC', `A1 an Android-style ", USA" address fills City / State (got "${el('v-city').value}" / "${el('v-state').value}")`);
ok(el('v-city').dataset.autoFilled === '1' && el('v-state').dataset.autoFilled === '1' && !el('v-city').dataset.userEdited, 'A2 the fills are marked auto (not user-edited)');
typed('l-addr', '12 Oak Ct');
ok(el('l-city').value === '' && el('l-state').value === '', 'A3 "12 Oak Ct" fills NOTHING — never state CT (prefer blank over wrong)');
typed('l-addr', '12 Oak Ct, Charlotte, NC');
ok(el('l-city').value === 'Charlotte' && el('l-state').value === 'NC', 'A4 …and fills once the address becomes confident');
typed('l-addr', '12 Oak Ct');
ok(el('l-city').value === '' && el('l-state').value === '' && !el('l-city').dataset.autoFilled, 'A5 an auto-fill is withdrawn when the address stops parsing (no stale city left behind)');

console.log('— §B the user\'s own edit is never overwritten —');
typed('v-city', 'North Myrtle Beach');
ok(el('v-city').dataset.userEdited === '1' && !el('v-city').dataset.autoFilled, 'B1 a trusted keystroke marks City user-edited');
typed('v-addr', '100 Ocean Blvd, Charleston, SC 29401');
ok(el('v-city').value === 'North Myrtle Beach', `B2 changing the address does NOT overwrite the user's City (got "${el('v-city').value}")`);
ok(el('v-state').value === 'SC', 'B3 the untouched State still follows the address');
typed('v-state', '');
typed('v-addr', '100 Ocean Blvd, Charleston, SC 29401, USA');
ok(el('v-state').value === '' && el('v-state').dataset.userEdited === '1', 'B4 a deliberately CLEARED State stays cleared through further address edits');
el('b-city').value = 'Prefilled'; el('b-city').dispatchEvent({ type: 'input', isTrusted: false });
typed('b-addr', '77 Birch St, Indianapolis, IN 46201');
ok(el('b-city').value === 'Indianapolis', 'B5 a programmatic (untrusted) write does not claim the field — the address still fills it');

console.log('— §C the STR handoff sends the structured values, not a re-parse —');
typed('v-addr', 'lot 7 near the marina');            // deliberately unparseable
typed('v-city', 'Myrtle Beach'); typed('v-state', 'sc');
typed('v-price', '250,000'); typed('v-rent', '90,000'); el('v-occ').value = '65';
globalThis.analyzeRental();
const rr = rental.getLastRentalResult();
ok(rr && rr.city === 'Myrtle Beach' && rr.state === 'sc', `C1 the STR result stores the typed City / State verbatim (got ${rr && JSON.stringify([rr.city, rr.state])})`);
opened.length = 0; el('rental-funding-btn-trigger').dispatchEvent({ type: 'click' });
ok(opened.length === 1, 'C2 the funding CTA opened a CPC URL');
const pS = opened[0] ? paramsOf(opened[0]) : {};
ok(pS.city === 'Myrtle Beach' && pS.state === 'SC', `C3 the URL carries the typed City and the NORMALIZED State (got ${pS.city} / ${pS.state}) although the address itself does not parse`);
typed('v-city', ''); typed('v-state', '');
elements.delete('rental-funding-btn-trigger');   // a real DOM re-creates the trigger on each render; the fake would accumulate listeners
globalThis.analyzeRental(); opened.length = 0; el('rental-funding-btn-trigger').dispatchEvent({ type: 'click' });
const pS2 = opened[0] ? paramsOf(opened[0]) : {};
ok(opened.length === 1 && !('city' in pS2) && !('state' in pS2), 'C4 cleared fields → no city / state keys (the handoff never re-parses over the user)');

console.log('— §D Clear & New Deal returns the fields to blank and unprotected —');
globalThis.clearNewDeal('rental');
ok(el('v-city').value === '' && el('v-state').value === '' && !el('v-city').dataset.userEdited && !el('v-state').dataset.userEdited && !el('v-city').dataset.autoFilled, 'D1 STR City / State cleared and unprotected');
typed('v-addr', '5 Shore Rd, Wilmington NC 28401');
ok(el('v-city').value === 'Wilmington' && el('v-state').value === 'NC', 'D2 auto-fill works again on the next deal');
globalThis.clearNewDeal('flip'); globalThis.clearNewDeal('ltr'); globalThis.clearNewDeal('brrr');
ok(['f', 'l', 'b'].every(p => el(p + '-city').value === '' && el(p + '-state').value === ''), 'D3 the other three analyzers clear their fields too');

console.log('— §E the 9+ unit referral carries City / State —');
typed('l-addr', '1 Main St, Raleigh, NC 27601, USA'); typed('l-price', '900,000'); typed('l-rent', '9,000'); typed('l-units', '12');
opened.length = 0;
globalThis.analyzeLtr();
el('l-manual-review-btn').dispatchEvent({ type: 'click' });
const pR = opened[0] ? paramsOf(opened[0]) : {};
ok(opened.length === 1 && pR.band === '9plus' && pR.city === 'Raleigh' && pR.state === 'NC', `E1 the 9+ referral URL carries city / state (got ${JSON.stringify({ band: pR.band, city: pR.city, state: pR.state })})`);
ok(ltr.getLastLtrResult() === null, 'E2 the referral is still a referral — no analysis ran');

console.log('— §F source pins —');
{
  const mainSrc = src('docs/src/js/main.js'), plSrc = src('docs/src/js/pipeline.js');
  ok(/\['f-city','city','t'\], \['f-state','state','t'\]/.test(mainSrc) && /\['l-city','city','t'\], \['l-state','state','t'\]/.test(mainSrc) && /\['v-city','city','t'\], \['v-state','state','t'\]/.test(mainSrc) && /\['b-city','city','t'\], \['b-state','state','t'\]/.test(mainSrc), 'F1 REVIEW_FIELDS hydrate City / State for all four analyzers (a record without them resets to blank)');
  ok((plSrc.match(/l: 'Location', v: escapeHtml\(\[d\.city, d\.state\]\.filter\(Boolean\)\.join\(', '\)\)/g) || []).length === 4, 'F2 every pipeline detail shows a Location row when present');
  ok(/ADDRESS_PREFIXES\.forEach\(wireAddressComponents\)/.test(mainSrc) && /if \(el\.dataset\.userEdited\) return;/.test(mainSrc), 'F3 the auto-fill is wired for f / v / l / b and yields to a user edit');
  for (const p of ['f', 'v', 'l', 'b']) ok(new RegExp(`id="${p}-city"[^>]*autocomplete="off"`).test(html) && new RegExp(`id="${p}-state"[^>]*autocapitalize="characters"`).test(html), `F4 ${p}-city / ${p}-state inputs exist with the expected attributes`);
}

console.log(`\naddrfields: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
