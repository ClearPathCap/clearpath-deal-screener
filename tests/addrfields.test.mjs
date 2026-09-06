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
  'auth.js': `export const isSignedIn = () => !!globalThis.__signedIn; export const getUserEmail = () => '';
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

console.log('— §E2 an explicit blank carried by a reviewed record stays blank (verification corrective) —');
// reviewSetField hydrates `city: null` as blank + explicitBlank (proven by source pin F5); the
// auto-fill must honour that marker exactly like userEdited, and Clear & New Deal must release it.
el('b-city').dataset.explicitBlank = '1'; el('b-city').value = ''; delete el('b-city').dataset.userEdited;
typed('b-addr', '77 Birch St, Indianapolis, IN 46201');
ok(el('b-city').value === '' && el('b-state').value === 'IN', 'E2a an explicitly blank City is not resurrected by an address edit (State, untouched, still fills)');
typed('b-city', 'Carmel');
ok(el('b-city').value === 'Carmel' && el('b-city').dataset.userEdited === '1' && !el('b-city').dataset.explicitBlank, 'E2b a real keystroke replaces the explicit-blank marker with user-edited');
el('b-state').dataset.explicitBlank = '1'; globalThis.clearNewDeal('brrr');
ok(!el('b-state').dataset.explicitBlank && !el('b-city').dataset.userEdited, 'E2c Clear & New Deal releases the marker with the rest of the protection');
// pass-2 corrective: the marker must not leak across reviews or survive a review exit.
{
  const mainSrc = src('docs/src/js/main.js');
  ok(/delete el\.dataset\.explicitBlank;\s+\/\/ any other value, or a different record, releases a marker/.test(mainSrc), 'E2d reviewSetField releases a leaked marker when a later record carries a real value');
  ok(/delete el\.dataset\.explicitBlank;\s+\/\/ a record without the key resets fully unprotected/.test(mainSrc), 'E2e reviewResetField releases the marker for a pre-A1 record');
  ok(/if \(el\) \{ delete el\.dataset\.userEdited; delete el\.dataset\.explicitBlank; \}/.test(mainSrc), 'E2f ending or cancelling a review releases the marker (releaseReviewProtection)');
}

console.log('— §E3 "Update Saved Deal" ends the review AND releases the protection (pass-3 corrective, real parser + real storage) —');
{
  const storage = await import(JS + 'storage.js');
  const ltrMod = await import(JS + 'ltr.js');
  globalThis.__signedIn = true;
  await storage.hydratePipeline();
  const LTR_BASE = { type: 'ltr', price: 649900, rent: 6000, units: 3, down: 25, vac: 5, tax: 7044, ins: 2300, hoa: 0, util: 0, maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8, ptype: '2–4 Unit', band: '1-4', taxStatus: 'valid', insStatus: 'valid' };
  const rec = (id, data) => ({ id, name: 'r' + id, type: 'ltr', verdict: 'x', cls: 'warm', notes: '', date: 'Sep 1, 2026', savedAt: '2026-09-01T00:00:00.000Z', data: { ...LTR_BASE, ...data }, stats: [] });
  const A = rec(9001, { addr: '73 Orange Street, Bridgeport, CT 06607', city: null, state: null });
  const B = rec(9002, { addr: '12 Oak Ct, Charlotte, NC 28202', city: 'Charlotte', state: 'NC' });
  const seeded = await storage.saveDeals([A, B]);
  ok(seeded && seeded.ok === true, `E3a two reviewable records seeded (${JSON.stringify(seeded)})`);
  globalThis.clearNewDeal('ltr');
  globalThis.reviewDeal(9001);
  ok(el('l-city').dataset.explicitBlank === '1' && el('l-city').value === '', 'E3b reviewing the cleared record sets the marker');
  globalThis.analyzeLtr();
  const upd = await globalThis.saveDeal('ltr');
  ok(upd && upd.mode === 'updated', `E3c Update Saved Deal lands (${JSON.stringify(upd)})`);
  ok(!el('l-city').dataset.explicitBlank && !el('l-state').dataset.explicitBlank && !el('l-addr').dataset.userEdited, 'E3d …and releases the marker and the review protection');
  typed('l-addr', '900 Beach Blvd, Myrtle Beach, SC 29577');
  ok(el('l-city').value === 'Myrtle Beach' && el('l-state').value === 'SC', `E3e the NEXT property on this form auto-fills again without Clear & New Deal (${el('l-city').value} / ${el('l-state').value})`);
  globalThis.analyzeLtr();
  const r1 = ltrMod.getLastLtrResult();
  ok(r1 && r1.city === 'Myrtle Beach' && r1.state === 'SC', 'E3f …and the analysis (hence the saved record and the CPC handoff) carries the new City / State');
  // The wrong-data variant: a record WITH City / State, updated, then a new property typed.
  globalThis.clearNewDeal('ltr');
  globalThis.reviewDeal(9002);
  ok(el('l-city').value === 'Charlotte' && el('l-city').dataset.userEdited === '1', 'E3g reviewing a record with City / State protects them during the review');
  globalThis.analyzeLtr();
  const upd2 = await globalThis.saveDeal('ltr');
  ok(upd2 && upd2.mode === 'updated', `E3h update lands (${JSON.stringify(upd2)})`);
  typed('l-addr', '900 Beach Blvd, Myrtle Beach, SC 29577');
  ok(el('l-city').value === 'Myrtle Beach' && el('l-state').value === 'SC', `E3i a Myrtle Beach property never inherits "Charlotte, NC" from the previous review (${el('l-city').value} / ${el('l-state').value})`);
  globalThis.analyzeLtr();
  const r2 = ltrMod.getLastLtrResult();
  ok(r2 && r2.city === 'Myrtle Beach' && r2.state === 'SC', 'E3j the analysis carries Myrtle Beach / SC, never the previous record\'s values');
  globalThis.clearNewDeal('ltr'); globalThis.__signedIn = false;
}

console.log('— §F source pins —');
{
  const mainSrc = src('docs/src/js/main.js'), plSrc = src('docs/src/js/pipeline.js');
  ok(/\['f-city','city','t'\], \['f-state','state','t'\]/.test(mainSrc) && /\['l-city','city','t'\], \['l-state','state','t'\]/.test(mainSrc) && /\['v-city','city','t'\], \['v-state','state','t'\]/.test(mainSrc) && /\['b-city','city','t'\], \['b-state','state','t'\]/.test(mainSrc), 'F1 REVIEW_FIELDS hydrate City / State for all four analyzers (a record without them resets to blank)');
  ok((plSrc.match(/l: 'Location', v: escapeHtml\(\[d\.city, d\.state\]\.filter\(Boolean\)\.join\(', '\)\)/g) || []).length === 4, 'F2 every pipeline detail shows a Location row when present');
  ok(/ADDRESS_PREFIXES\.forEach\(wireAddressComponents\)/.test(mainSrc) && /if \(el\.dataset\.userEdited \|\| el\.dataset\.explicitBlank\) return;/.test(mainSrc), 'F3 the auto-fill is wired for f / v / l / b and yields to a user edit or an explicit blank');
  ok(/if \(value === null && \/-\(city\|state\)\$\/\.test\(id\)\) \{ el\.value = ''; el\.dataset\.explicitBlank = '1';/.test(mainSrc), 'F5 review hydration keeps a record\'s explicit null City / State blank AND protected (never resurrected by the parser)');
  ok(/delete el\.dataset\.explicitBlank;\s+\/\/ A1/.test(mainSrc), 'F6 resetAnalyzerProtection releases the marker');
  for (const p of ['f', 'v', 'l', 'b']) ok(new RegExp(`id="${p}-city"[^>]*autocomplete="off"`).test(html) && new RegExp(`id="${p}-state"[^>]*autocapitalize="characters"`).test(html), `F4 ${p}-city / ${p}-state inputs exist with the expected attributes`);
}

console.log(`\naddrfields: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
