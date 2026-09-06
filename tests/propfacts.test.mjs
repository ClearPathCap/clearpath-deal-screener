// ─── Wave A · A4 (2026-09-06): optional Property Type + Unit Count on STR / F&F ──
// Owner/GPT ruling: unknown must remain unknown. Initial UI state blank; the
// analyzer stores null (never SFR / 1); the handoff omits the keys until the
// user supplies them (proven in tests/handoffutil.test.mjs §12); no analyzer
// computation depends on either. This suite runs the REAL rental.js under a
// minimal DOM and pins the flip side and the form by source.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/propfacts.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };

const STUBS = {
  'clearpath.js': `export const maybeShowFundingButton = () => {}; export const getPipelineFundingButtonHTML = () => ''; export const handlePipelineFundingClick = () => {}; export const getFundingLabel = () => '';`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});

const elements = new Map();
function makeEl(id) {
  const L = {};
  return { id, value: '', textContent: '', innerHTML: '', style: {}, checked: false, dataset: {}, attrs: {}, className: '', parentNode: null, validity: { badInput: false },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle() {} },
    setAttribute(n, v) { this.attrs[n] = String(v); }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, removeAttribute(n) { delete this.attrs[n]; },
    addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, dispatchEvent(ev) { (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus() {}, blur() {}, scrollIntoView() {}, closest() { return null; }, appendChild(c) { return c; }, querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; } };
}
const el = (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
const html = src('docs/index.html');
for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
  const attrs = m[1]; const id = (attrs.match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id); const v = (attrs.match(/\bvalue="([^"]*)"/) || [])[1]; if (v !== undefined) e.value = v; e.defaultValue = v !== undefined ? v : '';
}
// selects: first option is the blank "Not specified"
for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const opts = [...m[2].matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(o => ({ value: o[1] !== undefined ? o[1] : o[2].trim() }));
  const e = el(id); e.options = opts; e.value = opts.length ? opts[0].value : '';
}
globalThis.document = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), addEventListener() {} };
globalThis.window = globalThis; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const rental = await import(JS + 'rental.js');
const FIN = await import(JS + 'finance.js');

console.log('— §A form law: blank initial state, no default fact ─');
{
  const strSel = (html.match(/<select id="v-ptype">[\s\S]*?<\/select>/) || [''])[0];
  const flipSel = (html.match(/<select id="f-ptype">[\s\S]*?<\/select>/) || [''])[0];
  ok(/<option value="">Not specified<\/option>/.test(strSel) && strSel.indexOf('<option value="">') < strSel.indexOf('<option>SFR'), 'A1 v-ptype opens on a blank "Not specified" option (unselected state)');
  ok(/<option value="">Not specified<\/option>/.test(flipSel) && flipSel.indexOf('<option value="">') < flipSel.indexOf('<option>SFR'), 'A2 f-ptype opens on a blank "Not specified" option');
  const vUnits = (html.match(/<input[^>]*id="v-units"[^>]*>/) || [''])[0], fUnits = (html.match(/<input[^>]*id="f-units"[^>]*>/) || [''])[0];
  ok(vUnits && !/\bvalue=/.test(vUnits) && /type="number"/.test(vUnits), 'A3 v-units ships with NO value attribute (blank, not 1)');
  ok(fUnits && !/\bvalue=/.test(fUnits) && /type="number"/.test(fUnits), 'A4 f-units ships with NO value attribute (blank, not 1)');
  ok(/id="l-units"[^>]*value="1"/.test(html) && /id="b-units"[^>]*value="1"/.test(html), 'A5 LTR / BRRRR unit defaults are untouched (their law already carries a computational default)');
  ok(el('v-ptype').value === '' && el('v-units').value === '' && el('f-ptype').value === '' && el('f-units').value === '', 'A6 the fake DOM built from index.html starts blank on all four controls');
}

