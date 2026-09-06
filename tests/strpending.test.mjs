// ─── Wave A · D3 (2026-09-06): pending STR presentation is explicit, never warm ──
// Owner/GPT ruling: a pending / incomplete STR must not render a warm-looking
// verdict while funding eligibility follows the computed walk-away class. The
// tile now wears a neutral `pending` class with an explicit data-pending marker;
// the saved-card badge does the same for STR. The STR thresholds are untouched.
// Runs the REAL rental.js under a minimal DOM (clearpath.js stubbed).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/strpending.test.mjs
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
for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const opts = [...m[2].matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(o => ({ value: o[1] !== undefined ? o[1] : o[2].trim() }));
  const e = el(id); e.options = opts; e.value = opts.length ? opts[0].value : '';
}
globalThis.document = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), addEventListener() {} };
globalThis.window = globalThis; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const rental = await import(JS + 'rental.js');
const STR = await import(JS + 'strFinance.js');

const set = (id, v) => { el(id).value = v; };
function run(tax, rent = '30,000', price = '500,000') {
  set('v-addr', ''); set('v-price', price); set('v-rent', rent); set('v-occ', '65'); set('v-down', '20');
  set('v-mgmt', '3'); set('v-pm', '8'); set('v-tax', tax); set('v-maint', '3,000'); set('v-furnish', '15,000'); set('v-target', '6'); set('v-interest-rate', '6.75'); set('v-util', '0'); set('v-hoa', '0');
  el('rental-results').style.display = 'none';
  rental.analyzeRental();
  return rental.getLastRentalResult();
}

console.log('— §A a pending STR is explicitly pending, never warm —');
{
  const r = run('');                                            // blank taxes + insurance → F-6 pending
  ok(r && r.cls === 'pass', `A0 fixture: the COMPUTED class is walk-away (got ${r && r.cls}) — the exact mismatch the ruling names`);
  const v = el('rental-verdict');
  ok(v.className === 'verdict pending', `A1 the tile wears the neutral pending class (got "${v.className}") — not warm`);
  ok(v.attrs['data-pending'] === '1', 'A2 an explicit data-pending marker is set');
  ok(el('rvtag').textContent === 'NEEDS TAXES + INSURANCE' && /Add Taxes & Insurance/.test(el('rvlabel').textContent), 'A3 the pending tag / label are the F-6 copy (unchanged)');
  ok(/Pending/.test(el('rental-metrics').innerHTML) && /warn/.test(el('rental-metrics').innerHTML), 'A4 the metric tiles still read Pending (unchanged)');
}

console.log('— §B a complete analysis still wears its real class —');
{
  const rp = run('5,500');
  ok(rp && rp.cls === 'pass' && el('rental-verdict').className === 'verdict pass' && el('rental-verdict').attrs['data-pending'] === '0', 'B1 walk-away renders as pass with data-pending 0');
  const rh = run('5,500', '90,000', '250,000');
  ok(rh && rh.cls === 'hot' && el('rental-verdict').className === 'verdict hot' && el('rental-verdict').attrs['data-pending'] === '0', 'B2 a strong deal renders as hot');
  // Verification corrective 2026-09-06: the first cut's "warm" fixture computed hot; this one is warm
  // (coc ≈ 4.8 % ≥ 0.75 × 6, cap ≈ 7.5 % ≥ 4.5, below the hot bar) and is asserted strictly.
  const rw = run('5,500', '47,000', '250,000');
  ok(rw && rw.cls === 'warm', `B3a fixture: a genuinely WARM deal (got ${rw && rw.cls})`);
  ok(el('rental-verdict').className === 'verdict warm' && el('rental-verdict').attrs['data-pending'] === '0', 'B3 a real warm deal still wears warm (warm is reserved for real verdicts)');
}

console.log('— §C thresholds untouched; pending state derived from the same F-6 rule —');
{
  const strSrc = src('docs/src/js/strFinance.js'), rSrc = src('docs/src/js/rental.js');
  ok(/coc >= tgtCoc && capRate >= 6/.test(strSrc) && /coc >= tgtCoc \* 0\.75 && capRate >= 4\.5/.test(strSrc), 'C1 STR verdict thresholds untouched');
  ok(/const strP = strExpensePresentation\(tStat\);/.test(rSrc), 'C2 pending is still decided by the F-6 combined-field rule');
  ok(!/'verdict ' \+ \(strP \? 'warm'/.test(rSrc), 'C3 the warm-while-pending styling is gone');
  const f4 = STR.computeStr({ price: 420000, rent: 55000, down: 0.20, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 5500, maint: 3000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675 });
  ok(Math.abs(f4.noi - 23317.5) < 0.5 && f4.cls === 'pass', 'C4 W4-F4 golden unchanged');
}

console.log('— §D saved-card badge + CSS —');
{
  const plSrc = src('docs/src/js/pipeline.js'), css = src('docs/src/css/styles.css');
  ok(/badgeCls   = live \? live\.cls : \(insP \? \(d\.type === 'rental' \? 'pending' : 'warm'\) : d\.cls\)/.test(plSrc), 'D1 a pending STR card wears the pending badge; LTR / BRRRR keep the Phase A warm overlay');
  ok(/\.verdict\.pending\{background:rgba\(255,255,255,\.04\);border-color:var\(--border-strong\)\}/.test(css) && /\.verdict\.pending \.vtag\{color:var\(--muted\)\}/.test(css), 'D2 the pending tile is styled neutral (no warn / danger colour)');
  ok(/\.deal-badge\.pending\{background:rgba\(255,255,255,\.04\);color:var\(--text\);border:1px solid var\(--border-strong\)\}/.test(css), 'D3 the pending badge is styled neutral');
  ok(/\.verdict\.warm\{background:var\(--warn-dim\);border-color:var\(--warn\)\}/.test(css), 'D4 the real warm style is untouched');
}

console.log(`\nstrpending: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
