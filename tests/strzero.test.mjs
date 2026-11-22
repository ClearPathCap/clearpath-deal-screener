// ─── STR 0% interest-rate correction (2026-11-22, separate from DF-P1) ──────
// Defect (source-verified at b147212): validateInputs allows an STR rate of
// 0–30%, but (1) computeStr's amortization is 0/0 = NaN at 0%, so the monthly
// payment, cash flow and cash-on-cash are NaN and the verdict falls through to
// "Thin Margins — Walk Away"; and (2) the analyzer masked that by silently
// replacing an explicit 0% with the 6.75% default (`+value || 6.75`).
// Fix: a straight-line payment at 0% (the finance.js amortizedPaymentMonthly
// guard) and blank-only defaulting. Every non-zero rate is byte-for-byte the
// old math — pinned by goldens captured from b147212.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/strzero.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const near = (a, b, tol = 1e-9) => Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const STUBS = {
  'clearpath.js': `export const maybeShowFundingButton = () => {}; export const getPipelineFundingButtonHTML = () => ''; export const handlePipelineFundingClick = () => {}; export const getFundingLabel = () => '';`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});

const { computeStr } = await import(JS + 'strFinance.js');
const FIN = await import(JS + 'finance.js');

console.log('— §A engine ─');
const BASE = { price: 300000, rent: 60000, down: 0.25, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 3000, maint: 2000, furnish: 15000, tgtCoc: 6 };
{
  const z = computeStr({ ...BASE, interestRate: 0 });
  ok(near(z.mo, 225000 / 360) && near(z.debt, 225000 / 30), 'A1 0% → straight-line payment loan/360 (was NaN)');
  ok(Number.isFinite(z.cashflow) && Number.isFinite(z.coc) && Number.isFinite(z.dscr) && z.dscr > 0, 'A2 0% → finite cash flow, cash-on-cash and DSCR');
  ok(near(z.mo, FIN.amortizedPaymentMonthly(225000, 0, 30)), 'A3 0% payment equals the shared finance.js amortizer');
  ok(z.cls === 'hot' && z.verdict === 'Strong STR Play', 'A4 0% no longer falls through to "Walk Away" on NaN (this fixture clears the CoC and cap-rate bars)');
  // goldens captured from the unmodified engine at b147212
  const g = computeStr({ ...BASE, interestRate: 0.0675 });
  ok(near(g.mo, 1459.3457172784852) && near(g.dscr, 1.6965365396422192) && near(g.coc, 13.553168214064645) && g.cls === 'hot', 'A5 6.75% golden unchanged from b147212');
  for (const r of [0.0001, 0.03, 0.0675, 0.12, 0.30]) {
    const o = computeStr({ ...BASE, interestRate: r });
    const i = r / 12, f = Math.pow(1 + i, 360);
    ok(o.mo === 225000 * i * f / (f - 1), `A6 rate ${r}: identical expression result (no change to non-zero rates)`);
  }
  const allCash = computeStr({ ...BASE, down: 1, interestRate: 0 });
  ok(allCash.mo === 0 && allCash.debt === 0, 'A7 all-cash at 0% still has no payment');
}

console.log('— §B analyzer reads an explicit 0% as 0% (blank keeps the default) ─');
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
globalThis.document = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), addEventListener() {} };
globalThis.window = globalThis; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const rental = await import(JS + 'rental.js');
const set = (id, v) => { el(id).value = v; };
function run(rate, badInput = false) {
  set('v-addr', '5 Shore Rd, Wilmington NC 28401'); set('v-price', '300,000'); set('v-rent', '60,000'); set('v-occ', '65'); set('v-down', '25');
  set('v-mgmt', '3'); set('v-pm', '8'); set('v-tax', '3,000'); set('v-maint', '2,000'); set('v-furnish', '15,000'); set('v-target', '6'); set('v-util', '0'); set('v-hoa', '0');
  set('v-interest-rate', rate); el('v-interest-rate').validity.badInput = badInput;
  el('rental-results').style.display = 'none';
  rental.analyzeRental();
  return rental.getLastRentalResult();
}
{
  const zero = run('0');
  ok(zero && zero.interestRate === 0 && Number.isFinite(zero.coc) && Number.isFinite(zero.cashflow), 'B1 an entered 0% is used as 0% and computes finitely');
  const blank = run('');
  ok(blank && near(blank.interestRate, 0.0675), 'B2 a blank rate still uses the 6.75% default');
  const typed = run('6.75');
  ok(typed && near(typed.interestRate, 0.0675) && near(typed.coc, blank.coc), 'B3 6.75% typed equals the blank default');
  const prev = rental.getLastRentalResult();
  run('', true);
  ok(rental.getLastRentalResult() === prev && el('rental-results').style.display === 'none', 'B4 a half-typed rate still blocks the run (no default stands in)');
  const high = run('31');
  ok(rental.getLastRentalResult() === prev, 'B5 an out-of-range rate is still refused by validation');
}

console.log(`\nstrzero: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
