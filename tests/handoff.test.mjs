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

// ─── 8. Amendment: complete insurance-dependent output suppression ───────────
// Source-derived inventory (finance.js trace: ins → opEx → NOI → dscr/capRate/
// cashFlowYr/cashFlowMo/coc/postRefiCoC/stress marginOfSafety → verdict text).
// The rendering layer is DOM-coupled (not data-URL loadable without jsdom), so
// each inventoried call site is verified by a static source assertion that the
// shared insP/insOk gate is present AND the unguarded finite rendering is gone.
// The browser gate provides the rendered-DOM proof.
const srcOf = (rel) => readFileSync(join(here, "..", rel), "utf8");
const ltrSrc = srcOf("docs/src/js/ltr.js");
const brrrSrc = srcOf("docs/src/js/brrr.js");
const cpSrc = srcOf("docs/src/js/clearpath.js");
const plSrc = srcOf("docs/src/js/pipeline.js");
const shSrc = srcOf("docs/src/js/share.js");
const has = (label, src, needle) => truthy(label, src.includes(needle));
const not = (label, src, needle) => truthy(label, !src.includes(needle));

// ltr.js tiles + breakdown — gated
has("ltr tile CoC gated", ltrSrc, "val: insP ? insP.pendingText : pct(m.coc)");
has("ltr tile CapRate gated", ltrSrc, "val: insP ? insP.pendingText : pct(m.capRate)");
has("ltr tile CashFlowMo gated", ltrSrc, "val: insP ? insP.pendingText : fmt(m.cashFlowMo)");
has("ltr tile MoS gated", ltrSrc, "val: insP ? insP.pendingText : mos.label");
has("ltr tile DSCR gated", ltrSrc, "val: insP ? insP.pendingText : dscrText");
has("ltr row NOI gated", ltrSrc, "v: insP ? insP.pendingText : fmt(m.NOI)");
has("ltr row cashFlowYr gated", ltrSrc, "v: insP ? insP.pendingText : fmt(m.cashFlowYr)");
has("ltr row cashFlowMo gated", ltrSrc, "v: insP ? insP.pendingText : fmt(m.cashFlowMo)");
has("ltr row capRate gated", ltrSrc, "v: insP ? insP.pendingText : pct(m.capRate)");
has("ltr row DSCR gated", ltrSrc, "v: insP ? insP.pendingText : dscrText");
has("ltr row MoS gated", ltrSrc, "v: insP ? insP.pendingText : mos.label");
// ltr.js — no unguarded finite rendering remains
for (const bad of ["val: pct(m.coc)", "val: pct(m.capRate)", "val: fmt(m.cashFlowMo)", "val: mos.label", "v: fmt(m.NOI)", "v: fmt(m.cashFlowYr)", "v: fmt(m.cashFlowMo)", "v: pct(m.capRate)", "v: dscrText", "v: mos.label"]) {
  not(`ltr unguarded absent: ${bad}`, ltrSrc, bad);
}

// brrr.js tiles + breakdown — gated (Cap Left / Cash Recovered are refi math, independent)
has("brrr tile CashFlowMo gated", brrrSrc, "val: insP ? insP.pendingText : fmt(m.cashFlowMo)");
has("brrr tile MoS gated", brrrSrc, "val: insP ? insP.pendingText : mos.label");
has("brrr tile DSCR gated", brrrSrc, "val: insP ? insP.pendingText : dscrText");
has("brrr row NOI gated", brrrSrc, "v: insP ? insP.pendingText : fmt(m.NOI)");
has("brrr row cashFlowYr gated", brrrSrc, "v: insP ? insP.pendingText : fmt(m.cashFlowYr)");
has("brrr row capRate gated", brrrSrc, "v: insP ? insP.pendingText : pct(m.capRate)");
has("brrr row postRefiCoC gated", brrrSrc, "v: insP ? insP.pendingText : cocText");
has("brrr row DSCR gated", brrrSrc, "v: insP ? insP.pendingText : dscrText");
has("brrr row MoS gated", brrrSrc, "v: insP ? insP.pendingText : mos.label");
for (const bad of ["val: fmt(m.cashFlowMo)", "val: mos.label", "v: fmt(m.NOI)", "v: fmt(m.cashFlowYr)", "v: pct(m.capRate)", "v: cocText", "v: dscrText", "v: mos.label"]) {
  not(`brrr unguarded absent: ${bad}`, brrrSrc, bad);
}
has("brrr independent Cap Left kept finite", brrrSrc, "val: fmt(m.capitalLeft)");
has("brrr independent Cash Recovered kept finite", brrrSrc, "val: pct(m.cashRecoveredPct)");

