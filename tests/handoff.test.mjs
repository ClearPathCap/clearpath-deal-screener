// Phase A regression tests — three-state insurance readiness + CPC handoff omission.
// Run: node tests/handoff.test.mjs   (no deps; data-URL loads the pure modules)
//
// Covers LTR and BRRR across: untouched blank insurance ('missing'), explicitly
// entered zero ('explicit_zero'), and valid nonzero ('valid'). Asserts the
// borrower-facing status/Pending contract, the identical unresolved omission
// sets, per-parameter absence (incl. the base `dscr` alternate-leak), serializer
// hygiene (no ''/'undefined'/'null'/NaN values), valid-transfer fidelity, and
// that the hot/warm/pass engine architecture is unchanged.
//
// insuranceReadiness.js and finance.js are browser ESM with zero imports, so both
// load via the data: URL trick (same as finance.test.mjs). The DOM wiring in
// ltr.js/brrr.js and the URL assembly in funding.js are import-coupled and are
// verified by the pre-publication browser gate; the serializer rule replicated
// below mirrors funding.js buildCpcUrl (v !== undefined && v !== null && v !== ''),
// which this release does not modify.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const load = async (rel) => {
  const src = readFileSync(join(here, "..", rel), "utf8");
  return import("data:text/javascript," + encodeURIComponent(src));
};
const IR = await load("docs/src/js/insuranceReadiness.js");
const FIN = await load("docs/src/js/finance.js");

let pass = 0,
  fail = 0;
