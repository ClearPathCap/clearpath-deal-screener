// ─── DealFit → CPC handoff: itemized owner-paid utilities (contract wave 2026-09-05) ──
// Runs the REAL clearpath.js + funding.js + finance.js + strFinance.js +
// insuranceReadiness.js. Only tiers.js (tier) and storage.js (saved deals) are
// stubbed, so the URL captured here is the byte-for-byte production handoff for a
// given analyzer result — both the analyzer button path (maybeShowFundingButton →
// trigger click) and the pipeline card path (handlePipelineFundingClick).
//
// Contract law under test:
//   1–3. LTR / BRRRR / STR send `annualUtilities` = the RAW annual input;
//   4.   F&F carries no such key (banked 11-key contract intact);
//   5.   zero travels as "0" (monthlyHoa style);
//   6.   negative / NaN / non-finite values are OMITTED, never repaired;
//   7.   a legacy saved record without `util` omits the key (CPC normalizes → $0);
//   8.   screenerNoi is the engine's ALREADY utilities-adjusted NOI, untouched
//        by the handoff layer (never NOI ± util).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/handoffutil.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

globalThis.__tier = 'starter';
globalThis.__deals = [];
const STUBS = {
  'tiers.js': `export const getActiveTier = () => globalThis.__tier;`,
  'storage.js': `export const getDeals = () => globalThis.__deals.slice(); export const PIPELINE_ALLOWANCE = 25;
    export const pipelineHydrationOk = () => true; export const saveDeals = async () => ({ ok: true });
    export const hydratePipeline = async () => {}; export const clearPipelineCache = () => {};`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});

// ── Minimal DOM: elements by id, innerHTML sink, click listeners ──────────────
const els = new Map();
const el = (id) => { if (!els.has(id)) { const L = {}; els.set(id, { id, innerHTML: '', style: {}, addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, fire(t) { (L[t] || []).forEach(f => f({ type: t })); } }); } return els.get(id); };
globalThis.document = { getElementById: el };
globalThis.window = globalThis;
const opened = [];
globalThis.open = (u) => { opened.push(u); return null; };
// Node ≥ 21 exposes a read-only `navigator` getter; define over it.
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true, writable: true });
globalThis.showToast = () => {};

const FIN = await import(JS + 'finance.js');
const STR = await import(JS + 'strFinance.js');
const CP = await import(JS + 'clearpath.js');
const FU = await import(JS + 'funding.js');

const paramsOf = (u) => { const x = new URL(u); return Object.fromEntries(x.searchParams.entries()); };
const keysOf = (u) => [...new URL(u).searchParams.keys()].sort().join(',');
// In a real DOM, innerHTML replacement creates a NEW trigger element each render;
// mirror that by dropping the fake trigger (and its stale listeners) first.
const viaAnalyzer = (r) => { opened.length = 0; const id = r.type === 'rental' ? 'rental-funding-btn' : r.type + '-funding-btn'; els.delete(id + '-trigger'); el(id).innerHTML = ''; CP.maybeShowFundingButton(r); el(id + '-trigger').fire('click'); return opened[0]; };
const viaPipeline = (r, id = 1) => { opened.length = 0; globalThis.__deals = [{ id, type: r.type, data: r, name: 'x' }]; CP.handlePipelineFundingClick(id); return opened[0]; };

