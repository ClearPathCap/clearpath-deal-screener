// ─── Wave A · A2 (2026-09-06): STR HOA — monthly input, explicit $0 default ──
// Owner/GPT ruling: STR carries the same HOA input and token semantics as
// LTR / BRRRR, flowing through analysis, save / review, pipeline, share /
// summary and the CPC handoff. This suite runs the REAL rental.js analyzer under
// a minimal DOM (only clearpath.js is stubbed — the handoff itself is proven in
// tests/handoffutil.test.mjs §11) and pins every surface by source.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/strhoa.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} — expected ≈${b}, got ${a}`);

const STUBS = {
  'clearpath.js': `export const maybeShowFundingButton = () => {}; export const getPipelineFundingButtonHTML = () => ''; export const handlePipelineFundingClick = () => {}; export const getFundingLabel = () => '';`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});

// ── Minimal DOM built from the real index.html inputs ────────────────────────
const elements = new Map();
function makeEl(id) {
  const L = {};
  return { id, value: '', textContent: '', innerHTML: '', style: {}, checked: false, dataset: {}, attrs: {}, className: '', parentNode: null,
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
  if (/\btype="checkbox"/.test(attrs)) e.type = 'checkbox';
}
globalThis.document = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), addEventListener() {} };
globalThis.window = globalThis; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const STR = await import(JS + 'strFinance.js');
const rental = await import(JS + 'rental.js');
const FIN = await import(JS + 'finance.js');

console.log('— §A engine: hoa is an annualized operating expense, absent ≡ 0 ─');
{
  const base = { price: 420000, rent: 55000, down: 0.20, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 5500, maint: 3000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675 };
  const f4 = STR.computeStr(base);
  near(f4.noi, 23317.5, 0.5, 'A1 W4-F4 golden NOI unchanged with no hoa argument');
  near(f4.dscr, 0.891632, 0.0001, 'A1 W4-F4 golden DSCR unchanged');
  ok(f4.cls === 'pass' && f4.verdict === 'Thin Margins — Walk Away', 'A1 W4-F4 golden verdict unchanged');
  ok(JSON.stringify(STR.computeStr({ ...base, hoa: 0 })) === JSON.stringify(f4), 'A2 hoa: 0 is byte-identical to no hoa argument (goldens safe)');
  ok(f4.hoa === 0 && f4.hoaYr === 0, 'A3 the result reports hoa 0 / hoaYr 0 by default');
  const h = STR.computeStr({ ...base, hoa: 150 });
  near(h.hoaYr, 1800, 1e-9, 'A4 a $150/mo HOA annualizes to $1,800, exactly once');
  near(f4.noi - h.noi, 1800, 1e-9, 'A5 NOI drops by exactly the annual HOA');
  near(f4.cashflow - h.cashflow, 1800, 1e-9, 'A6 cash flow drops by exactly the annual HOA (debt service unchanged)');
  ok(h.debt === f4.debt && h.loan === f4.loan && h.downAmt === f4.downAmt, 'A7 HOA never touches the loan, payment or cash-to-close');
  ok(h.effRent === f4.effRent && h.platformFee === f4.platformFee && h.pmFee === f4.pmFee, 'A8 HOA never touches revenue or the revenue-based fees');
  const strSrc = src('docs/src/js/strFinance.js');
  ok(/coc >= tgtCoc && capRate >= 6/.test(strSrc) && /coc >= tgtCoc \* 0\.75 && capRate >= 4\.5/.test(strSrc), 'A9 the STR verdict thresholds are untouched');
}

console.log('— §B the analyzer reads v-hoa, charges it once, shows it when positive ─');
const set = (id, v) => { el(id).value = v; };
function run(hoa) {
  set('v-addr', '5 Shore Rd, Wilmington NC 28401'); set('v-price', '250,000'); set('v-rent', '90,000'); set('v-occ', '65'); set('v-down', '20');
  set('v-mgmt', '3'); set('v-pm', '8'); set('v-tax', '5,500'); set('v-maint', '3,000'); set('v-furnish', '15,000'); set('v-target', '6'); set('v-interest-rate', '6.75'); set('v-util', '0');
  set('v-hoa', hoa);
  el('rental-breakdown').innerHTML = ''; el('rental-results').style.display = 'none';
  rental.analyzeRental();
  return rental.getLastRentalResult();
}
{
  const r0 = run('0');
  ok(r0 && r0.hoa === 0, `B1 $0 HOA analyzes with hoa 0 on the result (got ${r0 && r0.hoa})`);
  ok(!/HOA/.test(el('rental-breakdown').innerHTML), 'B2 no HOA breakdown row at $0 (LTR law: shown only when positive)');
  const expect0 = STR.computeStr({ price: 250000, rent: 90000, down: 0.2, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 5500, maint: 3000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675, util: 0, hoa: 0 });
  near(r0.noi, expect0.noi, 1e-9, 'B3 analyzer NOI equals the engine at hoa 0');
  const r150 = run('150');
  ok(r150 && r150.hoa === 150, `B4 a $150 HOA lands on the result as the MONTHLY figure (got ${r150 && r150.hoa})`);
  near(expect0.noi - r150.noi, 1800, 1e-9, 'B5 the analyzer charged $1,800 (150 × 12) exactly once');
  const bd = el('rental-breakdown').innerHTML;
  ok(/HOA \(\$150\/mo\)/.test(bd) && /–\$1,800/.test(bd), `B6 the breakdown shows "HOA ($150/mo) –$1,800" (got: ${bd.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)})`);
  ok(el('rental-results').style.display === 'block', 'B7 results rendered');
  const r1250 = run('1,250');
  ok(r1250 && r1250.hoa === 1250, 'B8 the currency mask format (1,250) reads as 1250');
  set('v-hoa', ''); rental.analyzeRental();
  ok(rental.getLastRentalResult().hoa === 0, 'B9 a cleared HOA field analyzes as 0 (the explicit-zero law, as l-hoa)');
}

