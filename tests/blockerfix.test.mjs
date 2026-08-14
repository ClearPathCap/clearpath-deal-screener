// Wave 4 blocker-fix acceptance tests — five independently testable criteria
// (CPC_WAVE4_BLOCKER_FIX_SPEC_CODE_REQUEST_v1.1). Run: node tests/blockerfix.test.mjs
//
// Each criterion has its own section; do not merge assertions across criteria.
// Pure modules load via the data: URL trick (same as finance.test.mjs). DOM-coupled
// wiring is covered by static source assertions (same banked pattern as
// handoff.test.mjs §8); the browser gate provides rendered-DOM proof later.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const load = async (rel) =>
  import("data:text/javascript," + encodeURIComponent(readFileSync(join(here, "..", rel), "utf8")));
const srcOf = (rel) => readFileSync(join(here, "..", rel), "utf8");

const FIN = await load("docs/src/js/finance.js");

let pass = 0, fail = 0;
const fails = [];
function eq(label, actual, expected) {
  if (actual === expected) pass++;
  else { fail++; fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function truthy(label, v) {
  if (v) pass++;
  else { fail++; fails.push(`${label}: expected truthy, got ${JSON.stringify(v)}`); }
}
function near(label, actual, expected, tol = 2) {
  if (Math.abs(actual - expected) <= tol) pass++;
  else { fail++; fails.push(`${label}: expected ≈${expected}, got ${actual}`); }
}

// ═══ F-1 — BRRR must not grade COLD when debt is covered ═════════════════════
{
  // Packet fixture W4-F3b: NOI $33,129.60 > refi debt $32,932.47 (DSCR 1.006);
  // monthly cash flow negative ONLY from the CapEx reserve.
  const f3b = FIN.computeBrrr({
    price: 300000, rehab: 100000, arv: 550000, rent: 4200, contingency: 15, cc: 2,
    hold: 6, carry: 600, refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    season: 6, vac: 5, pm: 8, maint: 5, capex: 5, units: 1, tax: 6000, ins: 2400, hoa: 0,
  });
  near("F1: W4-F3b NOI", f3b.NOI, 33129.6, 0.5);
  near("F1: W4-F3b refi debt", f3b.refiDebtYr, 32932.47, 2);
  truthy("F1: W4-F3b DSCR ≥ 1.0", f3b.dscr >= 1.0);
  truthy("F1: W4-F3b CF/mo negative", f3b.cashFlowMo < 0);
  truthy("F1: W4-F3b negativity is reserve-only (NOI ≥ debt)", f3b.NOI >= f3b.refiDebtYr);
  const v3b = FIN.brrrVerdict(f3b);
  eq("F1: W4-F3b grades WARM (not COLD)", v3b.cls, "warm");
  truthy("F1: W4-F3b covers-debt/thin-after-reserves copy", /Covers Debt — Thin After Reserves/.test(v3b.verdict));
  truthy("F1: W4-F3b not 'BRRR Breaks'", !/BRRR Breaks/.test(v3b.verdict));
  truthy("F1: W4-F3b never 'Negative Leverage'", !/Negative Leverage/.test(v3b.verdict + v3b.vsub));

  // Regression guard: DSCR < 1.0 (NOI below annual debt service) is still COLD.
  const cold = FIN.computeBrrr({
    price: 300000, rehab: 100000, arv: 550000, rent: 3400, contingency: 15, cc: 2,
    hold: 6, carry: 600, refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    vac: 5, pm: 8, maint: 5, capex: 5, units: 1, tax: 6000, ins: 2400, hoa: 0,
  });
  truthy("F1: guard fixture DSCR < 1.0", cold.dscr < 1.0);
  truthy("F1: guard fixture NOI < refi debt (same mechanism)", cold.NOI < cold.refiDebtYr);
  const vCold = FIN.brrrVerdict(cold);
  eq("F1: DSCR < 1.0 still COLD", vCold.cls, "pass");
  truthy("F1: COLD copy names uncovered debt", /below 1\.0/.test(vCold.vsub));

  // Regression guard: refi that can't pay off the bridge is still COLD (banked BRRR-C).
  const shortfall = FIN.computeBrrr({
    price: 150000, rehab: 40000, contingency: 15, arv: 200000, acqLoan: 170000, acqRate: 10,
    acqPoints: 2, hold: 6, refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    rent: 2000, vac: 5, tax: 2500, ins: 1200, maint: 5, pm: 8, capex: 5,
  });
  truthy("F1: refi ≤ payoff still COLD", FIN.brrrVerdict(shortfall).cls === "pass");

  // Regression guard: no equity created is still COLD.
  const noEquity = FIN.computeBrrr({
    price: 300000, rehab: 100000, arv: 380000, rent: 4200, contingency: 15, cc: 2,
    hold: 6, carry: 600, refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    vac: 5, pm: 8, maint: 5, capex: 5, units: 1, tax: 6000, ins: 2400, hoa: 0,
  });
  truthy("F1: no-equity fixture equityCreated ≤ 0", noEquity.equityCreated <= 0);
  eq("F1: no equity still COLD", FIN.brrrVerdict(noEquity).cls, "pass");

  // Spec row 4 — "CF negative BEFORE the reserve at DSCR ≥ 1.0": for a financed deal
  // this class is EMPTY by identity (pre-reserve CF = NOI − debtYr, and DSCR ≥ 1.0
  // ⟺ NOI ≥ debtYr). Demonstrated on W4-F3b; the law cannot be made more permissive
  // through this path because the path has no members.
  truthy("F1: identity — financed DSCR ≥ 1.0 ⟺ pre-reserve CF ≥ 0", (f3b.dscr >= 1.0) === (f3b.NOI - f3b.refiDebtYr >= 0));
  near("F1: W4-F3b pre-reserve CF is positive", f3b.NOI - f3b.refiDebtYr, 197.13, 2);

  // Zero-refi BRRR (refiLtv 0 → refiLoan 0, dscr null): the PRE-EXISTING structural
  // guard refiLoan ≤ acqPayoff fires first (a BRRR with no refinance isn't a BRRR),
  // so dscr-null deals stay COLD via mechanics — unchanged from baseline, and the
  // coversDebt dscr-null arm is defensive-only in BRRR (proven unreachable here).
  const acNoRefi = FIN.computeBrrr({
    price: 200000, rehab: 50000, arv: 320000, rent: 1560, contingency: 15, cc: 2,
    hold: 6, carry: 600, refiLtv: 0, vac: 5, pm: 8, maint: 5, capex: 5, tax: 9000, ins: 4000, hoa: 0,
  });
  eq("F1: zero-refi dscr null", acNoRefi.dscr, null);
  truthy("F1: zero-refi trips structural guard (refiLoan ≤ acqPayoff)", acNoRefi.refiLoan <= acNoRefi.acqPayoff);
  eq("F1: zero-refi still COLD via mechanics (baseline behavior)", FIN.brrrVerdict(acNoRefi).cls, "pass");
  console.log("F-1 OK");
}

// ═══ F-3 — currency parser must not silently multiply by 100 ═════════════════
{
  const FMT = await load("docs/src/js/format.js");
  const { currencyMaskValue: cmv, isMalformedCurrency, parseComma, parseNumOpt } = FMT;

  // The headline bug is dead: a decimal separator in ordinary currency syntax is
  // never deleted. "1,200.00" is $1,200 — not $120,000.
  eq("F3: 1,200.00 value is 1200 (not 120000)", cmv("1,200.00").value, 1200);
  eq("F3: 1,200.00 display keeps the separator", cmv("1,200.00").display, "1,200.00");

  // Required parser contract — mask canonicalization (the browser event path's core).
  eq("F3: mask 1200", cmv("1200").display, "1,200");
  eq("F3: mask 1,200", cmv("1,200").display, "1,200");
  eq("F3: mask $1,200", cmv("$1,200").display, "1,200");
  eq("F3: mask 1 200", cmv("1 200").display, "1,200");
  eq("F3: value 1200", cmv("1200").value, 1200);
  eq("F3: value $1,200", cmv("$1,200").value, 1200);
  eq("F3: value 1 200", cmv("1 200").value, 1200);
  // Decimal-preserving by design (fields are NOT integer-only; engines take floats,
  // displays round at render): 1200.50 parses to 1200.50.
  eq("F3: mask 1200.50 display", cmv("1200.50").display, "1,200.50");
  eq("F3: value 1200.50", cmv("1200.50").value, 1200.5);
  eq("F3: cents capped at two digits", cmv("1200.509").display, "1,200.50");
  eq("F3: leading-dot normalizes to 0.x", cmv(".5").display, "0.5");
  eq("F3: blank is not malformed", cmv("").malformed, false);
  eq("F3: blank display empty", cmv("").display, "");

  // Malformed input: rejected and visibly flagged — never reshaped into a plausible
  // number. The raw junk stays in the field exactly as typed.
  for (const junk of ["abc12.3.4", "1.2.3", "1–200", "1-200", "12abc", "."]) {
    eq(`F3: malformed detected: ${junk}`, isMalformedCurrency(junk), true);
    eq(`F3: not reshaped: ${junk}`, cmv(junk).display, junk);
    eq(`F3: no value from junk: ${junk}`, cmv(junk).value, null);
  }
  eq("F3: valid not flagged: $1,200.00", isMalformedCurrency("$1,200.00"), false);

  // Per-analyzer read paths at unit level. Flip + STR read money via parseComma;
  // LTR + BRRR read money via parseNumOpt. Both must agree with the mask's value
  // for every valid contract row (mask display → parse round-trip).
  for (const [raw, want] of [["1200", 1200], ["1,200", 1200], ["$1,200", 1200], ["1 200", 1200], ["1,200.00", 1200], ["1200.50", 1200.5]]) {
    eq(`F3 flip/STR parseComma(${raw})`, parseComma(raw), want);
    eq(`F3 LTR/BRRR parseNumOpt(${raw})`, parseNumOpt(raw), want);
    eq(`F3 round-trip parseComma(mask(${raw}))`, parseComma(cmv(raw).display), want);
    eq(`F3 round-trip parseNumOpt(mask(${raw}))`, parseNumOpt(cmv(raw).display), want);
  }
  // Junk through the low-level readers stays non-credible (0/undefined feed the
  // required-field and malformed blocks; they can never grade a deal).
  eq("F3: parseComma junk -> 0 (blocked upstream)", parseComma("abc12.3.4"), 0);
  eq("F3: parseNumOpt junk -> undefined (blocked upstream)", parseNumOpt("abc12.3.4"), undefined);

  // Wiring: the analyze wrapper blocks malformed money fields for all four analyzers,
  // and the DOM mask flags instead of rewriting (static source assertions — banked
  // handoff.test.mjs §8 pattern; rendered proof belongs to the browser gate).
  const mainSrc = srcOf("docs/src/js/main.js");
  const fmtSrc = srcOf("docs/src/js/format.js");
  truthy("F3: main.js imports isMalformedCurrency", mainSrc.includes("isMalformedCurrency"));
  truthy("F3: wrapper sweeps [data-currency]", mainSrc.includes("querySelectorAll('[data-currency]')"));
  truthy("F3: wrapper blocks with visible message", mainSrc.includes("'Enter a valid dollar amount'"));
  for (const t of ["flip: 'page-flip'", "rental: 'rental-view-str'", "ltr: 'rental-view-ltr'", "brrr: 'rental-view-brrr'"]) {
    truthy(`F3: wrapper covers ${t}`, mainSrc.includes(t));
  }
  truthy("F3: mask sets aria-invalid on junk", fmtSrc.includes("el.setAttribute('aria-invalid', 'true')"));
  truthy("F3: old digits-only strip is gone", !fmtSrc.includes("replace(/[^0-9]/g, '')"));
  console.log("F-3 OK");
}

// ═══ F-5 — blank taxes must not become a trustworthy $0 (LTR / BRRR) ═════════
{
  const IR = await load("docs/src/js/insuranceReadiness.js");

  // Three-state classifier: blank is UNKNOWN and pends; an explicit 0 is a real,
  // ruled-valid value (differs from insurance's explicit_zero — spec v1.1).
  eq("F5: blank taxes -> missing", IR.taxStatus(undefined), "missing");
  eq("F5: explicit 0 taxes -> explicit_zero", IR.taxStatus(0), "explicit_zero");
  eq("F5: 11000 taxes -> valid", IR.taxStatus(11000), "valid");
  eq("F5: missing not ready", IR.taxReady("missing"), false);
  eq("F5: explicit 0 IS ready (computes as a real value)", IR.taxReady("explicit_zero"), true);
  eq("F5: valid ready", IR.taxReady("valid"), true);

  // Overlay matrix: taxes join the banked insurance mechanism, not a second one.
  const pTax = IR.incomePresentation("missing", "valid");
  eq("F5: tax-missing overlay tag", pTax.tag, "NEEDS PROPERTY TAXES");
  truthy("F5: tax-missing overlay pends", pTax.pendingText === "Pending");
  const pBoth = IR.incomePresentation("missing", "missing");
  eq("F5: both-missing overlay tag", pBoth.tag, "NEEDS TAXES + INSURANCE");
  eq("F5: tax explicit-0 + valid ins -> no overlay (computes normally)", IR.incomePresentation("explicit_zero", "valid"), null);
  eq("F5: tax valid + ins missing -> banked insurance overlay", IR.incomePresentation("valid", "missing").tag, "NEEDS INSURANCE");
  eq("F5: tax valid + ins valid -> null", IR.incomePresentation("valid", "valid"), null);

  // Acceptance: W4-F2 economics, taxes blank — pending signal, no confident HOT,
  // no fabricated $0 anywhere in the handoff (annualTaxes + all screener metrics gone).
  const mkResult = (taxRaw) => ({
    type: "ltr", tax: taxRaw || 0, taxStatus: IR.taxStatus(taxRaw),
    ins: 14000, insStatus: "valid",
    NOI: 70048, dscr: 1.6456, cashFlowYr: 22380, cashFlowMo: 1865, capRate: 10.8,
    verdict: "Strong Rental — Lender-Ready", rent: 8500, hoa: 0,
  });
  const hBlank = IR.incomeDependentHandoff(mkResult(undefined));
  eq("F5: blank taxes omit annualTaxes", hBlank.annualTaxes, undefined);
  for (const k of ["screenerNoi", "screenerDscr", "screenerCashFlowAnnual", "screenerCashFlowMonthly", "screenerCapRate", "screenerVerdict", "dscr"]) {
    eq(`F5: blank taxes omit ${k}`, hBlank[k], undefined);
  }
  eq("F5: blank taxes keep valid insurance value", hBlank.annualInsurance, 14000);
  truthy("F5: blank-tax overlay suppresses confident verdict", IR.incomePresentation(IR.taxStatus(undefined), "valid") !== null);

  // Explicit 0: computes and transfers as a real value.
  const hZero = IR.incomeDependentHandoff(mkResult(0));
  eq("F5: explicit-0 taxes transfer as 0", hZero.annualTaxes, 0);
  truthy("F5: explicit-0 keeps screener metrics", hZero.screenerDscr !== undefined && hZero.screenerNoi !== undefined);

  // Populated: regression — identical to the banked insurance-only behavior.
  const hFull = IR.incomeDependentHandoff(mkResult(11000));
  eq("F5: populated taxes transfer", hFull.annualTaxes, 11000);
  const hInsOnly = IR.insuranceDependentHandoff(mkResult(11000));
  for (const k of ["annualInsurance", "screenerNoi", "screenerDscr", "screenerCashFlowAnnual", "screenerCashFlowMonthly", "screenerCapRate", "screenerVerdict", "dscr"]) {
    eq(`F5: populated == banked insurance behavior for ${k}`, hFull[k], hInsOnly[k]);
  }

  // Legacy saved results (coerced tax:0, no taxStatus) compute — bounded disclosed gap.
  eq("F5: legacy tax:0 -> explicit_zero (computes)", IR.resultTaxStatus({ tax: 0 }), "explicit_zero");
  eq("F5: taxStatus field wins over value", IR.resultTaxStatus({ taxStatus: "missing", tax: 0 }), "missing");

  // Wiring (static, banked §8 pattern): glue carries taxStatus; rows/summaries gated.
  const ltrSrc = srcOf("docs/src/js/ltr.js");
  const brrrSrc = srcOf("docs/src/js/brrr.js");
  const cpSrc = srcOf("docs/src/js/clearpath.js");
  const plSrc = srcOf("docs/src/js/pipeline.js");
  const shSrc = srcOf("docs/src/js/share.js");
  truthy("F5: ltr.js gates via incomePresentation", ltrSrc.includes("incomePresentation(tStat, insStatus)"));
  truthy("F5: ltr.js taxes row pends", ltrSrc.includes("tStat === INS_MISSING ? '— pending'"));
  truthy("F5: ltr.js stores taxStatus", ltrSrc.includes("taxStatus: tStat"));
  truthy("F5: brrr.js gates via incomePresentation", brrrSrc.includes("incomePresentation(tStat, insStatus)"));
  truthy("F5: brrr.js stores taxStatus", brrrSrc.includes("taxStatus: tStat"));
  truthy("F5: summaries gate taxes line", cpSrc.includes("tStat === INS_MISSING ? 'Pending' : '$' + Math.round(r.tax)"));
  truthy("F5: summaries warn on missing taxes", cpSrc.includes("taxSummaryWarning(tStat)"));
  truthy("F5: pipeline gate widened to taxes", plSrc.includes("resultTaxStatus(data || {})"));
  truthy("F5: share gate widened to taxes", shSrc.includes("resultTaxStatus(data)"));
  console.log("F-5 OK");
}

// ═══ F-6 — STR blank taxes + insurance must not become $0 ════════════════════
{
  const IR = await load("docs/src/js/insuranceReadiness.js");
  const STR = await load("docs/src/js/strFinance.js");

  // Extraction fidelity: the pure module reproduces the Pass-0 goldens exactly
  // (W4-F4 COLD and W4-F4b WARM) — zero behavior change from the verbatim move.
  const f4 = STR.computeStr({ price: 420000, rent: 55000, down: 0.20, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 5500, maint: 3000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675 });
  near("F6: W4-F4 NOI", f4.noi, 23317.5, 0.5);
  near("F6: W4-F4 DSCR", f4.dscr, 0.891632, 0.0001);
  near("F6: W4-F4 CoC", f4.coc, -2.8626, 0.001);
  eq("F6: W4-F4 verdict COLD", f4.cls, "pass");
  eq("F6: W4-F4 verdict copy", f4.verdict, "Thin Margins — Walk Away");
  const f4b = STR.computeStr({ price: 420000, rent: 70000, down: 0.20, occ: 0.65, mgmt: 0.03, pm: 0.08, tax: 5500, maint: 3000, furnish: 15000, tgtCoc: 6, interestRate: 0.0675 });
  near("F6: W4-F4b NOI", f4b.noi, 31995, 0.5);
  near("F6: W4-F4b CoC", f4b.coc, 5.9026, 0.001);
  eq("F6: W4-F4b verdict WARM", f4b.cls, "warm");
  truthy("F6: W4-F4b no bridge suffix (DSCR 1.22 < 1.25)", !/Lender-fundable/.test(f4b.vsub));

  // Blank combined field pends; explicit 0 computes; populated computes.
  const pend = IR.strExpensePresentation(IR.taxStatus(undefined));
  truthy("F6: blank combined field pends", pend !== null);
  eq("F6: pending tag", pend.tag, "NEEDS TAXES + INSURANCE");
  truthy("F6: pending copy names the ambiguity rule (blank is unknown, not $0)", /unknown, not \$0/.test(pend.sub));
  eq("F6: explicit 0 computes (no overlay)", IR.strExpensePresentation(IR.taxStatus(0)), null);
  eq("F6: populated computes (no overlay)", IR.strExpensePresentation(IR.taxStatus(5500)), null);

  // Shared render-time decision covers STR everywhere saved deals render.
  truthy("F6: pendingPresentationFor rental blank -> overlay", IR.pendingPresentationFor("rental", "missing", "valid") !== null);
  eq("F6: pendingPresentationFor rental explicit-0 -> null", IR.pendingPresentationFor("rental", "explicit_zero", "valid"), null);
  eq("F6: pendingPresentationFor flip -> always null", IR.pendingPresentationFor("flip", "missing", "missing"), null);

  // Wiring — tests live against rental.js directly (static, banked §8 pattern):
  // the analyzer consumes the tested module, reads the field blank-aware, gates
  // every expense-dependent tile/row, and stores taxStatus. The old inline math
  // is gone from the DOM file.
  const rSrc = srcOf("docs/src/js/rental.js");
  truthy("F6: rental.js imports computeStr", rSrc.includes("import { computeStr } from './strFinance.js'"));
  truthy("F6: rental.js reads tax blank-aware", rSrc.includes("parseNumOpt(document.getElementById('v-tax').value)"));
  truthy("F6: rental.js validates the RAW tax (blank stays absent)", rSrc.includes("tax: taxRaw, maint, furnish"));
  truthy("F6: rental.js gates verdict tag", rSrc.includes("strP ? strP.tag"));
  truthy("F6: rental.js gates CoC tile", rSrc.includes("val: strP ? strP.pendingText : pct(coc)"));
  truthy("F6: rental.js gates DSCR tile", rSrc.includes("val: strP ? strP.pendingText : (debt > 0 ? dscr.toFixed(2) : 'n/a')"));
  truthy("F6: rental.js pends taxes row", rSrc.includes("strP ? '— pending' : '–' + fmt(tax)"));
  truthy("F6: rental.js pends NOI row", rSrc.includes("v: strP ? strP.pendingText : fmt(noi)"));
  truthy("F6: rental.js stores taxStatus", rSrc.includes("taxStatus: tStat"));
  truthy("F6: old inline NOI math gone from rental.js", !rSrc.includes("const noi         = effRent - totalExp"));
  truthy("F6: old inline verdict gone from rental.js", !rSrc.includes("verdict = 'Strong STR Play'"));
  const plSrc6 = srcOf("docs/src/js/pipeline.js");
  truthy("F6: pipeline pends STR card stats", plSrc6.includes("if (d.type === 'rental') return [ // F-6"));
  truthy("F6: pipeline pends STR detail taxes", plSrc6.includes("v: pend ? 'Pending' : (d.tax != null ? fmt(d.tax) : '—')"));
  console.log("F-6 OK");
}

// ═══ F-10 — preserve the user's raw requested Flip loan in the handoff ═══════
{
  // clearpath.js is import-coupled (tiers/storage → DOM), so this section uses the
  // banked handoff.test.mjs mirror pattern: the flip branch of buildDealParams and
  // buildCpcUrl's serializer rule are REPLICATED verbatim below and pinned against
  // the source with static assertions. The browser gate provides the DOM proof.
  const cpSrc = srcOf("docs/src/js/clearpath.js");
  const fuSrc = srcOf("docs/src/js/funding.js");

  // Mirror of clearpath.js buildDealParams flip branch @ w4/blocker-fix.
  function mirrorFlipParams(r) {
    const cost = (r.ask || 0) + (r.rep || 0);
    const maxBox = Math.round(Math.min(0.90 * cost, r.arv ? 0.70 * r.arv : Infinity));
    const rawLoan = (r.loan && r.loan > 0) ? Math.round(r.loan) : undefined;
    const gateLoan = rawLoan !== undefined ? Math.min(rawLoan, maxBox) : maxBox;
    return {
      pp: Math.round(r.ask || 0), rehab: Math.round(r.rep || 0), arv: Math.round(r.arv || 0),
      loan: rawLoan, ltc: rawLoan !== undefined && cost ? rawLoan / cost : undefined,
      gateLoan, gateLtc: cost ? gateLoan / cost : undefined,
      addr: r.addr || undefined, city: r.city, state: r.state, purpose: 'flip', exit: 'sale',
    };
  }
  // Mirror of funding.js buildCpcUrl (fixed key map + serializer rule, unchanged).
  function mirrorUrl(deal) {
    const p = new URLSearchParams();
    p.set('src', 'dealscreener'); p.set('tier', 'starter');
    const map = { pp:'pp', rehab:'rehab', arv:'arv', loan:'loan', ltv:'ltv', dscr:'dscr',
                  addr:'addr', city:'city', state:'state', ptype:'ptype', purpose:'purpose', exit:'exit',
                  units:'units', band:'band', monthlyRent:'monthlyRent', annualTaxes:'annualTaxes',
                  annualInsurance:'annualInsurance', monthlyHoa:'monthlyHoa', vacancyPct:'vacancyPct',
                  pmPct:'pmPct', maintPct:'maintPct', capexPct:'capexPct', screenerNoi:'screenerNoi',
                  screenerDscr:'screenerDscr', screenerCashFlowAnnual:'screenerCashFlowAnnual',
                  screenerCashFlowMonthly:'screenerCashFlowMonthly', screenerCapRate:'screenerCapRate',
                  screenerVerdict:'screenerVerdict' };
    for (const [k, param] of Object.entries(map)) {
      const v = deal[k];
      if (v !== undefined && v !== null && v !== '') p.set(param, String(v));
    }
    return p;
  }
  const base = { type: 'flip', ask: 225000, rep: 75000, arv: 425000, addr: '412 Oak St, Charlotte NC', city: 'Charlotte', state: 'NC' };

  // Spec row 1: loan 9,000,000 → handoff carries 9000000, uncapped. (UI note: B2
  // validation bounds an ENTERABLE loan at ask+rep, so 9M is reachable only at
  // this unit level — disclosed, not smoothed.) Eligibility still judged at the
  // box-eligible size, so the on-screen funding area is unchanged.
  const big = mirrorFlipParams({ ...base, loan: 9000000 });
  eq("F10: 9M handoff loan is raw", mirrorUrl(big).get('loan'), "9000000");
  eq("F10: 9M gate figure is the box max (unchanged on-screen)", big.gateLoan, 270000);
  // Spec row 2: loan 250,000 (inside the box) → unchanged.
  const mid = mirrorFlipParams({ ...base, loan: 250000 });
  eq("F10: 250K handoff loan", mirrorUrl(mid).get('loan'), "250000");
  eq("F10: 250K gate == raw (cap never bound inside the box)", mid.gateLoan, 250000);
  // Spec row 3: blank loan → CPC receives NO fabricated requested-loan value.
  // Representation: the loan key is OMITTED (not empty) — CPC's traced prefill
  // (page.tsx: `if (value) setter(...)`) treats omitted and empty identically as
  // "no requested loan", and omission also preserves the banked serializer-hygiene
  // rule (no ''-valued params). Note: ltc has NEVER been a serialized key —
  // buildCpcUrl's map carries ltv, not ltc; the flip ltc field is gate-input only.
  // Contract-shape delta: −1 key (loan) in the blank-loan case only.
  const blank = mirrorFlipParams({ ...base, loan: 0 });
  const pBlank = mirrorUrl(blank);
  eq("F10: blank loan key omitted", pBlank.has('loan'), false);
  eq("F10: ltc was never a URL key (map has ltv only)", mirrorUrl(mid).has('ltc'), false);
  eq("F10: blank still gate-eligible at box max (button unchanged)", blank.gateLoan, 270000);
  // Spec row 4: key shape. Entered-loan handoff keeps the banked ELEVEN-key set
  // exactly (src,tier,pp,rehab,arv,loan,addr,city,state,purpose,exit — the Run 4
  // 11-key contract); blank-loan drops exactly {loan} and nothing else.
  const keys = (p) => [...p.keys()].sort().join(',');
  eq("F10: entered-loan key set (banked 11-key contract preserved)", keys(mirrorUrl(mid)), "addr,arv,city,exit,loan,pp,purpose,rehab,src,state,tier");
  eq("F10: entered-loan key count is 11", [...mirrorUrl(mid).keys()].length, 11);
  eq("F10: blank-loan key set (−loan only)", keys(pBlank), "addr,arv,city,exit,pp,purpose,rehab,src,state,tier");
  // Gate-only fields never serialize (not in buildCpcUrl's map).
  eq("F10: gateLoan never serialized", mirrorUrl(big).has('gateLoan'), false);
  eq("F10: gateLtc never serialized", mirrorUrl(big).has('gateLtc'), false);

  // Static pins: source matches the mirror; the cap on the TRANSMITTED loan is gone.
  truthy("F10: transmitted loan is rawLoan", cpSrc.includes("loan:    rawLoan,"));
  truthy("F10: old Math.min-on-transmitted-loan gone", !cpSrc.includes("Math.min(Math.round(r.loan), maxBox) : maxBox"));
  truthy("F10: gate fields exist", cpSrc.includes("gateLoan,") && cpSrc.includes("gateLtc: cost ? gateLoan / cost : undefined"));
  truthy("F10: qualifiesForType judges at gate size", cpSrc.includes("loan: deal.gateLoan !== undefined ? deal.gateLoan : deal.loan"));
  truthy("F10: belowMinimumOnly judges at gate size", cpSrc.includes("const loan = deal.gateLoan !== undefined ? deal.gateLoan : deal.loan"));
  truthy("F10: below-min caption uses gate figure", cpSrc.includes("(deal.gateLoan !== undefined ? deal.gateLoan : deal.loan) || 0) / 1000"));
  truthy("F10: buildCpcUrl map has no gate keys (never transmitted)", !fuSrc.includes("gateLoan") && !fuSrc.includes("gateLtc"));
  truthy("F10: serializer hygiene rule unchanged", fuSrc.includes("if (v !== undefined && v !== null && v !== '') p.set(param, String(v));"));
  truthy("F10: flip summary still carries the RAW request", cpSrc.includes("'Estimated Loan Request: $' + Math.round(r.loan).toLocaleString()"));
  console.log("F-10 OK");
}

// ═══ Report ══════════════════════════════════════════════════════════════════
console.log(`\nblockerfix: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