// ── Orange Street LTR (12 Orange St, Bridgeport CT) — the regression case ────
const ORANGE_IN = { addr: '12 Orange St, Bridgeport CT 06604', price: 649900, rentMo: 6000, units: 1, vac: 7, tax: 8000, ins: 2358, util: 1200, ptype: 'SFR' };
function ltrResult(inp) {
  const m = FIN.computeLtr(inp);
  const { cls, verdict } = FIN.ltrVerdict(m);
  const band = FIN.propertyBand(inp.units);
  const R = FIN.BAND_RULES[band];
  return {
    type: 'ltr', addr: inp.addr, price: m.price, units: inp.units, band,
    down: inp.down == null ? R.down : inp.down, rent: inp.rentMo, vac: inp.vac == null ? R.vac : inp.vac,
    tax: inp.tax || 0, taxStatus: 'valid', ins: inp.ins || 0, insStatus: 'valid', hoa: inp.hoa || 0,
    ...(inp.util === undefined ? {} : { util: inp.util }),   // legacy records have NO util key
    maint: R.maint, pm: R.pm, capex: R.capex, rate: 7.25, amort: 30, points: 1, cc: 2, ptype: inp.ptype, target: m.target,
    rentYr: m.rentYr, EGI: m.EGI, NOI: m.NOI, capRate: m.capRate, loan: m.loan, debtYr: m.debtYr, capexRes: m.capexRes,
    cashFlowYr: m.cashFlowYr, cashFlowMo: m.cashFlowMo, dscr: m.dscr, downAmt: m.downAmt, cashToClose: m.cashToClose,
    coc: m.coc, onePctRule: m.onePctRule, grm: m.grm, ltv: m.ltv, marginOfSafety: m.marginOfSafety, verdict, cls, hot: cls === 'hot',
  };
}

console.log('— §1 LTR (Orange Street, utilities $1,200) —');
{
  const r = ltrResult(ORANGE_IN);
  ok(r.cls === 'hot' || r.cls === 'warm', `Orange fixture is hot/warm so the CTA renders (got ${r.cls})`);
  const u = viaAnalyzer(r);
  ok(!!u, 'analyzer CTA opened a CPC URL');
  const p = paramsOf(u);
  eq(p.annualUtilities, '1200', '1: LTR handoff carries annualUtilities=1200 (raw annual input)');
  eq(p.screenerNoi, String(Math.round(r.NOI)), '8: screenerNoi is the engine NOI, untouched by the handoff layer');
  eq(Math.round(r.NOI), 46445, 'Orange engine NOI at $1,200 utilities is 46,445 (47,645 − 1,200)');
  ok(p.screenerNoi !== String(Math.round(r.NOI) - 1200) && p.screenerNoi !== String(Math.round(r.NOI) + 1200), '8: screenerNoi is not NOI ± utilities');
  eq(p.screenerDscr, r.dscr.toFixed(2), 'screenerDscr unchanged (engine value)');
  eq(p.monthlyHoa, '0', 'monthlyHoa style reference: 0 travels as "0"');
  eq(p.pp, '649900', 'pp unchanged'); eq(p.loan, '519920', 'loan unchanged'); eq(p.monthlyRent, '6000', 'rent unchanged');
  eq(p.annualTaxes, '8000', 'taxes unchanged'); eq(p.annualInsurance, '2358', 'insurance unchanged'); eq(p.vacancyPct, '7', 'vacancy unchanged');
  eq(p.purpose, 'dscr', 'purpose unchanged'); eq(p.exit, 'hold', 'exit unchanged'); eq(p.city, 'Bridgeport', 'city parsed'); eq(p.state, 'CT', 'state parsed');
  eq(Object.keys(p).length, 33, 'LTR key count is the banked 32 + annualUtilities');
  ok(u.endsWith('#submit'), 'hash #submit retained');
  ok(u.startsWith('https://clearpathcapfunding.com/?src=dealscreener&tier=starter&'), 'origin/src/tier prefix unchanged');
  // Pipeline path produces the identical URL for the same saved data.
  eq(viaPipeline(r), u, 'pipeline card path builds the identical URL');
  // Baseline at $0: screenerNoi 47,645 and annualUtilities "0" (explicit zero travels).
  const r0 = ltrResult({ ...ORANGE_IN, util: 0 });
  const p0 = paramsOf(viaAnalyzer(r0));
  eq(p0.annualUtilities, '0', '5: zero utilities travel as "0" (monthlyHoa style)');
  eq(p0.screenerNoi, '47645', 'Orange baseline screenerNoi 47,645 at $0 utilities');
  eq(Number(p0.screenerNoi) - Number(p.screenerNoi), 1200, 'the $1,200 delta lives in screenerNoi exactly once');
}

