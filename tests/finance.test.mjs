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
  CPC_BROKER_MIN,
  computeFlipStress,
  flipVerdict,
  mosLabel,
  propertyBand,
  BAND_RULES,
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
  // CPC brokering min: loan 135k ≥ 100k, LTV 75% ≤ 80%, DSCR 1.34 ≥ 1.0 → qualifies
  // (threshold history: $150K → $50K on 6/18 → $100K on 8/10, aligned with CPC's floor).
  eq(
    "LTR-A qualifiesForCpcLtr (above $100K brokering min)",
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
  near("LTR-B annual cash flow below the $6,000 strong floor", m.cashFlowYr, 4936, 5);
  const v = ltrVerdict(m);
  // Updated framework (2026-06-18): the LTR strong cash-flow floor is $6,000/yr.
  // B's $4,936 is BELOW it and CoC 6.8% < target, so neither income path to HOT is
  // met → WARM, with the finance-and-hold DSCR bridge sub-copy (DSCR 1.41).
  eq("LTR-B verdict (below $6K floor → WARM)", v.cls, "warm");
  truthy("LTR-B bridge sub-copy", v.vsub.includes("finance-and-hold"));
  eq(
    "LTR-B qualifiesForCpcLtr",
    qualifiesForCpcLtr({ loan: Math.round(m.loan), ltv: m.loan / m.price, dscr: m.dscr }),
    true
  );
}

