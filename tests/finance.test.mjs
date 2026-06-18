// Acceptance tests for the shared rental finance engine (LTR + BRRR).
// Run: node tests/finance.test.mjs   (no deps; imports the pure finance module)
// Asserts SPEC_LTR_ANALYZER §9 + SPEC_BRRR_ANALYZER §9 golden values + behavioral
// assertions. Tolerance ±$2 / ±0.05pt (amortization rounding).

// finance.js is browser ESM with a .js extension; this repo has no "type":"module",
// so Node would treat it as CommonJS. It has zero imports (pure), so load it via a
// data: URL (same trick as supabase/seed/*.mjs).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const financeSrc = readFileSync(join(here, "..", "docs", "src", "js", "finance.js"), "utf8");
const {
  computeLtr,
  ltrVerdict,
  computeBrrr,
  brrrVerdict,
  incomeBlock,
  qualifiesForCpcLtr,
  qualifiesForCpcBrrr,
} = await import("data:text/javascript," + encodeURIComponent(financeSrc));

let pass = 0,
  fail = 0;
const fails = [];

function near(label, actual, expected, tol = 2) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) pass++;
  else {
    fail++;
    fails.push(`${label}: expected ≈${expected}, got ${actual}`);
  }
}
function eq(label, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++;
  else {
    fail++;
    fails.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function truthy(label, v) {
  if (v) pass++;
  else {
    fail++;
    fails.push(`${label}: expected truthy, got ${JSON.stringify(v)}`);
  }
}

// ─── LTR Golden Test A — WARM / finance-and-hold (the DSCR bridge) ──────────────
{
  const m = computeLtr({
    price: 180000, rentMo: 1800, down: 25, vac: 6, tax: 1700, ins: 1100, hoa: 0,
    maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8, ptype: "SFR",
  });
  near("LTR-A rentYr", m.rentYr, 21600, 0.5);
  near("LTR-A EGI", m.EGI, 20304, 0.5);
  near("LTR-A NOI", m.NOI, 14799.68);
  near("LTR-A capRate", m.capRate, 8.22, 0.05);
  near("LTR-A loan", m.loan, 135000, 0.5);
  near("LTR-A piMo", m.piMo, 921.05, 0.5);
  near("LTR-A debtYr", m.debtYr, 11052.6, 2);
  near("LTR-A capexRes", m.capexRes, 1080, 0.5);
  near("LTR-A cashFlowYr", m.cashFlowYr, 2667, 3);
  near("LTR-A cashFlowMo", m.cashFlowMo, 222, 1);
  near("LTR-A DSCR", m.dscr, 1.34, 0.01);
  near("LTR-A cashToClose", m.cashToClose, 49950, 0.5);
  near("LTR-A CoC", m.coc, 5.34, 0.05);
  near("LTR-A 1% rule", m.onePctRule, 1.0, 0.01);
  near("LTR-A GRM", m.grm, 8.33, 0.01);
  near("LTR-A LTV", m.ltv, 75.0, 0.05);
  const v = ltrVerdict(m);
  eq("LTR-A verdict", v.cls, "warm");
  truthy("LTR-A DSCR-bridge sub-copy", v.vsub.includes("finance-and-hold"));
  // $50K override: loan 135k ≥ 50k, LTV 75% ≤ 80%, DSCR 1.34 ≥ 1.0 → qualifies
  // (the spec's $150K 'fails minimum' note is superseded by the 6/18 override).
  eq(
    "LTR-A qualifiesForCpcLtr (under $50K override)",
    qualifiesForCpcLtr({ loan: Math.round(m.loan), ltv: m.loan / m.price, dscr: m.dscr }),
    true
  );
}

// ─── LTR Golden Test B — gating (per §2 reference impl) ────────────────────────
{
  const m = computeLtr({
    price: 260000, rentMo: 2600, down: 25, vac: 5, tax: 2200, ins: 1050, hoa: 0,
    maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8, ptype: "SFR",
  });
  near("LTR-B loan", m.loan, 195000, 0.5);
  near("LTR-B LTV", m.ltv, 75.0, 0.05);
  truthy("LTR-B DSCR ≥ 1.25", m.dscr >= 1.25);
  const v = ltrVerdict(m);
  // §2 reference impl yields CoC ≈ 6.8% (< 8% target) → WARM(b), NOT the "HOT"
  // the spec PROSE estimated. §2 is authoritative (spec line 74). FLAGGED.
  eq("LTR-B verdict (per §2 — spec prose said HOT)", v.cls, "warm");
  eq(
    "LTR-B qualifiesForCpcLtr",
    qualifiesForCpcLtr({ loan: Math.round(m.loan), ltv: m.loan / m.price, dscr: m.dscr }),
    true
  );
}

// ─── LTR Golden Test C — COLD, negative leverage ──────────────────────────────
{
  const m = computeLtr({
    price: 600000, rentMo: 2800, down: 20, vac: 7, tax: 6600, ins: 2400, hoa: 0,
    maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30,
  });
  truthy("LTR-C DSCR < 1.0", m.dscr < 1.0);
  truthy("LTR-C cashFlowMo < 0", m.cashFlowMo < 0);
  eq("LTR-C verdict", ltrVerdict(m).cls, "pass");
}

// ─── LTR behavioral assertions ────────────────────────────────────────────────
{
  // 1. All-cash (down 100) → DSCR null, no NaN, CoC uses cashToClose.
  const ac = computeLtr({
    price: 200000, rentMo: 1800, down: 100, vac: 5, tax: 2000, ins: 900, hoa: 0,
    maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8,
  });
  eq("LTR all-cash DSCR null", ac.dscr, null);
  truthy("LTR all-cash no NaN", Number.isFinite(ac.coc) && Number.isFinite(ac.cashFlowYr));
  truthy("LTR all-cash CoC uses cashToClose (>0)", ac.cashToClose > 0);

  // 2. Self-manage → pm 0, NOI rises vs hired PM.
  const base = { price: 200000, rentMo: 1800, down: 20, vac: 5, tax: 2000, ins: 900, maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30 };
  const hired = computeLtr({ ...base });
  const self = computeLtr({ ...base, selfManage: true });
  truthy("LTR self-manage NOI > hired NOI", self.NOI > hired.NOI);

  // 7. 1% rule informational only — a sub-1% deal with DSCR ≥ 1.25 still grades HOT/WARM.
  const sub1 = computeLtr({
    price: 300000, rentMo: 2600, down: 35, vac: 4, tax: 2400, ins: 1000, maint: 5, pm: 8,
    capex: 5, rate: 6.5, amort: 30, points: 1, cc: 2, target: 6,
  });
  truthy("LTR sub-1% deal exists", sub1.onePctRule < 1.0);
  truthy("LTR sub-1% with DSCR ≥ 1.25 not COLD", sub1.dscr >= 1.25 ? ltrVerdict(sub1).cls !== "pass" : true);
}

// ─── BRRR Golden Test A — WARM (capital recycled, thin DSCR), all-cash acq ─────
{
  const m = computeBrrr({
    price: 150000, rehab: 40000, contingency: 15, arv: 250000, cc: 2, hold: 6, carry: 500,
    acqLoan: "", refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    rent: 2100, vac: 5, tax: 2500, ins: 1200, hoa: 0, maint: 5, pm: 8, capex: 5, targetDscr: 1.25, ptype: "SFR",
  });
  near("BRRR-A rehabTotal", m.rehabTotal, 46000, 0.5);
  near("BRRR-A allInCost", m.allInCost, 202000, 0.5);
  near("BRRR-A cashInvested", m.cashInvested, 202000, 0.5);
  near("BRRR-A refiLoan", m.refiLoan, 187500, 0.5);
  near("BRRR-A refiCosts", m.refiCosts, 5625, 0.5);
  near("BRRR-A cashOut", m.cashOut, 181875, 0.5);
  near("BRRR-A capitalLeft", m.capitalLeft, 20125, 0.5);
  near("BRRR-A cashRecoveredPct", m.cashRecoveredPct, 90.0, 0.05);
  near("BRRR-A equityCreated", m.equityCreated, 48000, 0.5);
  near("BRRR-A NOI", m.NOI, 17064.8, 0.5);
  near("BRRR-A refi piMo", m.piMo, 1247.4, 0.5);
  near("BRRR-A refiDebtYr", m.refiDebtYr, 14968.8, 2);
  near("BRRR-A capexRes", m.capexRes, 1260, 0.5);
  near("BRRR-A cashFlowYr", m.cashFlowYr, 836, 3);
  near("BRRR-A cashFlowMo", m.cashFlowMo, 70, 1);
  near("BRRR-A DSCR", m.dscr, 1.14, 0.01);
  near("BRRR-A capRate", m.capRate, 8.45, 0.05);
  near("BRRR-A postRefiCoC", m.postRefiCoC, 4.15, 0.05);
  eq("BRRR-A verdict", brrrVerdict(m).cls, "warm");
}

// ─── BRRR Golden Test B — HOT (rent 2300) ─────────────────────────────────────
{
  const m = computeBrrr({
    price: 150000, rehab: 40000, contingency: 15, arv: 250000, cc: 2, hold: 6, carry: 500,
    acqLoan: "", refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    rent: 2300, vac: 5, tax: 2500, ins: 1200, hoa: 0, maint: 5, pm: 8, capex: 5, targetDscr: 1.25, ptype: "SFR",
  });
  near("BRRR-B NOI", m.NOI, 19042, 2);
  truthy("BRRR-B DSCR ≥ 1.25", m.dscr >= 1.25);
  near("BRRR-B DSCR", m.dscr, 1.27, 0.02);
  truthy("BRRR-B cashFlowMo > 0", m.cashFlowMo > 0);
  near("BRRR-B cashFlowMo", m.cashFlowMo, 224, 2);
  near("BRRR-B cashRecoveredPct", m.cashRecoveredPct, 90.0, 0.05);
  eq("BRRR-B verdict", brrrVerdict(m).cls, "hot");
  eq(
    "BRRR-B qualifiesForCpcBrrr",
    qualifiesForCpcBrrr({ loan: Math.round(m.refiLoan), ltv: m.refiLoan / m.arv, dscr: m.dscr }),
    true
  );
}

// ─── BRRR Golden Test C — COLD (refi can't cover bridge) ──────────────────────
{
  const m = computeBrrr({
    price: 150000, rehab: 40000, contingency: 15, arv: 200000, acqLoan: 170000, acqRate: 10,
    acqPoints: 2, hold: 6, refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    rent: 2000, vac: 5, tax: 2500, ins: 1200, maint: 5, pm: 8, capex: 5,
  });
  near("BRRR-C refiLoan", m.refiLoan, 150000, 0.5);
  near("BRRR-C acqPayoff", m.acqPayoff, 170000, 0.5);
  truthy("BRRR-C refiLoan ≤ acqPayoff", m.refiLoan <= m.acqPayoff);
  eq("BRRR-C verdict", brrrVerdict(m).cls, "pass");
}

// ─── BRRR behavioral assertions ───────────────────────────────────────────────
{
  // 1. capitalLeft ≤ 0 → postRefiCoC Infinity, verdict can still be HOT.
  const inf = computeBrrr({
    price: 120000, rehab: 30000, contingency: 15, arv: 240000, cc: 2, hold: 6, carry: 400,
    acqLoan: "", refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    rent: 2200, vac: 5, tax: 2000, ins: 1000, maint: 5, pm: 8, capex: 5,
  });
  truthy("BRRR capitalLeft ≤ 0 → CoC Infinity", inf.capitalLeft <= 0 ? inf.postRefiCoC === Infinity : true);

  // 2. Blank acqLoan → acq* 0, cashInvested = allInCost.
  const ac = computeBrrr({
    price: 150000, rehab: 40000, contingency: 15, arv: 250000, cc: 2, hold: 6, carry: 500,
    acqLoan: "", refiLtv: 75, refiRate: 7.0, refiAmort: 30, reficost: 3,
    rent: 2100, vac: 5, tax: 2500, ins: 1200, maint: 5, pm: 8, capex: 5,
  });
  eq("BRRR blank acqLoan → acqInterest 0", ac.acqInterest, 0);
  eq("BRRR blank acqLoan → acqFees 0", ac.acqFees, 0);
  near("BRRR blank acqLoan → cashInvested = allInCost", ac.cashInvested, ac.allInCost, 0.01);

  // 6. incomeBlock is the SAME function LTR and BRRR use — identical NOI/DSCR for
  //    identical income inputs + loan.
  const args = { rentYr: 25200, vac: 0.05, pm: 0.08, maint: 0.05, tax: 2500, ins: 1200, hoaYr: 0, capex: 0.05, loan: 187500, rate: 0.07, amortYears: 30 };
  const ib = incomeBlock(args);
  near("incomeBlock NOI matches BRRR-A NOI", ib.NOI, 17064.8, 0.5);
  near("incomeBlock DSCR matches BRRR-A DSCR", ib.dscr, 1.14, 0.01);
}

// ─── Funnel gate edge: sub-$50K out of box; >$5M out of box ───────────────────
eq("gate: $40K loan out of box", qualifiesForCpcLtr({ loan: 40000, ltv: 0.75, dscr: 1.3 }), false);
eq("gate: $6M loan out of box", qualifiesForCpcLtr({ loan: 6000000, ltv: 0.75, dscr: 1.3 }), false);
eq("gate: LTV 85% out of box", qualifiesForCpcLtr({ loan: 200000, ltv: 0.85, dscr: 1.3 }), false);
eq("gate: DSCR 0.9 out of box", qualifiesForCpcLtr({ loan: 200000, ltv: 0.75, dscr: 0.9 }), false);
eq("gate: $50K floor in box", qualifiesForCpcLtr({ loan: 50000, ltv: 0.75, dscr: 1.3 }), true);

// ─── Report ───────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) {
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
} else {
  console.log("All golden + behavioral assertions pass ✓");
}