console.log('— §B the STR analyzer stores null for unknown facts, verbatim values otherwise ─');
const set = (id, v) => { el(id).value = v; };
function run(ptype, units) {
  set('v-addr', '5 Shore Rd, Wilmington NC 28401'); set('v-price', '250,000'); set('v-rent', '90,000'); set('v-occ', '65'); set('v-down', '20');
  set('v-mgmt', '3'); set('v-pm', '8'); set('v-tax', '5,500'); set('v-maint', '3,000'); set('v-furnish', '15,000'); set('v-target', '6'); set('v-interest-rate', '6.75'); set('v-util', '0'); set('v-hoa', '0');
  set('v-ptype', ptype); set('v-units', units); el('v-units').validity.badInput = false;
  el('rental-results').style.display = 'none';
  rental.analyzeRental();
  return rental.getLastRentalResult();
}
{
  const r0 = run('', '');
  ok(r0 && r0.ptype === null && r0.units === null, `B1 blank type / units analyze as null on the result (got ${r0 && JSON.stringify([r0.ptype, r0.units])}) — never SFR / 1`);
  ok(el('rental-results').style.display === 'block', 'B2 the analysis still renders (facts are optional)');
  const r1 = run('2–4 Unit', '3');
  ok(r1.ptype === '2–4 Unit' && r1.units === 3, `B3 supplied facts are stored verbatim (got ${JSON.stringify([r1.ptype, r1.units])})`);
  ok(r1.noi === r0.noi && r1.cashflow === r0.cashflow && r1.dscr === r0.dscr && r1.coc === r0.coc && r1.verdict === r0.verdict, 'B4 the STR math is identical with and without the facts (no computation depends on them)');
  const r2 = run('', '1');
  ok(r2.units === 1 && r2.ptype === null, 'B5 a unit count of 1 is stored only because the USER typed it; type stays unknown');
}

console.log('— §C validation only when supplied ─');
{
  const before = rental.getLastRentalResult();
  run('', '0');
  ok(rental.getLastRentalResult() === before && el('rental-results').style.display === 'none', 'C1 units 0 blocks the run (must be 1 or more)');
  run('', '1.5');
  ok(rental.getLastRentalResult() === before, 'C2 units 1.5 blocks the run (whole number)');
  run('', '');                                   // a clean result to compare against
  const settled = rental.getLastRentalResult();
  el('v-units').validity.badInput = true;        // "3." half-typed: the browser reports value '' + badInput
  el('rental-results').style.display = 'none';
  rental.analyzeRental();
  ok(rental.getLastRentalResult() === settled && el('rental-results').style.display === 'none', 'C3 an incomplete numeric entry blocks before any default could stand in');
  el('v-units').validity.badInput = false;
  ok(FIN.validateInputs('str', { price: 1, revenue: 1 }).errors.every(e => e.field !== 'v-units'), 'C4 absent units never error (optional)');
  ok(FIN.validateInputs('flip', { ask: 1, rep: 1, units: 0 }).errors.some(e => e.field === 'f-units'), 'C5 flip: units 0 errors against f-units');
  ok(FIN.validateInputs('flip', { ask: 1, rep: 1 }).errors.every(e => e.field !== 'f-units'), 'C6 flip: absent units never error');
}

