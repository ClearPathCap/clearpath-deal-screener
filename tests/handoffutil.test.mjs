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
  eq(p.hoaStatus, 'none', 'LTR handoff states the HOA basis: $0 analyzed → none (contract 2026-09-06)');
  eq(Object.keys(p).length, 34, 'LTR key count is the banked 32 + annualUtilities + hoaStatus');
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
  eq(Object.keys(pl).length, 33, '7: legacy record (no util key) keeps the banked 32-key LTR shape + hoaStatus (its hoa 0 is a confirmed figure)');
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

console.log('— §9 accepted 25%-down Orange Street fixture: the raw assumptions CPC recomputes from (Step 1 parity pins) —');
{
  // Owner ruling 2026-09-05: the accepted live Orange Street case is 25% down
  // (loan 487,425). CPC's operator-basis estimate (clearpath-capital-site,
  // cpcDecision.ts) mirrors incomeBlock + amortizedPaymentMonthly from the raw
  // handoff assumptions; the constants below are the SAME figures its suite pins,
  // so a drift on either side fails here and there.
  const r = ltrResult({ ...ORANGE_IN, down: 25 });
  const p = paramsOf(viaPipeline(r, 25));
  eq(p.loan, '487425', '§9 loan travels as the 25%-down amount');
  eq(p.vacancyPct, '7', '§9 vacancyPct travels raw');   eq(p.pmPct, '8', '§9 pmPct travels raw');
  eq(p.maintPct, '5', '§9 maintPct travels raw');       eq(p.capexPct, '5', '§9 capexPct travels raw');
  eq(p.loanRate, '7.25', '§9 loanRate travels raw');    eq(p.amortYears, '30', '§9 amortYears travels raw');
  eq(p.annualUtilities, '1200', '§9 annualUtilities travels raw');
  eq(p.screenerNoi, '46445', '§9 screenerNoi = engine NOI (context only at CPC)');
  ok(Math.abs(r.NOI - 46445.2) < 1e-6, `§9 engine NOI 46,445.20 (got ${r.NOI})`);
  ok(Math.abs(r.debtYr - 39901.172796766616) < 1e-6, `§9 engine amortizing debt 39,901.17 (got ${r.debtYr})`);
  ok(Math.abs(r.dscr - 1.164005886156902) < 1e-9, `§9 engine DSCR 1.164005886 (got ${r.dscr})`);
  eq(r.dscr.toFixed(2), '1.16', '§9 displayed DSCR 1.16');
  // Closed-form mirror of what CPC ships (EGI − (EGI·pm + rent·maint + tax + ins + hoa + util); P&I on the requested loan).
  const rentYr = 72000, egi = rentYr * (1 - 0.07);
  const mirrorNoi = egi - (egi * 0.08 + rentYr * 0.05 + 8000 + 2358 + 0 + 1200);
  const i = 0.0725 / 12, n = 360, piMo = (487425 * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  ok(Math.abs(mirrorNoi - r.NOI) < 1e-6, '§9 CPC operator-basis NOI formula reproduces the engine NOI exactly');
  ok(Math.abs(piMo * 12 - r.debtYr) < 1e-6, '§9 CPC amortization mirror reproduces the engine debt service exactly');
  ok(Math.abs(r.capexRes - 3600) < 1e-6 && Math.abs((r.NOI - r.debtYr - r.capexRes) - r.cashFlowYr) < 1e-6, '§9 CapEx 3,600 sits BELOW NOI (cash flow only) — the classification CPC preserves');
}

console.log('— §10 HOA basis token (contract 2026-09-06): confirmed zero vs applies vs pre-HOA legacy —');
{
  const base = ltrResult({ ...ORANGE_IN, down: 25, util: 0 });
  const p0 = paramsOf(viaPipeline(base, 30));
  eq(p0.monthlyHoa, '0', '§10 monthlyHoa still travels as "0" (legacy receivers unchanged)');
  eq(p0.hoaStatus, 'none', '§10 [1][2] a $0 HOA analysis states none — confirmed zero, not unknown');
  const r150 = ltrResult({ ...ORANGE_IN, down: 25, util: 0 }); r150.hoa = 150;
  const p150 = paramsOf(viaPipeline(r150, 31));
  eq(p150.monthlyHoa, '150', '§10 [3] positive HOA travels as the monthly amount'); eq(p150.hoaStatus, 'applies', '§10 [3] positive HOA states applies');
  const rNo = ltrResult({ ...ORANGE_IN, down: 25, util: 0 }); delete rNo.hoa;
  const pNo = paramsOf(viaPipeline(rNo, 32));
  eq(pNo.hoaStatus, undefined, '§10 [4][5] a pre-HOA legacy record sends no token (CPC keeps Not sure)'); eq(pNo.monthlyHoa, undefined, '§10 legacy record sends no monthlyHoa either');
  const rNeg = ltrResult({ ...ORANGE_IN, down: 25, util: 0 }); rNeg.hoa = -5;
  eq(paramsOf(viaPipeline(rNeg, 33)).hoaStatus, undefined, '§10 a malformed HOA sends no token (never repaired)');
  const cpSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'clearpath.js'), 'utf8');
  // Wave A · A2 (2026-09-06, same-commit re-pin): the token is now wired in econHandoff
  // (LTR/BRRRR) AND the STR branch — two sites, one helper. F&F still carries none.
  eq((cpSrc.match(/hoaStatus: hoaBasisHandoff\(monthlyHoaHandoff\(r\.hoa\)\)/g) || []).length, 2, '§10 the token is derived from the SHIPPED monthly amount in econHandoff (LTR/BRRRR) and the STR branch — nowhere else');
  eq((cpSrc.match(/monthlyHoa: monthlyHoaHandoff\(r\.hoa\)/g) || []).length, 2, '§10 the monthly amount goes through the one helper at both sites');
  const flipBranch2 = cpSrc.slice(cpSrc.indexOf("if (r.type === 'flip') {"), cpSrc.indexOf("if (r.type === 'ltr') {"));
  ok(!flipBranch2.includes('hoaStatus') && !flipBranch2.includes('monthlyHoa'), '§10 the flip branch carries no HOA keys');
  const rStr = { type: 'rental', addr: '5 Shore Rd, Wilmington NC 28401', price: 400000, down: 20, rent: 90000, util: 0, cls: 'warm', verdict: 'x', coc: 5, capRate: 6, dscr: 1.2, cashflow: 1000 };
  eq(paramsOf(viaPipeline(rStr, 34)).hoaStatus, undefined, '§10 a pre-A2 STR record (no hoa key) carries no HOA token — CPC keeps Not sure');
  eq(paramsOf(viaPipeline(rStr, 34)).monthlyHoa, undefined, '§10 a pre-A2 STR record sends no monthlyHoa either');
}

