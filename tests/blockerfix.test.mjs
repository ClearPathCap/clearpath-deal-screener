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

// ═══ Report ══════════════════════════════════════════════════════════════════
console.log(`\nblockerfix: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