console.log('— §2 BRRRR —');
{
  const inp = { addr: '9 Elm St, Raleigh NC 27601', price: 200000, rehab: 40000, arv: 320000, rent: 3200, tax: 2400, ins: 1000, util: 1200, units: 1, ptype: 'SFR' };
  const m = FIN.computeBrrr(inp);
  const { cls, verdict } = FIN.brrrVerdict(m);
  const r = {
    type: 'brrr', addr: inp.addr, units: 1, band: '1-4', price: m.price, rehab: inp.rehab, arv: m.arv,
    contingency: 15, cc: 2, hold: 6, carry: 600, acqLoan: m.acqLoan, acqRate: 10, acqPoints: 2, refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3, season: 6,
    rent: inp.rent, vac: m.vac, tax: inp.tax, taxStatus: 'valid', ins: inp.ins, insStatus: 'valid', hoa: 0, util: inp.util, maint: 5, pm: 8, capex: 5, ptype: 'SFR',
    rehabTotal: m.rehabTotal, allInCost: m.allInCost, cashInvested: m.cashInvested, refiLoan: m.refiLoan, refiCosts: m.refiCosts, cashOut: m.cashOut,
    capitalLeft: m.capitalLeft, cashRecoveredPct: m.cashRecoveredPct, equityCreated: m.equityCreated, NOI: m.NOI, refiDebtYr: m.refiDebtYr, capexRes: m.capexRes,
    cashFlowYr: m.cashFlowYr, cashFlowMo: m.cashFlowMo, dscr: m.dscr, capRate: m.capRate, postRefiCoC: m.postRefiCoC, ltv: m.refiLTVactual / 100,
    marginOfSafety: m.marginOfSafety, verdict, cls, hot: cls === 'hot',
  };
  ok(r.cls === 'hot' || r.cls === 'warm', `BRRRR fixture is hot/warm (got ${r.cls}, dscr ${r.dscr && r.dscr.toFixed(2)})`);
  const u = viaAnalyzer(r);
  ok(!!u, 'BRRRR CTA opened a CPC URL');
  const p = paramsOf(u);
  eq(p.annualUtilities, '1200', '2: BRRRR handoff carries annualUtilities=1200');
  eq(p.screenerNoi, String(Math.round(r.NOI)), '8: BRRRR screenerNoi untouched');
  eq(p.purpose, 'brrr', 'purpose brrr'); eq(p.exit, 'brrr', 'exit brrr');
  eq(viaPipeline(r, 2), u, 'BRRRR pipeline path identical');
}

console.log('— §3 STR —');
{
  const s = STR.computeStr({ price: 400000, rent: 90000, down: 0.2, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 4000, maint: 2000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675, util: 1200 });
  const r = { type: 'rental', addr: '5 Shore Rd, Wilmington NC 28401', price: 400000, down: 20, rent: 90000, occ: 65, mgmt: 3, pm: 8, tax: 4000, taxStatus: 'valid', maint: 2000, furnish: 15000, util: 1200, tgtCoc: 6, interestRate: 0.0675,
    cashflow: s.cashflow, coc: s.coc, capRate: s.capRate, noi: s.noi, debt: s.debt, downAmt: s.downAmt, grm: s.grm, dscr: s.dscr, verdict: s.verdict, cls: 'warm', hot: false };
  const u = viaAnalyzer(r);
  ok(!!u, 'STR CTA opened a CPC URL');
  const p = paramsOf(u);
  eq(p.annualUtilities, '1200', '3: STR handoff carries annualUtilities=1200');
  eq(p.purpose, 'str', 'purpose str'); eq(p.exit, 'hold', 'exit hold');
  eq(keysOf(u), 'addr,annualUtilities,city,exit,loan,pp,purpose,src,state,tier', 'STR key set = banked set + annualUtilities only (no other economics added)');
  eq(viaPipeline(r, 3), u, 'STR pipeline path identical');
  eq(Math.round(s.util), 1200, 'STR engine carried util (canonical expense calc)');
}