console.log('— §11 Wave A · A2: STR states its HOA basis (2026-09-06) —');
{
  const strRec = (hoa) => ({ type: 'rental', addr: '5 Shore Rd, Wilmington NC 28401', price: 400000, down: 20, rent: 90000, occ: 65, mgmt: 3, pm: 8, tax: 4000, taxStatus: 'valid', maint: 2000, furnish: 15000, util: 0,
    ...(hoa === undefined ? {} : { hoa }), tgtCoc: 6, interestRate: 0.0675, cls: 'warm', verdict: 'x', coc: 5, capRate: 6, dscr: 1.2, cashflow: 1000 });
  const p0 = paramsOf(viaAnalyzer(strRec(0)));
  eq(p0.hoaStatus, 'none', '§11 [A2] a $0-HOA STR analysis states none (confirmed zero — the explicit default)');
  eq(p0.monthlyHoa, '0', '§11 [A2] monthlyHoa travels as "0" (same wire as LTR/BRRRR)');
  eq(keysOf(viaAnalyzer(strRec(0))), 'addr,annualUtilities,city,exit,hoaStatus,loan,monthlyHoa,pp,purpose,src,state,tier', '§11 [A2] STR key set = banked 10 + monthlyHoa + hoaStatus, nothing else');
  const p150 = paramsOf(viaPipeline(strRec(150), 40));
  eq(p150.hoaStatus, 'applies', '§11 [A2] a positive STR HOA states applies'); eq(p150.monthlyHoa, '150', '§11 [A2] the monthly amount travels (CPC converts ×12 once)');
  eq(viaPipeline(strRec(150), 40), viaAnalyzer(strRec(150)), '§11 [A2] analyzer and pipeline paths build the identical STR URL');
  eq(paramsOf(viaPipeline(strRec(-9), 41)).hoaStatus, undefined, '§11 [A2] a malformed STR HOA sends no token (never repaired)');
  // Verification corrective 2026-09-06: the amount and the token derive from one figure.
  ok(!('monthlyHoa' in paramsOf(viaPipeline(strRec(-9), 41))), '§11 [A2] a negative STR HOA sends no monthlyHoa either (no "-9" beside an omitted token)');
  ok(!('monthlyHoa' in paramsOf(viaPipeline(strRec('abc'), 43))) && !('hoaStatus' in paramsOf(viaPipeline(strRec('abc'), 43))), '§11 [A2] a non-numeric saved HOA ships neither key (never "NaN")');
  const pFrac = paramsOf(viaPipeline(strRec(0.4), 44)); eq(pFrac.monthlyHoa, '0', '§11 [A2] a sub-dollar HOA rounds to "0"'); eq(pFrac.hoaStatus, 'none', '§11 [A2] …and the token agrees with the shipped amount (none, not applies)');
  const pR = paramsOf(viaPipeline(strRec(149.6), 45)); eq(pR.monthlyHoa, '150', '§11 [A2] a fractional HOA rounds to "150"'); eq(pR.hoaStatus, 'applies', '§11 [A2] …with applies');
  const lNeg = ltrResult({ ...ORANGE_IN, down: 25, util: 0 }); lNeg.hoa = -5;
  ok(!('monthlyHoa' in paramsOf(viaPipeline(lNeg, 46))), '§11 [A2] the same law now holds for LTR / BRRRR: a negative saved HOA ships no amount');
  const pLegacy = paramsOf(viaPipeline(strRec(undefined), 42));
  eq(pLegacy.hoaStatus, undefined, '§11 [A2] legacy STR record: no token'); eq(keysOf(viaPipeline(strRec(undefined), 42)), 'addr,annualUtilities,city,exit,loan,pp,purpose,src,state,tier', '§11 [A2] legacy STR key set is byte-identical to the pre-A2 contract');
  const s150 = STR.computeStr({ price: 400000, rent: 90000, down: 0.2, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 4000, maint: 2000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675, util: 0, hoa: 150 });
  const s0 = STR.computeStr({ price: 400000, rent: 90000, down: 0.2, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 4000, maint: 2000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675, util: 0 });
  ok(Math.abs((s0.noi - s150.noi) - 1800) < 1e-9, '§11 [A2] the engine charges HOA exactly once, annualized (150 × 12 = 1,800 off NOI)');
}

