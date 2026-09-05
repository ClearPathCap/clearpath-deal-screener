// ─── Rental operating-expense suite — owner-paid utilities (engine law) ──────
// Owner wave 2026-09-05 (73 Orange Street, Bridgeport CT): recurring owner-paid
// utilities (water/sewer, common-area, trash) are a TRUE operating expense ABOVE
// NOI. One field, `util` (annual $), flows through the shared incomeBlock for
// LTR + BRRRR and through computeStr for STR, so every metric that consumes NOI
// (DSCR, cap rate, cash flow, CoC, the stress test, DealFit Guidance) moves from
// the SAME canonical value. $0 / absent (legacy records) is the neutral default.
// Also pins the numeric-input integrity law: an incomplete number (NaN from a
// badInput field) is a blocking validation error, never a silent default.
// Run: node tests/opex.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");
const F = await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/finance.js")));
const STR = await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/strFinance.js")));

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// Orange Street — Aaron's CURRENT saved assumptions (vacancy 7, taxes 8,000, insurance 2,358).
const ORANGE = { price: 649900, rentMo: 6000, units: 3, down: 25, vac: 7, tax: 8000, ins: 2358, hoa: 0,
                 maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8 };
const U = 1200;

// ── §A · zero-utility baseline (pinned) ──────────────────────────────────────
console.log('— §A Orange Street zero-utility baseline —');
const base = F.computeLtr(ORANGE);
const zero = F.computeLtr({ ...ORANGE, util: 0 });
ok("A1: absent util ≡ util 0 (legacy records are byte-identical to $0)", JSON.stringify(base) === JSON.stringify(zero));
ok("A2: NOI 47,645", near(base.NOI, 47645.2, 0.5));
ok("A3: DSCR 1.19", near(base.dscr, 1.194, 0.002) && base.dscr.toFixed(2) === '1.19');
ok("A4: cap rate 7.3%", near(base.capRate, 7.33, 0.02));
ok("A5: CoC 2.3%", near(base.coc, 2.30, 0.02));
ok("A6: cash flow 4,144/yr · 345/mo", near(base.cashFlowYr, 4144.03, 0.5) && near(base.cashFlowMo, 345.34, 0.1));
ok("A7: verdict Dig Deeper & Negotiate", F.ltrVerdict(base).verdict === 'Dig Deeper & Negotiate' && F.ltrVerdict(base).cls === 'warm');
ok("A8: engine reports util 0 on the result", base.util === 0);

// ── §B · utilities reduce every NOI consumer from the same value ─────────────
console.log('— §B nonzero utilities —');
const withU = F.computeLtr({ ...ORANGE, util: U });
ok("B1: NOI reduced dollar-for-dollar", near(withU.NOI, base.NOI - U, 1e-6));
ok("B2: opEx up by exactly U; EGI untouched", near(withU.opEx, base.opEx + U, 1e-6) && withU.EGI === base.EGI);
ok("B3: debt service unchanged (utilities are opEx, not financing)", withU.debtYr === base.debtYr && withU.loan === base.loan);
ok("B4: DSCR = (NOI − U) / debt", near(withU.dscr, (base.NOI - U) / base.debtYr, 1e-9) && withU.dscr < base.dscr);
ok("B5: cap rate = (NOI − U) / price", near(withU.capRate, ((base.NOI - U) / ORANGE.price) * 100, 1e-9) && withU.capRate < base.capRate);
ok("B6: annual cash flow −U, monthly −U/12", near(withU.cashFlowYr, base.cashFlowYr - U, 1e-6) && near(withU.cashFlowMo, base.cashFlowMo - U / 12, 1e-6));
ok("B7: CoC = cash flow / cash to close (cash to close unchanged)", withU.cashToClose === base.cashToClose && near(withU.coc, (withU.cashFlowYr / withU.cashToClose) * 100, 1e-9) && withU.coc < base.coc);
ok("B8: stress test carries the same expense (stressed cash flow −U/12; stressed DSCR lower)",
   near(withU.stressedCfMo, base.stressedCfMo - U / 12, 1e-6) && withU.stressedDscr < base.stressedDscr);
ok("B9: result echoes util", withU.util === U);
// monotone across a ladder
const ladder = [0, 600, 1200, 2400, 4800].map(u => F.computeLtr({ ...ORANGE, util: u }));
ok("B10: NOI steps down by exactly the utility delta across a ladder",
   ladder.every((m, i) => i === 0 || near(ladder[i - 1].NOI - m.NOI, [0, 600, 600, 1200, 2400][i], 1e-6)));
ok("B11: not hidden in maintenance / CapEx / management / taxes / insurance (each stays as before)",
   near(withU.capexRes, base.capexRes, 1e-9) && withU.EGI * 0.08 === base.EGI * 0.08 && withU.rentYr * 0.05 === base.rentYr * 0.05);

// ── §C · DealFit Guidance derives from the same canonical value ──────────────
console.log('— §C guidance —');
const saved0 = { type: 'ltr', ...ORANGE, rent: ORANGE.rentMo };
const savedU = { ...saved0, util: U };
const g0 = F.ltrGuidance(saved0), gU = F.ltrGuidance(savedU);
ok("C1: guidance(current) NOI/DSCR equal computeLtr for util 0 and util U",
   near(g0.current.NOI, base.NOI, 1e-9) && near(gU.current.NOI, withU.NOI, 1e-9) && near(gU.current.dscr, withU.dscr, 1e-12));
ok("C2: guidance exposes the utility it used", g0.current.util === 0 && gU.current.util === U);
ok("C3: guidance levers move with the expense (max price for lender-ready is lower with utilities)",
   gU.levers.price != null && g0.levers.price != null && gU.levers.price < g0.levers.price);