const fails = [];
function eq(label, actual, expected) {
  if (actual === expected) pass++;
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

// ─── 1. Classification: three distinct source states ─────────────────────────
eq("status: blank (undefined) -> missing", IR.insuranceStatus(undefined), "missing");
eq("status: null -> missing", IR.insuranceStatus(null), "missing");
eq("status: explicit 0 -> explicit_zero", IR.insuranceStatus(0), "explicit_zero");
eq("status: 1200 -> valid", IR.insuranceStatus(1200), "valid");
eq("constants: INS_MISSING", IR.INS_MISSING, "missing");
eq("constants: INS_EXPLICIT_ZERO", IR.INS_EXPLICIT_ZERO, "explicit_zero");
eq("constants: INS_VALID", IR.INS_VALID, "valid");
truthy("states distinct: missing !== explicit_zero", IR.INS_MISSING !== IR.INS_EXPLICIT_ZERO);
truthy("states distinct: explicit_zero !== valid", IR.INS_EXPLICIT_ZERO !== IR.INS_VALID);

// ─── 2. Readiness: both unresolved states are NOT lender-ready ───────────────
eq("ready: missing -> false", IR.insuranceReady("missing"), false);
eq("ready: explicit_zero -> false", IR.insuranceReady("explicit_zero"), false);
eq("ready: valid -> true", IR.insuranceReady("valid"), true);

// ─── 3. Borrower-facing presentation ─────────────────────────────────────────
const pMissing = IR.insurancePresentation("missing");
const pZero = IR.insurancePresentation("explicit_zero");
eq("missing: tag NEEDS INSURANCE", pMissing.tag, "NEEDS INSURANCE");
truthy("missing: sub contains required phrase", pMissing.sub.includes("Insurance required for lender-ready calculation"));
eq("missing: pendingText", pMissing.pendingText, "Pending");
truthy("missing: internal-review pathway retained", pMissing.sub.includes("explore funding"));
eq("zero: tag VERIFY INSURANCE", pZero.tag, "VERIFY INSURANCE");
truthy("zero: sub contains required phrase", pZero.sub.includes("Insurance entered as $0 — confirm before lender review"));
eq("zero: pendingText", pZero.pendingText, "Pending");
truthy("zero: internal-review pathway retained", pZero.sub.includes("explore funding"));
truthy("tags distinct (missing vs zero)", pMissing.tag !== pZero.tag);
eq("valid: presentation null (normal verdict permitted)", IR.insurancePresentation("valid"), null);
// Suppression: for BOTH unresolved states the overlay is non-null (the analyzers
// render insP.tag INSTEAD of the cls tag), and no overlay text carries a positive
// income-ready claim.
for (const [name, p] of [["missing", pMissing], ["zero", pZero]]) {
  truthy(`${name}: overlay non-null -> STRONG SIGNAL suppressed`, p != null);
  truthy(`${name}: no STRONG SIGNAL in overlay`, !(p.tag + p.label + p.sub).includes("STRONG SIGNAL"));
  truthy(`${name}: no lender-ready claim`, !/is lender-ready/i.test(p.tag + p.label + p.sub));
}

// ─── 4. Engine architecture unchanged (hot/warm/pass; finite coerced values) ──
const ltrIn = { price: 250000, rentMo: 2400, tax: 3000, hoa: 0 };
const mL_blank = FIN.computeLtr({ ...ltrIn, ins: undefined });
const mL_zero = FIN.computeLtr({ ...ltrIn, ins: 0 });
const mL_valid = FIN.computeLtr({ ...ltrIn, ins: 1400 });
eq("LTR engine: blank == zero DSCR (coercion unchanged)", mL_blank.dscr, mL_zero.dscr);
truthy("LTR engine: blank DSCR finite (not rewritten to null)", Number.isFinite(mL_blank.dscr));
truthy("LTR engine: insurance lowers DSCR", mL_valid.dscr < mL_blank.dscr);
truthy("LTR verdict emits hot|warm|pass", ["hot", "warm", "pass"].includes(FIN.ltrVerdict(mL_blank).cls));
const brrrIn = { price: 200000, rehab: 40000, arv: 320000, rent: 2600, tax: 3200, hoa: 0 };
const mB_blank = FIN.computeBrrr({ ...brrrIn, ins: undefined });
const mB_zero = FIN.computeBrrr({ ...brrrIn, ins: 0 });
const mB_valid = FIN.computeBrrr({ ...brrrIn, ins: 1400 });
eq("BRRR engine: blank == zero DSCR", mB_blank.dscr, mB_zero.dscr);
truthy("BRRR engine: insurance lowers DSCR", mB_valid.dscr < mB_blank.dscr);
truthy("BRRR verdict emits hot|warm|pass", ["hot", "warm", "pass"].includes(FIN.brrrVerdict(mB_blank).cls));

// ─── 5. Handoff omission — LTR and BRRR, all three states ────────────────────
// Result objects mirror how ltr.js/brrr.js assemble lastLtrResult/lastBrrrResult
// (ins coerced ||0 with insStatus carrying the true state).
const resultOf = (type, m, insRaw) => ({
  type,
  ins: insRaw || 0,
  insStatus: IR.insuranceStatus(insRaw),
  NOI: m.NOI,
  dscr: m.dscr,
  cashFlowYr: m.cashFlowYr,
  cashFlowMo: m.cashFlowMo,
  capRate: m.capRate,
  verdict: "Strong Rental — Lender-Ready",
  rent: 2400,
  tax: 3000,
  hoa: 0,
});
const INS_KEYS = [
  "annualInsurance",
  "screenerNoi",
  "screenerDscr",
  "screenerCashFlowAnnual",
  "screenerCashFlowMonthly",
  "screenerCapRate",
  "screenerVerdict",
  "dscr",
];
const definedKeys = (h) => INS_KEYS.filter((k) => h[k] !== undefined);
// Mirrors funding.js buildCpcUrl's serializer rule (unchanged by this release).
const serialized = (h) => {
  const p = new URLSearchParams();
  for (const k of INS_KEYS) {
    const v = h[k];
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p;
};

for (const [type, mm] of [["ltr", [mL_blank, mL_zero, mL_valid]], ["brrr", [mB_blank, mB_zero, mB_valid]]]) {
  const [mBlank, mZero, mValid] = mm;
  const hMissing = IR.insuranceDependentHandoff(resultOf(type, mBlank, undefined));
  const hZero = IR.insuranceDependentHandoff(resultOf(type, mZero, 0));
  const hValid = IR.insuranceDependentHandoff(resultOf(type, mValid, 1400));

  // missing: every insurance-dependent param omitted
  eq(`${type} missing: zero defined insurance-dependent params`, definedKeys(hMissing).length, 0);
  for (const k of INS_KEYS) eq(`${type} missing: ${k} absent`, hMissing[k], undefined);
  // explicit_zero: identical omission set (blocking equivalence)
  eq(`${type} zero: zero defined insurance-dependent params`, definedKeys(hZero).length, 0);
  eq(
    `${type} zero: omission set identical to missing`,
    JSON.stringify(definedKeys(hZero)),
    JSON.stringify(definedKeys(hMissing))
  );
  for (const k of INS_KEYS) eq(`${type} zero: ${k} absent`, hZero[k], undefined);
  // serializer hygiene: nothing reaches the query for unresolved states
  eq(`${type} missing: serialized query empty`, serialized(hMissing).toString(), "");
  eq(`${type} zero: serialized query empty`, serialized(hZero).toString(), "");
  // valid: values transfer, finite, well-formed
  eq(`${type} valid: annualInsurance transfers`, hValid.annualInsurance, 1400);
  truthy(`${type} valid: screenerDscr finite > 0`, Number.isFinite(hValid.screenerDscr) && hValid.screenerDscr > 0);
  eq(`${type} valid: base dscr matches screenerDscr`, hValid.dscr, hValid.screenerDscr);
  truthy(`${type} valid: screenerNoi finite`, Number.isFinite(hValid.screenerNoi));
  truthy(`${type} valid: screenerCapRate finite`, Number.isFinite(hValid.screenerCapRate));
  truthy(`${type} valid: cash flow finite`, Number.isFinite(hValid.screenerCashFlowAnnual) && Number.isFinite(hValid.screenerCashFlowMonthly));
  eq(`${type} valid: screenerVerdict string`, typeof hValid.screenerVerdict, "string");
  const sp = serialized(hValid);
  for (const [k, v] of sp.entries()) {
    truthy(`${type} valid: param ${k} not empty/undefined/null/NaN`, v !== "" && v !== "undefined" && v !== "null" && v !== "NaN");
  }
  truthy(`${type} valid: all 8 insurance-dependent params present`, definedKeys(hValid).length === INS_KEYS.length);
}

// ─── 6. Legacy result fallback (saved pipeline deals) ────────────────────────
eq("legacy held: insMissing:true -> missing", IR.resultInsuranceStatus({ insMissing: true }), "missing");
eq("legacy public: ins:0 (coerced blank) -> explicit_zero (safe: same omission)", IR.resultInsuranceStatus({ ins: 0 }), "explicit_zero");
eq("legacy public: ins:1500 -> valid", IR.resultInsuranceStatus({ ins: 1500 }), "valid");
eq("insStatus wins over ins value", IR.resultInsuranceStatus({ insStatus: "explicit_zero", ins: 1500 }), "explicit_zero");
eq("no result -> missing (fail-safe)", IR.resultInsuranceStatus(null), "missing");

// ─── 7. Summary warnings + no-contradiction contract ─────────────────────────
truthy("summary missing: warns NOT ENTERED", IR.insuranceSummaryWarning("missing").includes("INSURANCE NOT ENTERED"));
truthy("summary zero: warns $0 confirm", /\$0/.test(IR.insuranceSummaryWarning("explicit_zero")) && /confirm/i.test(IR.insuranceSummaryWarning("explicit_zero")));
eq("summary valid: no warning", IR.insuranceSummaryWarning("valid"), null);
// The breakdown NOI + DSCR replacement text is the SAME Pending token the headline
// uses — the detail rows cannot contradict the headline for either unresolved state.
eq("no-contradiction: missing pendingText", pMissing.pendingText, "Pending");
eq("no-contradiction: zero pendingText", pZero.pendingText, "Pending");

// ─── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("All Phase A insurance-readiness + handoff assertions pass ✓");