console.log('— §12 Wave A · A4: optional property facts on STR / F&F — unknown stays unknown —');
{
  const strRec = (extra) => ({ type: 'rental', addr: '5 Shore Rd, Wilmington NC 28401', price: 400000, down: 20, rent: 90000, occ: 65, mgmt: 3, pm: 8, tax: 4000, taxStatus: 'valid', maint: 2000, furnish: 15000, util: 0, hoa: 0,
    tgtCoc: 6, interestRate: 0.0675, cls: 'warm', verdict: 'x', coc: 5, capRate: 6, dscr: 1.2, cashflow: 1000, ...extra });
  const flipRec = (extra) => ({ type: 'flip', ask: 225000, rep: 75000, arv: 425000, loan: 250000, addr: '412 Oak St, Charlotte NC', verdict: 'Strong Flip', cls: 'hot', hot: true, profit: 60000, roi: 20, financed: true, hold: 6, self: false, ...extra });
  // Blank facts (the analyzer stores null) → no keys, never a default.
  const pS = paramsOf(viaAnalyzer(strRec({ ptype: null, units: null })));
  ok(!('ptype' in pS) && !('units' in pS) && !('band' in pS), '§12 [A4] STR with unknown type / units sends no ptype, units or band (never SFR / 1)');
  eq(keysOf(viaAnalyzer(strRec({ ptype: null, units: null }))), 'addr,annualUtilities,city,exit,hoaStatus,loan,monthlyHoa,pp,purpose,src,state,tier', '§12 [A4] STR key set unchanged when the facts are unknown');
  const pF = paramsOf(viaAnalyzer(flipRec({ ptype: null, units: null })));
  ok(!('ptype' in pF) && !('units' in pF) && !('band' in pF), '§12 [A4] F&F with unknown type / units sends no ptype, units or band');
  eq(keysOf(viaAnalyzer(flipRec({ ptype: null, units: null }))), 'addr,arv,city,exit,loan,pp,purpose,rehab,src,state,tier', '§12 [A4] F&F 11-key contract unchanged when the facts are unknown');
  // Supplied facts travel verbatim; the 5–8 / 9+ options translate to CPC's Multifamily (LTR / BRRRR law).
  const pS2 = paramsOf(viaPipeline(strRec({ ptype: '2–4 Unit', units: 3 }), 50));
  eq(pS2.ptype, '2–4 Unit', '§12 [A4] a supplied STR type travels verbatim'); eq(pS2.units, '3', '§12 [A4] a supplied STR unit count travels'); ok(!('band' in pS2), '§12 [A4] no band is emitted for STR (CPC derives it from units)');
  const pF2 = paramsOf(viaPipeline(flipRec({ ptype: 'Condo', units: 1 }), 51));
  eq(pF2.ptype, 'Condo', '§12 [A4] a supplied F&F type travels verbatim'); eq(pF2.units, '1', '§12 [A4] a supplied unit count of 1 travels because the USER supplied it');
  eq(paramsOf(viaPipeline(strRec({ ptype: '5–8 Unit', units: 6 }), 52)).ptype, 'Multifamily', '§12 [A4] "5–8 Unit" → Multifamily (CPC has no 5–8 option)');
  eq(paramsOf(viaPipeline(flipRec({ ptype: '9+ Unit', units: 12 }), 53)).ptype, 'Multifamily', '§12 [A4] "9+ Unit" → Multifamily');
  ok(!('units' in paramsOf(viaPipeline(strRec({ units: 0 }), 54))) && !('units' in paramsOf(viaPipeline(strRec({ units: -2 }), 55))), '§12 [A4] a non-positive unit count is omitted, never repaired');
  ok(!('ptype' in paramsOf(viaPipeline(strRec({ ptype: '   ' }), 56))), '§12 [A4] a whitespace type is omitted');
  // Pre-A4 records (no keys at all) behave exactly as before.
  const legacy = strRec({}); delete legacy.ptype; delete legacy.units;
  eq(keysOf(viaPipeline(legacy, 57)), 'addr,annualUtilities,city,exit,hoaStatus,loan,monthlyHoa,pp,purpose,src,state,tier', '§12 [A4] a pre-A4 STR record keeps its key set');
  // LTR / BRRRR are untouched by A4 (their type / units law was already in force).
  const pL = paramsOf(viaPipeline(ltrResult({ ...ORANGE_IN, down: 25, util: 0 }), 58));
  eq(pL.ptype, 'SFR', '§12 [A4] LTR still sends its selected type'); eq(pL.units, '1', '§12 [A4] LTR still sends its unit count'); eq(pL.band, '1-4', '§12 [A4] LTR still sends band');
}