// ─── LTR Golden Test B2 — HOT (clean: strong DSCR + CoC + dollars) ────────────
{
  const m = computeLtr({
    price: 230000, rentMo: 2600, down: 25, vac: 5, tax: 2000, ins: 950, hoa: 0,
    maint: 5, pm: 8, capex: 5, rate: 7.25, amort: 30, points: 1, cc: 2, target: 8, ptype: "SFR",
  });
  near("LTR-B2 DSCR", m.dscr, 1.61, 0.02);
  near("LTR-B2 CoC", m.coc, 11.1, 0.2);
  eq("LTR-B2 verdict", ltrVerdict(m).cls, "hot");
  truthy("LTR-B2 survives stress", m.marginOfSafety !== "fails");
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

// ─── Flip — Verdict & Risk Framework (dollar floor + ROI bar + stress) ────────
{
  // All-cash flip: ask 200k, arv 320k, rehab 40k, cc1 2%, cc2 5%, carry 1000, hold 5.
  const stress = computeFlipStress({
    ask: 200000, arv: 320000, rep: 40000, cc1: 0.02, cc2: 0.05, carry: 1000, hold: 5,
    financed: false, loan: 0, rate: 0.10, points: 0.03, target: 40000,
  });
  near("Flip stressedProfit (ARV−5%/rehab+10%/+1mo)", stress.stressedProfit, 34800, 5);
  eq("Flip margin of safety = strong", stress.marginOfSafety, "strong");
  // profit 55,000 ≥ max(50k,target) ✓, ROI ~22% ≥ 15 ✓, survives ✓ → HOT
  eq("Flip HOT", flipVerdict({ profit: 55000, roi: 22.1, target: 40000, maxOffer: 184000, marginOfSafety: stress.marginOfSafety, stressedProfit: stress.stressedProfit }).cls, "hot");
}
// Stress-loss → COLD even with strong base profit (SPEC §65 "loses money under stress")
eq("Flip COLD on stress loss", flipVerdict({ profit: 60000, roi: 25, target: 40000, maxOffer: 100000, marginOfSafety: "fails", stressedProfit: -2000 }).cls, "pass");
// Below $25K dollar floor → COLD
eq("Flip COLD below $25K floor", flipVerdict({ profit: 18000, roi: 30, target: 40000, maxOffer: 80000, marginOfSafety: "strong", stressedProfit: 9000 }).cls, "pass");
// maxOffer ≤ 0 → COLD
eq("Flip COLD on maxOffer≤0", flipVerdict({ profit: 60000, roi: 25, target: 40000, maxOffer: -5000, marginOfSafety: "strong", stressedProfit: 40000 }).cls, "pass");
// ROI under 15% but dollars + survives → WARM (not HOT)
eq("Flip WARM on low ROI", flipVerdict({ profit: 70000, roi: 12, target: 40000, maxOffer: 100000, marginOfSafety: "strong", stressedProfit: 45000 }).cls, "warm");
// profit under the $50K strong bar (but ≥$25K) → WARM
eq("Flip WARM below strong bar", flipVerdict({ profit: 35000, roi: 18, target: 40000, maxOffer: 90000, marginOfSafety: "tight", stressedProfit: 12000 }).cls, "warm");

// ─── Margin-of-Safety tile mapping ────────────────────────────────────────────
eq("mosLabel strong → good", mosLabel("strong").cls, "good");
eq("mosLabel tight → warn", mosLabel("tight").cls, "warn");
eq("mosLabel fails → bad", mosLabel("fails").cls, "bad");

// ─── Funnel gate edge: CPC brokering minimum $100K (a referral threshold, not
// an analysis limit — sizing/grading carry no floor); NO upper cap ─────────────
eq("gate: CPC_BROKER_MIN is $100K", CPC_BROKER_MIN, 100000);
eq("gate: $40K loan out of box", qualifiesForCpcLtr({ loan: 40000, ltv: 0.75, dscr: 1.3 }), false);
eq("gate: $99,999 loan out of box (below brokering min)", qualifiesForCpcLtr({ loan: 99999, ltv: 0.75, dscr: 1.3 }), false);
eq("gate: $100K floor exactly in box", qualifiesForCpcLtr({ loan: 100000, ltv: 0.75, dscr: 1.3 }), true);
eq("gate: $6M loan IN box (no upper cap)", qualifiesForCpcLtr({ loan: 6000000, ltv: 0.75, dscr: 1.3 }), true);
eq("gate: $20M loan IN box (no upper cap)", qualifiesForCpcBrrr({ loan: 20000000, ltv: 0.75, dscr: 1.3 }), true);
eq("gate: LTV 85% out of box", qualifiesForCpcLtr({ loan: 200000, ltv: 0.85, dscr: 1.3 }), false);
eq("gate: DSCR 0.9 out of box", qualifiesForCpcLtr({ loan: 200000, ltv: 0.75, dscr: 0.9 }), false);
// Analysis carries no floor: a tiny deal still computes and grades normally.
{
  const tiny = computeLtr({ price: 60000, down: 25, rate: 7.5, amort: 30, rent: 800, taxes: 900, ins: 400 });
  eq("no analysis floor: $45K-loan deal still computes DSCR", Number.isFinite(tiny.dscr), true);
}

// ─── Multifamily bands (5–8 small multifamily; 9+ manual review) ──────────────
{
  // propertyBand boundaries — blank/≤4 = 1-4, 5–8 = 5-8, 9+ = 9plus.
  eq("band: blank → 1-4", propertyBand(undefined), "1-4");
  eq("band: 4 → 1-4", propertyBand(4), "1-4");
  eq("band: 5 → 5-8", propertyBand(5), "5-8");
  eq("band: 8 → 5-8", propertyBand(8), "5-8");
  eq("band: 9 → 9plus", propertyBand(9), "9plus");

  // Gate: 5–8 LTV ceiling is 75% (vs 80% for 1–4); 9+ never auto-qualifies.
  eq("gate 5-8: LTV 0.78 out of box (75% ceiling)",
     qualifiesForCpcLtr({ loan: 450000, ltv: 0.78, dscr: 1.30, band: "5-8" }), false);
  eq("gate 1-4: LTV 0.78 in box (80% ceiling)",
     qualifiesForCpcLtr({ loan: 450000, ltv: 0.78, dscr: 1.30, band: "1-4" }), true);
  eq("gate 5-8: LTV 0.74 in box",
     qualifiesForCpcLtr({ loan: 450000, ltv: 0.74, dscr: 1.30, band: "5-8" }), true);
  eq("gate 9plus: never auto-qualifies",
     qualifiesForCpcLtr({ loan: 450000, ltv: 0.60, dscr: 1.50, band: "9plus" }), false);
  eq("gate BRRR 5-8: LTV 0.78 out of box",
     qualifiesForCpcBrrr({ loan: 450000, ltv: 0.78, dscr: 1.30, band: "5-8" }), false);

  // 8-unit base deal; rent dialed to land DSCR at four points across the bands.
  const base8 = (rentMo) => computeLtr({
    price: 800000, units: 8, rentMo, down: 25, vac: 5, pm: 8, maint: 5, capex: 6,
    tax: 5000, ins: 2000, hoa: 0, rate: 7.0, amort: 30, points: 1, cc: 2, target: 8, ptype: "2–4 Unit",
  });

  // HOT — DSCR ~1.30 that survives the one-vacant-unit stress.
  const hot = base8(7006);
  eq("5-8 band tag carried in result", hot.band, "5-8");
  eq("5-8 units carried in result", hot.units, 8);
  near("5-8 HOT DSCR ≈ 1.30", hot.dscr, 1.30, 0.02);
  truthy("5-8 HOT survives stress", hot.marginOfSafety !== "fails");
  eq("5-8 DSCR 1.30 → HOT", ltrVerdict(hot).cls, "hot");
  truthy("5-8 HOT label names small-multifamily", /Small-Multifamily/.test(ltrVerdict(hot).verdict));

  // WARM (clears floor) — DSCR ~1.22, between the 1.20 floor and 1.25 best-pricing.
  const warmFloor = base8(6618);
  near("5-8 WARM DSCR ≈ 1.22", warmFloor.dscr, 1.22, 0.02);
  eq("5-8 DSCR 1.22 → WARM", ltrVerdict(warmFloor).cls, "warm");
  truthy("5-8 1.22 clears-floor copy", /clears the ~1\.20/.test(ltrVerdict(warmFloor).vsub));

  // WARM (below floor) — DSCR ~1.05, covers debt but under the ~1.20 lender floor.
  const warmBelow = base8(5795);
  near("5-8 WARM DSCR ≈ 1.05", warmBelow.dscr, 1.05, 0.02);
  eq("5-8 DSCR 1.05 → WARM", ltrVerdict(warmBelow).cls, "warm");
  truthy("5-8 1.05 below-floor copy", /below the ~1\.20 small-multifamily lender floor/.test(ltrVerdict(warmBelow).vsub));

  // COLD — DSCR ~0.95, debt not covered.
  const cold = base8(5310);
  near("5-8 COLD DSCR ≈ 0.95", cold.dscr, 0.95, 0.02);
  eq("5-8 DSCR 0.95 → COLD", ltrVerdict(cold).cls, "pass");
  truthy("5-8 COLD negative-leverage copy", /Negative Leverage/.test(ltrVerdict(cold).verdict));

  // Band-default reserves actually bite: a 5–8 deal left to defaults uses tighter
  // vacancy/PM/maintenance than a 1–4 deal with identical rent → lower NOI.
  const def58 = computeLtr({ price: 800000, units: 6, rentMo: 7000, rate: 7.0, amort: 30 });
  const def14 = computeLtr({ price: 800000, units: 2, rentMo: 7000, rate: 7.0, amort: 30 });
  eq("5-8 default band", def58.band, "5-8");
  truthy("5-8 default reserves stricter than 1-4 (lower NOI)", def58.NOI < def14.NOI);

  // BAND_RULES sanity — the constants the gate/stress/verdict read.
  eq("BAND_RULES 1-4 maxLtv", BAND_RULES["1-4"].maxLtv, 0.80);
  eq("BAND_RULES 5-8 maxLtv", BAND_RULES["5-8"].maxLtv, 0.75);
  eq("BAND_RULES 5-8 floor", BAND_RULES["5-8"].smallMfFloor, 1.20);
}

// ─── Report ───────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) {
  fails.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
} else {
  console.log("All golden + behavioral assertions pass ✓");
}