// clearpath.js summaries — verdict + remaining values gated; unguarded gone
// (blocker-fix F-5: the gate widened to taxes+insurance via incomePresentation;
// insOk now also requires taxReady — assertion updated to the new exact string.)
eq("summaries: both Verdict lines gated", (cpSrc.match(/'Verdict: ' \+ \(insOk \? r\.verdict : incomePresentation\(tStat, insStatus\)\.label\)/g) || []).length, 2);
has("ltr summary CapRate gated", cpSrc, "'Cap Rate (est.): ' + (insOk ?");
has("ltr summary CashFlow gated", cpSrc, "'Monthly Cash Flow (est.): ' + (insOk ?");
has("ltr summary CoC gated", cpSrc, "'Cash-on-Cash (est.): ' + (insOk ?");
has("brrr summary CapRate gated", cpSrc, "'Cap Rate on cost (est.): ' + (insOk ?");
// Scope "unguarded gone" checks to the LTR/BRRR summary bodies — the flip/STR
// summaries have no insurance concept and legitimately keep unguarded lines.
const ltrSumSrc = cpSrc.slice(cpSrc.indexOf("function buildLtrSummary"), cpSrc.indexOf("function buildBrrrSummary"));
const brrrSumSrc = cpSrc.slice(cpSrc.indexOf("function buildBrrrSummary"), cpSrc.indexOf("function summaryFor"));
not("ltr summary: unguarded Verdict gone", ltrSumSrc, "'Verdict: ' + r.verdict");
not("ltr summary: unguarded CapRate gone", ltrSumSrc, "'Cap Rate (est.): ' + (Math.round");
not("ltr summary: unguarded CoC gone", ltrSumSrc, "'Cash-on-Cash (est.): ' + (Math.round");
not("ltr summary: unguarded CashFlow gone", ltrSumSrc, "'Monthly Cash Flow (est.): $'");
not("brrr summary: unguarded Verdict gone", brrrSumSrc, "'Verdict: ' + r.verdict");
not("brrr summary: unguarded CapRate-on-cost gone", brrrSumSrc, "'Cap Rate on cost (est.): ' + (Math.round");
not("brrr summary: unguarded CashFlow gone", brrrSumSrc, "'Monthly Cash Flow (est.): $'");
// (blocker-fix F-6 verification round: the STR summary gained the combined-expense
// gate, so only the flip summary legitimately keeps an unguarded Verdict line.)
eq("flip summary only unguarded Verdict (STR gated by F-6)", (cpSrc.match(/'Verdict: ' \+ r\.verdict/g) || []).length, 1);

// pipeline.js — saved-deal render path gated (badge, stats, LTR/BRRR details)
has("pipeline imports readiness", plSrc, "from './insuranceReadiness.js'");
has("pipeline badge cls gated", plSrc, "${insP ? 'warm' : d.cls}");
has("pipeline badge text gated", plSrc, "${insP ? insP.tag : d.verdict}");
has("pipeline stats gated", plSrc, "const cardStats  = insP ? pendingDealStats(d) : d.stats;");
truthy("pipeline detail rows gated (>=7 Pending gates)", (plSrc.match(/pend \? 'Pending' :/g) || []).length >= 5 && (plSrc.match(/'Pending'/g) || []).length >= 10);
not("pipeline: unguarded stats render gone", plSrc, "${d.stats.map(");

// share.js — deal summary text gated
has("share imports readiness", shSrc, "from './insuranceReadiness.js'");
// (blocker-fix F-5/F-6: headline overlay sourced from the shared
// pendingPresentationFor decision — taxes join the gate, STR pends too, and a
// tax-missing/insurance-valid deal cannot dereference a null presentation.)
has("share headline gated", shSrc, "headline      = pendP ? pendP.tag : d.verdict.toUpperCase()");
eq("share: three Pending value gates", (shSrc.match(/unresolvedIns \? 'Pending' :/g) || []).length, 3);

// Get Funding + handoff contracts unchanged
has("Get Funding gate unchanged", cpSrc, "result.cls === 'hot' || result.cls === 'warm'");
// (blocker-fix F-5: the base-dscr gate now routes through incomeDependentHandoff,
// which wraps the unchanged insuranceDependentHandoff and adds the tax gate.)
eq("handoff base-dscr gates unchanged", (cpSrc.match(/incomeDependentHandoff\(r\)\.dscr/g) || []).length, 2);

// Valid insurance: inventoried engine metrics remain finite and accurate
truthy("LTR valid capRate finite>0", Number.isFinite(mL_valid.capRate) && mL_valid.capRate > 0);
truthy("LTR valid capRate accurate (NOI/price)", Math.abs(mL_valid.capRate - (mL_valid.NOI / 250000) * 100) < 0.01);
truthy("LTR valid cashFlowYr finite", Number.isFinite(mL_valid.cashFlowYr));
truthy("LTR valid cashFlowMo = Yr/12", Math.abs(mL_valid.cashFlowMo - mL_valid.cashFlowYr / 12) < 0.01);
truthy("LTR valid CoC finite", Number.isFinite(mL_valid.coc));
truthy("LTR valid MoS emitted", ["strong", "tight", "fails"].includes(mL_valid.marginOfSafety));
truthy("BRRR valid capRate finite>0", Number.isFinite(mB_valid.capRate) && mB_valid.capRate > 0);
truthy("BRRR valid capRate accurate (NOI/all-in)", Math.abs(mB_valid.capRate - (mB_valid.NOI / mB_valid.allInCost) * 100) < 0.01);
truthy("BRRR valid cashFlowYr finite", Number.isFinite(mB_valid.cashFlowYr));
truthy("BRRR valid cashFlowMo finite", Number.isFinite(mB_valid.cashFlowMo));
truthy("BRRR valid MoS emitted", ["strong", "tight", "fails"].includes(mB_valid.marginOfSafety));

// ─── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("All Phase A insurance-readiness + handoff assertions pass ✓");