console.log('— §13 Wave A · A1: City / State — hardened parser (prefer blank over wrong) + structured fields —');
{
  const P = CP.parseCityState;
  const cases = [
    ['6001 South Kings Hwy, Myrtle Beach SC',                 { city: 'Myrtle Beach', state: 'SC' }, 'City ST'],
    ['6001 S Kings Hwy, Myrtle Beach, SC 29575',              { city: 'Myrtle Beach', state: 'SC' }, 'City, ST ZIP'],
    ['6001 S Kings Hwy, Myrtle Beach, SC 29575, USA',         { city: 'Myrtle Beach', state: 'SC' }, 'Android / Chrome autofill: trailing ", USA" (the live defect)'],
    ['6001 S Kings Hwy, Myrtle Beach, SC, USA',               { city: 'Myrtle Beach', state: 'SC' }, 'trailing ", USA" without ZIP'],
    ['6001 S Kings Hwy, Myrtle Beach, SC 29575, United States', { city: 'Myrtle Beach', state: 'SC' }, 'trailing ", United States"'],
    ['6001 S Kings Hwy, Myrtle Beach, South Carolina 29575',  { city: 'Myrtle Beach', state: 'SC' }, 'full state name as its own segment, ZIP agrees'],
    ['6001 S Kings Hwy, Myrtle Beach South Carolina 29575',   { city: 'Myrtle Beach', state: 'SC' }, 'full state name inside the segment, ZIP agrees'],
    ['6001 S Kings Hwy, Myrtle Beach South Carolina',         {}, 'full state name inside the segment with NO ZIP stays blank ("Port Washington" is a city)'],
    ['100 Broadway, New York New York 10001',                 { city: 'New York', state: 'NY' }, 'two-word city + two-word state, ZIP agrees'],
    ['100 Broadway, New York New York',                       {}, '…and blank without the ZIP'],
    ['123 Main St, Port Washington',                          {}, 'a multi-word city ending in a state name is NOT a state (Port Washington NY/WI)'],
    ['9 Elm, Port Washington 11050',                          {}, 'pass 2: with a ZIP the ZIP must AGREE — 110 is New York, not Washington → blank, never Port / WA'],
    ['5 Elm Rd, Mount Washington 21209',                      {}, 'pass 2: the former documented limit is closed — 212 is Maryland → blank, never Mount / WA'],
    ['1 Foo Rd, West New York 07093',                         {}, 'pass 2: 070 is New Jersey → blank, never West / NY'],
    ['6001 S Kings Hwy, Myrtle Beach, sc',                    { city: 'Myrtle Beach', state: 'SC' }, 'lower-case code as its own segment'],
    ['6001 S Kings Hwy, Myrtle Beach, S.C.',                  { city: 'Myrtle Beach', state: 'SC' }, 'dotted code as its own segment'],
    ['6001 S Kings Hwy, Myrtle Beach sc',                     {}, 'lower-case two-letter token INSIDE a segment is not trusted without a ZIP ("Oak Ct" law)'],
    ['12 Orange St, Bridgeport CT 06604',                     { city: 'Bridgeport', state: 'CT' }, 'Orange Street regression shape (066 is Connecticut)'],
    ['Unit 4B, 100 Ocean Blvd, North Myrtle Beach, SC 29582', { city: 'North Myrtle Beach', state: 'SC' }, 'unit prefix'],
    ['9 Park Pl, Washington DC 20001',                        { city: 'Washington', state: 'DC' }, 'Washington the city, DC the state, ZIP agrees'],
    ['PO Box 12, Bend OR',                                    { city: 'Bend', state: 'OR' }, 'upper-case code beside a mixed-case city, no ZIP'],
    ['12 W Main St, Mesa AZ 85201-1234',                      { city: 'Mesa', state: 'AZ' }, 'ZIP+4 agrees'],
    ['100 N Main, La Grange, KY',                             { city: 'La Grange', state: 'KY' }, 'city containing "La" is fine as its own segment'],
    ['2 Rue, Paris TX 75460',                                 { city: 'Paris', state: 'TX' }, 'Paris, Texas'],
    ['12 Elm Rd, Oak Ct',                                     {}, '"Oak Ct" as the last segment stays blank (Ct is a street suffix)'],
    ['12 Elm Rd, Oak Ct 29577',                               {}, 'pass 2: a ZIP vouches for NOTHING it disagrees with — 295 is South Carolina, never Oak / CT'],
    ['Unit 2, 418 Oak Ct 29577',                              {}, 'pass 2: a comma before the street line does not rescue "Oak Ct" (street line has digits; ZIP disagrees)'],
    ['Apt B, 418 OAK CT 29577',                               {}, 'pass 2: all caps + ZIP: ZIP disagrees → blank'],
    ['Unit 2, 5 Palm La 70801',                               { state: 'LA' }, 'pass 2: state only — the ZIP (708 = Louisiana) agrees with the token, so the state is right; "5 Palm" is a street line and never a city'],
    ['Suite 400, 1234 Peachtree St NE',                       {}, 'pass 2: a directional is never a state, and the street line has digits'],
    ['Apt 2, 1234 Peachtree St NE',                           {}, 'pass 2: same'],
    ['12 ELM RD, OAK CT',                                     {}, 'pass 2: ALL-CAPS input without a ZIP never auto-fills (the case signal is gone)'],
    ['SUITE 400, 1234 PEACHTREE ST NE',                       {}, 'pass 2: all caps + directional → blank'],
    ['C/O SMITH, 100 PALM LA',                                {}, 'pass 2: all caps → blank'],
    ['50 N Sandusky St, Delaware 43015',                      {}, 'pass 2: Delaware, OHIO — 430 is Ohio → blank, never DE'],
    ['1600 Pennsylvania Ave, Washington 20500',               {}, 'pass 2: Washington, DC — 205 is DC → blank, never WA'],
    ['123 E Main St, Wyoming 49509',                          {}, 'pass 2: Wyoming, MICHIGAN → blank'],
    ['10 W Cherry St, Nevada 64772',                          {}, 'pass 2: Nevada, MISSOURI → blank'],
    ['1234 Main St, Apt B, Washington',                       {}, 'pass 2: a secondary-address line is never a city; no ZIP → blank'],
    ['1234 Main St, Suite A, Delaware',                       {}, 'pass 2: same'],
    ['1234 Main St, Unit B, SC 29575',                        { state: 'SC' }, 'pass 2: state only — "Unit B" is never shipped as a city'],
    ['6001 S Kings Hwy Myrtle Beach SC 29575-1234',           {}, 'comma-free address never auto-fills'],
    ['418 Oak Ct 29577',                                      {}, 'comma-free + ZIP + street suffix: blank, never CT'],
    ['1234 Peachtree St NE 30309',                            {}, 'comma-free + ZIP + directional: blank, never Nebraska'],
    ['6001 S Kings Hwy Myrtle Beach SC 29575 USA',            {}, 'comma-free + ZIP + country: blank'],
    ['6001 S Kings Hwy, Myrtle Beach',                        {}, 'no state → nothing'],
    ['12 Oak Ct',                                             {}, 'street suffix "Ct" is NOT Connecticut (prefer blank over wrong)'],
    ['5 Palm La',                                             {}, '"La" is not Louisiana'],
    ['400 Cherry Pa',                                         {}, '"Pa" is not Pennsylvania'],
    ['412 Oak St',                                            {}, 'street only'],
    ['318 Greenwood Ave, Washington',                         {}, 'a lone state name after a street stays blank (Washington the city, or the state? — no ZIP)'],
    ['123 Main St, SC 29575',                                 { state: 'SC' }, 'an agreeing ZIP keeps a lone state token: state only, the street is never a city'],
    ['123 Main St, SC 29575, USA',                            { state: 'SC' }, '…with a country suffix too'],
    ['318 Greenwood Ave, Seattle Washington 98101',           { city: 'Seattle', state: 'WA' }, 'city + state name, ZIP agrees'],
    ['318 Greenwood Ave, Seattle Washington',                 {}, 'city + state name without a ZIP stays blank'],
    ['1 Main St, Raleigh, NC 27601, USA',                     { city: 'Raleigh', state: 'NC' }, 'the addrfields 9+ fixture'],
    ['5 Shore Rd, Wilmington NC 28401',                       { city: 'Wilmington', state: 'NC' }, 'the STR fixture'],
    ['412 Oak St, Charlotte NC',                              { city: 'Charlotte', state: 'NC' }, 'the F&F fixture'],
    ['1 Foo St, Springfield MA 01103',                        { city: 'Springfield', state: 'MA' }, 'a leading-zero ZIP (011 is Massachusetts)'],
    ['',                                                      {}, 'empty'],
    [null,                                                    {}, 'null'],
  ];
  for (const [addr, want, label] of cases) eq(JSON.stringify(P(addr)), JSON.stringify(want), `§13 parse "${addr}" — ${label}`);
  eq(CP.normalizeStateToken('South Carolina'), 'SC', '§13 normalizeStateToken accepts a full name'); eq(CP.normalizeStateToken('sc'), 'SC', '§13 …and a lower-case code'); eq(CP.normalizeStateToken('S.C.'), 'SC', '§13 …and a dotted code'); eq(CP.normalizeStateToken('ZZ'), null, '§13 …and rejects a non-state');
  for (const [z, st] of [['06604', 'CT'], ['29577', 'SC'], ['30309', 'GA'], ['43015', 'OH'], ['20500', 'DC'], ['20001', 'DC'], ['07093', 'NJ'], ['49509', 'MI'], ['64772', 'MO'], ['21209', 'MD'], ['11050', 'NY'], ['01103', 'MA'], ['73301', 'TX'], ['73101', 'OK'], ['88510', 'TX'], ['96910', null], ['09001', null], ['', null]]) eq(CP.zipState(z), st, `§13 zipState(${z}) = ${st}`);
  // Structured fields are the authority; the parser is only the fallback for pre-A1 records.
  const base = ltrResult({ ...ORANGE_IN, down: 25, util: 0 });
  const typed = { ...base, addr: 'somewhere unparseable', city: 'North Myrtle Beach', state: 'south carolina' };
  const pT = paramsOf(viaPipeline(typed, 60));
  eq(pT.city, 'North Myrtle Beach', '§13 the typed City travels verbatim even when the address does not parse'); eq(pT.state, 'SC', '§13 the typed State is normalized to its code');
  const cleared = { ...base, city: null, state: null };
  const pC = paramsOf(viaPipeline(cleared, 61));
  ok(!('city' in pC) && !('state' in pC), '§13 a deliberately cleared City / State (null on the record) is OMITTED — the parser never overrides the user');
  const badState = { ...base, city: 'Bridgeport', state: 'ZZ' };
  const pB = paramsOf(viaPipeline(badState, 62));
  eq(pB.city, 'Bridgeport', '§13 city travels'); ok(!('state' in pB), '§13 a non-state value is omitted, never sent to CPC\'s dropdown');
  const legacy = { ...base }; delete legacy.city; delete legacy.state;
  const pL = paramsOf(viaPipeline(legacy, 63));
  eq(pL.city, 'Bridgeport', '§13 a pre-A1 record (no keys) falls back to the parser'); eq(pL.state, 'CT', '§13 …state too');
  const legacyUsa = { ...legacy, addr: '12 Orange St, Bridgeport, CT 06604, USA' };
  eq(paramsOf(viaPipeline(legacyUsa, 64)).state, 'CT', '§13 a pre-A1 record with an Android-style address now parses (the live defect is closed for old cards too)');
  eq(JSON.stringify(CP.addressHandoff({ addr: '1 Main St, Raleigh, NC 27601, USA', city: null, state: null })), '{}', '§13 addressHandoff honours explicit nulls over the parser');
  eq(JSON.stringify(CP.addressHandoff({ addr: '1 Main St, Raleigh, NC 27601, USA' })), '{"city":"Raleigh","state":"NC"}', '§13 addressHandoff parses when the keys are absent');
  const cpSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'clearpath.js'), 'utf8');
  eq((cpSrc.match(/= addressHandoff\(r\)/g) || []).length, 2, '§13 buildDealParams and buildBrrrSummary both read the structured components (one helper)');
  eq((cpSrc.replace(/\/\/[^\n]*/g, '').match(/parseCityState\(r\.addr\)/g) || []).length, 1, '§13 the address is parsed directly in exactly one place — the helper\'s pre-A1 fallback');
  const ltrSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'ltr.js'), 'utf8'), brrrSrc = readFileSync(join(ROOT, 'docs', 'src', 'js', 'brrr.js'), 'utf8');
  ok(/\.\.\.addressHandoff\(info\)/.test(ltrSrc) && /\.\.\.addressHandoff\(info\)/.test(brrrSrc), '§13 the 9+ referral handoffs carry the structured City / State (they used to send addr only)');
}

console.log(`\nhandoffutil: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