ok("C4: ltrEngineInput passes util through and defaults a legacy record to 0",
   F.ltrEngineInput(savedU).util === U && F.ltrEngineInput(saved0).util === 0);
const hotAt = (d) => F.ltrVerdict(F.computeLtr(F.ltrEngineInput(d))).cls === 'hot';
ok("C5: the price lever with utilities is engine-true (hot at the lever, not $1 above)",
   hotAt({ ...savedU, price: gU.levers.price }) && !hotAt({ ...savedU, price: gU.levers.price + 1 }));

// ── §D · BRRRR shares the income block ───────────────────────────────────────
console.log('— §D BRRRR —');
const BR = { price: 250000, rehab: 40000, arv: 380000, rentMo: 2600, units: 1, contingency: 15, cc: 2, hold: 6, carry: 600,
             acqLoan: 200000, acqRate: 10, acqPoints: 2, refiLtv: 75, refiRate: 7, refiAmort: 30, reficost: 3, season: 6,
             vac: 5, tax: 3000, ins: 1200, hoa: 0, maint: 5, pm: 8, capex: 5, targetDscr: 1.25 };
const b0 = F.computeBrrr(BR), bU = F.computeBrrr({ ...BR, util: U });
ok("D1: BRRRR absent util ≡ util 0", JSON.stringify(b0) === JSON.stringify(F.computeBrrr({ ...BR, util: 0 })));
ok("D2: BRRRR NOI reduced dollar-for-dollar; refi debt unchanged", near(bU.NOI, b0.NOI - U, 1e-6) && bU.refiDebtYr === b0.refiDebtYr);
ok("D3: BRRRR DSCR / cash flow / CoC lower from the same value", bU.dscr < b0.dscr && near(bU.cashFlowYr, b0.cashFlowYr - U, 1e-6) && bU.postRefiCoC < b0.postRefiCoC);
ok("D4: BRRRR refi/equity mechanics untouched (not a financing input)", bU.refiLoan === b0.refiLoan && bU.cashOut === b0.cashOut && bU.capitalLeft === b0.capitalLeft);

// ── §E · STR ──────────────────────────────────────────────────────────────────
console.log('— §E STR —');
const S = { price: 420000, rent: 55000, down: 0.20, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 5500, maint: 3000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675 };
const s0 = STR.computeStr(S), sU = STR.computeStr({ ...S, util: U });
ok("E1: STR absent util ≡ util 0", JSON.stringify(s0) === JSON.stringify(STR.computeStr({ ...S, util: 0 })));
ok("E2: STR NOI reduced dollar-for-dollar; debt unchanged", near(sU.noi, s0.noi - U, 1e-6) && sU.debt === s0.debt);
ok("E3: STR cash flow / CoC / DSCR / cap lower from the same value", near(sU.cashflow, s0.cashflow - U, 1e-6) && sU.coc < s0.coc && sU.dscr < s0.dscr && sU.capRate < s0.capRate);
ok("E4: STR result echoes util", sU.util === U && s0.util === 0);

// ── §F · numeric-input integrity: NaN is a blocking error, never a default ───
console.log('— §F incomplete numbers —');
const nanErr = (type, raw) => F.validateInputs(type, raw).errors;
ok("F1: LTR vacancy NaN → error on l-vac", nanErr('ltr', { vac: NaN }).some(e => e.field === 'l-vac' && /incomplete/.test(e.message)));
ok("F2: BRRRR refi LTV NaN → error on b-refiltv", nanErr('brrr', { refiLtv: NaN }).some(e => e.field === 'b-refiltv'));
ok("F3: STR occupancy NaN → error on v-occ", nanErr('str', { occ: NaN }).some(e => e.field === 'v-occ'));
ok("F4: flip hold NaN → error on f-hold", nanErr('flip', { hold: NaN }).some(e => e.field === 'f-hold'));
ok("F5: a complete value produces no incomplete error", nanErr('ltr', { vac: 7 }).length === 0 && nanErr('str', { occ: 65 }).length === 0);
ok("F6: undefined (blank) is still the honest 'use the default' path, not an error", nanErr('ltr', { vac: undefined }).length === 0);

// ── §G · source pins ─────────────────────────────────────────────────────────
const fin = src("docs/src/js/finance.js"), strSrc = src("docs/src/js/strFinance.js");
ok("G1: incomeBlock takes util and adds it to opEx", /util = 0,/.test(fin) && /const opEx = EGI \* pm \+ rentYr \* maint \+ tax \+ ins \+ hoaYr \+ util;/.test(fin));
ok("G2: computeLtr + computeBrrr both read util and pass it to BOTH income blocks (base + stress)",
   (fin.match(/const util = \+inp\.util \|\| 0;/g) || []).length === 2 && (fin.match(/    hoaYr,\n    util,\n    capex: capexF,/g) || []).length === 4);
ok("G3: computeStr adds util to totalExp", /totalExp    = platformFee \+ pmFee \+ tax \+ maint \+ \(\+util \|\| 0\)/.test(strSrc));
ok("G4: no threshold or band rule changed", /'1-4':\{maxLtv:0\.80,down:20,vac:5, pm:8,maint:5,capex:5,hotDscr:1\.25,mosStrong:1\.15/.test(fin) && /'5-8':\{maxLtv:0\.75,down:25,vac:10,pm:9,maint:8,capex:6,hotDscr:1\.25,smallMfFloor:1\.20,mosStrong:1\.20/.test(fin));

console.log(`opex: ${pass} passed, ${fail} failed`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fail ? 1 : 0);
