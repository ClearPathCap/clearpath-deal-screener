// Ship-blocker acceptance tests (CPC_ShipBlocker_CodeSpec_2026-06-19).
// Run: node tests/shipblocker.test.mjs
// format.js + finance.js are browser ESM (.js, repo has no "type":"module") with no
// imports, so load them via data: URL (same trick as finance.test.mjs).

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const load = (rel) =>
  import("data:text/javascript," + encodeURIComponent(readFileSync(join(here, "..", rel), "utf8")));

const format = await load("docs/src/js/format.js");
const finance = await load("docs/src/js/finance.js");

// ─── B3 — hardened number parser ──────────────────────────────────────────────
{
  const { parseComma, parseNumOpt } = format;
  // Currency paste parses identically across all analyzers (was 0/NaN before):
  assert.equal(parseComma("$425,000"), 425000);
  assert.equal(parseComma("425 000"), 425000);
  assert.equal(parseComma("425,000"), 425000);
  assert.equal(parseComma("$425,000.50"), 425000.5);
  assert.equal(parseComma(""), 0); // flip contract preserved
  assert.equal(parseComma("abc"), 0);

  // Optional reader → undefined on blank/garbage so finance.js defaults apply:
  assert.equal(parseNumOpt("$1,250"), 1250);
  assert.equal(parseNumOpt("7.25"), 7.25);
  assert.equal(parseNumOpt("20%"), 20); // plain % field tolerated
  assert.equal(parseNumOpt("–5"), -5); // en-dash negative normalized (B2 can then reject it)
  assert.equal(parseNumOpt(""), undefined);
  assert.equal(parseNumOpt("   "), undefined);
  assert.equal(parseNumOpt("abc"), undefined);
  console.log("B3 OK");
}

// ─── B2 — input validation (out-of-range never grades HOT) ────────────────────
{
  const { validateInputs } = finance;
  const hasErr = (t, raw) => validateInputs(t, raw).errors.length > 0;

  assert.ok(hasErr("ltr", { down: 150 })); // 150% down
  assert.ok(hasErr("ltr", { rate: -5 })); // −5% rate
  assert.ok(hasErr("ltr", { vac: 120 })); // vacancy >100
  assert.ok(hasErr("brrr", { refiLtv: 150 })); // refi LTV 150
  assert.ok(hasErr("brrr", { refiLtv: -10 })); // negative
  assert.ok(hasErr("flip", { ask: 100000, rep: 20000, loan: 200000 })); // loan > cost
  assert.ok(!hasErr("ltr", { down: 20, rate: 7.25, vac: 5 })); // sane → no error
  // fat-finger rent fires a soft warning, not a block:
  const r = validateInputs("ltr", { price: 200000, rentMo: 26000 });
  assert.equal(r.errors.length, 0);
  assert.ok(r.warnings.some((w) => w.field === "rent"));

  // post-compute plausibility warnings (DSCR > 3, cap > 20%); no-op for flip metrics.
  const { plausibilityWarnings } = finance;
  assert.equal(plausibilityWarnings({ dscr: 1.5, capRate: 8 }).length, 0);
  assert.ok(plausibilityWarnings({ dscr: 4.2, capRate: 8 }).some((w) => w.field === "dscr"));
  assert.ok(plausibilityWarnings({ dscr: 1.5, capRate: 25 }).some((w) => w.field === "cap"));
  assert.equal(plausibilityWarnings({}).length, 0);
  console.log("B2 OK");
}

// ─── B5 — DSCR ≥ 1.0 is never COLD ────────────────────────────────────────────
{
  const { computeLtr, ltrVerdict } = finance;
  // Tuned per the spec's instruction to land DSCR in [1.0,1.25) with cashFlowMo just
  // below 0 (the spec's literal rentMo 1850 yields DSCR ~0.82 = COLD; rent raised so
  // the debt is covered, but the CapEx reserve still tips monthly cash flow negative).
  const thin = computeLtr({ price: 250000, rentMo: 2280, down: 20, rate: 7.5, vac: 5,
                            tax: 3200, ins: 1400, capex: 5, maint: 5, pm: 8 });
  assert.ok(thin.dscr >= 1.0 && thin.dscr < 1.25, "expected DSCR in [1.0,1.25), got " + thin.dscr);
  assert.ok(thin.cashFlowMo < 0, "expected slightly negative monthly cash flow, got " + thin.cashFlowMo);
  const v = ltrVerdict(thin);
  assert.equal(v.cls, "warm"); // NOT 'pass'
  assert.ok(/Thin After Reserves/.test(v.verdict));

  // DSCR < 1.0 is still COLD "Negative Leverage":
  const cold = computeLtr({ price: 250000, rentMo: 1200, down: 20, rate: 7.5 });
  const cv = ltrVerdict(cold);
  assert.equal(cv.cls, "pass");
  assert.ok(/Negative Leverage/.test(cv.verdict));

  // Do-not-regress: all-cash (dscr null) with positive NOI is NOT COLD; no div-by-zero.
  const allcash = computeLtr({ price: 250000, rentMo: 2000, down: 100, vac: 5, tax: 3000, ins: 1200 });
  assert.equal(allcash.dscr, null);
  assert.ok(Number.isFinite(allcash.coc) && Number.isFinite(allcash.cashFlowYr));
  assert.notEqual(ltrVerdict(allcash).cls, "pass");
  console.log("B5 OK");
}

// ─── #9 — HOT + Tight MoS pairing is reachable (render appends the clarity line) ──
{
  const { computeLtr, ltrVerdict } = finance;
  const m = computeLtr({ price: 300000, rentMo: 3200, down: 20, rate: 8, vac: 5,
                         tax: 2700, ins: 1050, maint: 5, pm: 8, capex: 5, target: 6 });
  assert.equal(ltrVerdict(m).cls, "hot");
  assert.equal(m.marginOfSafety, "tight"); // → render appends " Strong signal, thin cushion."
  console.log("#9 OK (HOT+Tight reachable)");
}

console.log("\nAll ship-blocker tests passed ✓");