console.log('— §4 F&F contract unchanged —');
{
  const r = { type: 'flip', ask: 225000, rep: 75000, arv: 425000, loan: 250000, addr: '412 Oak St, Charlotte NC', verdict: 'Strong Flip', cls: 'hot', hot: true,
    profit: 60000, roi: 20, financed: true, ltv: 58.8, ltc: 83.3, hold: 6, self: false, util: 999 /* deliberately present: F&F must never carry it */ };
  const u = viaAnalyzer(r);
  const p = paramsOf(u);
  eq(p.annualUtilities, undefined, '4: F&F never carries annualUtilities');
  eq(keysOf(u), 'addr,arv,city,exit,loan,pp,purpose,rehab,src,state,tier', '4: F&F keeps the banked 11-key contract exactly');
  eq(Object.keys(p).length, 11, '4: F&F key count 11');
}

console.log('— §5/§6/§7 zero · malformed · legacy —');
{
  const cases = [
    [0, '0', 'explicit 0 travels as "0"'],
    [-500, undefined, '6: negative utilities are omitted, never repaired'],
    [NaN, undefined, '6: NaN utilities omitted'],
    [Infinity, undefined, '6: non-finite utilities omitted'],
    ['1,200', undefined, '6: a non-numeric string is omitted (never coerced)'],
    [1200.6, '1201', 'fractional dollars round like every other money key'],
  ];
  for (const [util, want, label] of cases) {
    const r = ltrResult({ ...ORANGE_IN, util: 0 }); r.util = util;
    const p = paramsOf(viaPipeline(r, 9));
    eq(p.annualUtilities, want, label);
    ok(p.screenerNoi === '47645', `${label}: screenerNoi unaffected by the utilities key rule (engine value)`);
  }
  // Legacy saved record: no util key at all → key omitted; everything else identical.
  const legacy = ltrResult({ ...ORANGE_IN, util: undefined });
  ok(!('util' in legacy), 'legacy fixture has no util key');
  const pl = paramsOf(viaPipeline(legacy, 7));
  eq(pl.annualUtilities, undefined, '7: legacy record omits annualUtilities (CPC normalizes → $0)');
  eq(Object.keys(pl).length, 32, '7: legacy record keeps the banked 32-key LTR shape');
  eq(pl.screenerNoi, '47645', '7: legacy record NOI = $0-utilities engine NOI');
}

console.log('— §8 source pins (contract diff) —');
{
  const fuSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'funding.js'), 'utf8');
  const cpSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'clearpath.js'), 'utf8');
  eq((fuSrc.match(/annualUtilities:'annualUtilities'/g) || []).length, 1, 'funding.js map carries annualUtilities exactly once');
  ok(fuSrc.includes("loanRate:'loanRate', amortYears:'amortYears', pointsPct:'pointsPct', closingPct:'closingPct'"), 'rate/term keys untouched');
  ok(fuSrc.includes("if (v !== undefined && v !== null && v !== '') p.set(param, String(v));"), 'serializer hygiene rule unchanged');
  eq((cpSrc.match(/annualUtilities: utilitiesHandoff\(r\.util\)/g) || []).length, 2, 'clearpath.js wires the field in econHandoff (LTR/BRRRR) and the STR branch — nowhere else');
  const flipBranch = cpSrc.slice(cpSrc.indexOf("if (r.type === 'flip') {"), cpSrc.indexOf("if (r.type === 'ltr') {"));
  ok(!flipBranch.includes('annualUtilities'), 'flip branch carries no utilities key');
  ok(cpSrc.includes('screenerNoi: incomeFields.screenerNoi,'), 'screenerNoi source unchanged (incomeDependentHandoff → round(r.NOI))');
  ok(!/screenerNoi[^\n]*util/.test(cpSrc), 'no expression ever combines screenerNoi with util');
  ok(typeof FU.buildCpcUrl === 'function', 'buildCpcUrl exported');
}

console.log(`\nhandoffutil: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