console.log('— §D source pins: flip side, review reset, Clear & New Deal, pipeline, summaries ─');
{
  const flipSrc = src('docs/src/js/flip.js'), mainSrc = src('docs/src/js/main.js'), plSrc = src('docs/src/js/pipeline.js'), cpSrc = src('docs/src/js/clearpath.js');
  ok(/const ptype\s+= ptypeEl && ptypeEl\.value \? String\(ptypeEl\.value\)\.trim\(\) : null;/.test(flipSrc) && /const units\s+= unitsEl && unitsEl\.value !== '' && unitsEl\.value != null \? \+unitsEl\.value : null;/.test(flipSrc), 'D1 flip.js reads f-ptype / f-units as null-when-blank');
  ok(/type: 'flip', addr, ask, arv, rep, hold,\s*\n\s*ptype, units,/.test(flipSrc), 'D2 flip.js stores ptype / units on the result');
  ok(!/ptype \|\| 'SFR'/.test(flipSrc) && !/units \|\| 1\b/.test(flipSrc) && !/ptype \|\| 'SFR'/.test(src('docs/src/js/rental.js')), 'D3 neither STR nor flip falls back to SFR / 1 anywhere');
  ok(/\['f-ptype','ptype','sel'\], \['f-units','units','n0'\]/.test(mainSrc) && /\['v-ptype','ptype','sel'\], \['v-units','units','n0'\]/.test(mainSrc), 'D4 REVIEW_FIELDS hydrate the facts (n0: blank when zero / absent)');
  ok(/if \(opts && opts\.includes\(''\)\) el\.value = '';/.test(mainSrc), 'D5 a saved record without the fact resets an optional select to blank (LTR / BRRRR selects untouched)');
  ok(/getElementById\('f-ptype'\); if \(s\) s\.value = ''; const u = document\.getElementById\('f-units'\); if \(u\) u\.value = '';/.test(mainSrc) && /getElementById\('v-ptype'\); if \(s\) s\.value = ''; const u = document\.getElementById\('v-units'\); if \(u\) u\.value = '';/.test(mainSrc), 'D6 Clear & New Deal returns both analyzers to unknown');
  ok((plSrc.match(/\.\.\.\(d\.ptype \? \[\{ l: 'Property type', v: escapeHtml\(String\(d\.ptype\)\) \}\] : \[\]\)/g) || []).length === 2, 'D7 pipeline detail shows the type only when supplied (STR + flip)');
  ok((cpSrc.match(/r\.ptype \? 'Property Type: ' \+ r\.ptype : null/g) || []).length === 2, 'D8 clipboard summaries carry the type only when supplied (STR + flip)');
  ok((cpSrc.match(/r\.units >= 1 \? 'Units: ' \+ r\.units : null/g) || []).length === 2, 'D8b clipboard summaries carry a supplied unit count of 1 too (verification corrective: the URL and the card already did)');
  ok(/function optionalUnitsHandoff/.test(cpSrc) && /function optionalPtypeHandoff/.test(cpSrc) && !/band:\s*(r\.units|propertyBand)[^\n]*A4/.test(cpSrc), 'D9 the handoff helpers exist and no band is emitted for STR / F&F');
}

console.log('— §E the REAL flip analyzer stores null for unknown facts (verification corrective: proven by execution, not by regex) ─');
{
  let flip = null, loadErr = null;
  try { flip = await import(JS + 'flip.js'); } catch (e) { loadErr = String(e); }
  ok(!!flip, `E0 flip.js loads under the fake DOM (${loadErr || 'ok'})`);
  if (flip) {
    const runFlip = (ptype, units) => {
      set('f-addr', '412 Oak St, Charlotte NC'); set('f-ask', '225,000'); set('f-arv', '425,000'); set('f-rep', '75,000'); set('f-hold', '6'); set('f-cc1', '2'); set('f-cc2', '5'); set('f-carry', '900'); set('f-target', '40,000'); set('sqft', ''); set('f-loan', ''); set('f-rate', '10'); set('f-points', '3');
      el('self-reno').checked = false; set('f-ptype', ptype); set('f-units', units); el('f-units').validity.badInput = false;
      el('flip-results').style.display = 'none';
      try { flip.analyzeFlip(); } catch (e) { return { err: String(e) }; }
      return flip.getLastFlipResult();
    };
    const f0 = runFlip('', '');
    ok(f0 && !f0.err && f0.ptype === null && f0.units === null, `E1 blank type / units analyze as null on the flip result (got ${f0 && (f0.err || JSON.stringify([f0.ptype, f0.units]))})`);
    const f1 = runFlip('Condo', '1');
    ok(f1 && !f1.err && f1.ptype === 'Condo' && f1.units === 1, `E2 supplied facts are stored verbatim on the flip result (got ${f1 && (f1.err || JSON.stringify([f1.ptype, f1.units]))})`);
    ok(f0 && f1 && !f0.err && !f1.err && f0.profit === f1.profit && f0.maxOffer === f1.maxOffer && f0.verdict === f1.verdict, 'E3 the flip math is identical with and without the facts');
    const settled = flip.getLastFlipResult();
    el('f-units').validity.badInput = true; el('flip-results').style.display = 'none';
    try { flip.analyzeFlip(); } catch (e) {}
    ok(flip.getLastFlipResult() === settled && el('flip-results').style.display === 'none', 'E4 an incomplete numeric entry blocks the flip run before any default could stand in');
    el('f-units').validity.badInput = false;
  }
}

console.log(`\npropfacts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