console.log('— §C validation: a negative HOA blocks the run ─');
{
  const { errors } = FIN.validateInputs('str', { price: 250000, revenue: 90000, down: 20, occ: 65, mgmt: 3, pm: 8, rate: 6.75, tgtCoc: 6, tax: 5500, maint: 3000, furnish: 15000, hoa: -5 });
  ok(errors.some(e => e.field === 'v-hoa' && /negative/.test(e.message)), 'C1 validateInputs(str) rejects a negative HOA against the v-hoa field');
  const before = rental.getLastRentalResult();
  run('-5');
  ok(rental.getLastRentalResult() === before && el('rental-results').style.display === 'none', 'C2 the analyzer aborts (no compute, results hidden) on a negative HOA');
  ok(!FIN.validateInputs('str', { price: 1, revenue: 1, hoa: 0 }).errors.some(e => e.field === 'v-hoa'), 'C3 hoa 0 passes');
  ok(!FIN.validateInputs('str', { price: 1, revenue: 1 }).errors.some(e => e.field === 'v-hoa'), 'C4 absent hoa passes (legacy callers)');
}

console.log('— §D source pins: every surface the ruling names ─');
{
  const mainSrc = src('docs/src/js/main.js'), plSrc = src('docs/src/js/pipeline.js'), shSrc = src('docs/src/js/share.js'), cpSrc = src('docs/src/js/clearpath.js'), rSrc = src('docs/src/js/rental.js');
  ok(/id="v-hoa"[^>]*value="0"/.test(html), 'D1 index.html: v-hoa ships value="0" (explicit zero default, as l-hoa / b-hoa)');
  ok(/id="l-hoa"[^>]*value="0"/.test(html) && /id="b-hoa"[^>]*value="0"/.test(html), 'D1b LTR / BRRRR defaults unchanged');
  ok(/\['v-hoa','hoa','\$'\]/.test(mainSrc), 'D2 main.js REVIEW_FIELDS.rental hydrates v-hoa from the saved record (Review & Re-analyze)');
  ok(/getElementById\('v-hoa'\); if \(h\) h\.value = '0';/.test(mainSrc), 'D3 Clear & New Deal restores the $0 default');
  ok(/l: 'HOA',\s+v: d\.hoa != null \? fmt\(d\.hoa\) \+ '\/mo' : '—'/.test(plSrc), 'D4 pipeline detail shows the HOA row (legacy records: —)');
  ok(/\(\+x\.hoa > 0\) && 'HOA ' \+ money\(x\.hoa\) \+ '\/mo'/.test(plSrc), 'D5 pipeline "Saved inputs" line carries a positive HOA');
  ok(/if \(data\.hoa > 0\) lines\.push\('HOA: ' \+ money\(data\.hoa\) \+ '\/mo'\)/.test(shSrc), 'D6 share text carries a positive HOA');
  ok(/r\.hoa > 0 \? 'HOA \(monthly\): \$'/.test(cpSrc), 'D7 clipboard summary carries a positive HOA');
  ok(/monthlyHoa: r\.hoa == null \? undefined : Math\.round\(r\.hoa\),\s*\n\s*hoaStatus: hoaBasisHandoff\(r\.hoa\)/.test(cpSrc), 'D8 the STR handoff branch emits monthlyHoa + hoaStatus through the shared hoaBasisHandoff');
  ok(/const hoa\s+= parseComma\(document\.getElementById\('v-hoa'\)\?\.value \|\| '0'\) \|\| 0;/.test(rSrc), 'D9 rental.js reads v-hoa with the same explicit-zero read as v-util');
  ok(/computeStr\(\{ price, rent, down, occ, mgmt, pm, tax, maint, furnish, tgtCoc, interestRate, util, hoa \}\)/.test(rSrc), 'D10 the analyzer passes hoa to the engine');
  ok(/tax, taxStatus: tStat, maint, furnish, util, hoa, tgtCoc, interestRate,/.test(rSrc), 'D11 the saved STR record carries hoa (monthly)');
  const spec = src('CPC_INTEGRATION_SPEC.md');
  ok(/Amendment 2026-09-06 \(Wave A\)/.test(spec) && /now also STR/.test(spec), 'D12 the contract doc names STR as an HOA emitter');
}

console.log(`\nstrhoa: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
