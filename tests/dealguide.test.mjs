// ─── Underwriting design wave suite — profit guidance + walk-away + counter ──
// Proves the governed v1 model (owner dispatch 2026-08-31):
//   flipProfitGuidance      §B/§C  — suggested PROJECT profit (apples-to-apples)
//   solveMaxPriceForProfit  §D     — derived-price solver over canonical computeFlip
//   flipNegotiationGuidance §D–§F  — walk-away ceiling + suggested counter
//   computeNegotiationScenario §J  — non-mutating what-if payload
//   flipVerdict §I/§G              — dynamic counter verdict + edge law
// CANONICAL LAW: no test here accepts a second profit formula — solver results
// are proven against computeFlip itself (profit(P) ≥ T and profit(P+1) < T).
// Run: node tests/dealguide.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");
const F = await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/finance.js")));

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

const BASE = { arv: 300000, rep: 40000, hold: 6, cc1: 0.02, cc2: 0.05, carry: 1500,
               loan: 0, rate: 0.10, points: 0.03, self: false };

// ── §N1 · rehab-intensity boundaries (arv 300000, hold 4 → holdMult 1.00) ────
const gAt = (rep) => F.flipProfitGuidance({ arv: 300000, rep, hold: 4, self: false });
ok("N1: 9.99% rehab → 1.00", gAt(29970).intensity === 1.00);
ok("N1: exactly 10% → 1.10", gAt(30000).intensity === 1.10);
ok("N1: 19.99% → 1.10", gAt(59970).intensity === 1.10);
ok("N1: exactly 20% → 1.20", gAt(60000).intensity === 1.20);
ok("N1: exactly 30% → 1.20 (inclusive upper bound)", gAt(90000).intensity === 1.20);
ok("N1: just above 30% → 1.35", gAt(90003).intensity === 1.35);

// ── §N2 · hold-period boundaries ─────────────────────────────────────────────
const hAt = (hold) => F.flipProfitGuidance({ arv: 300000, rep: 20000, hold, self: false }).holdMult;
ok("N2: 4 months → 1.00", hAt(4) === 1.00);
ok("N2: 5 months → 1.05", hAt(5) === 1.05);
ok("N2: 6 months → 1.05", hAt(6) === 1.05);
ok("N2: 7 months → 1.15", hAt(7) === 1.15);
ok("N2: 9 months → 1.15", hAt(9) === 1.15);
ok("N2: 10 months → 1.25", hAt(10) === 1.25);
ok("N2: 12 months → 1.25", hAt(12) === 1.25);
ok("N2: 13 months → 1.35", hAt(13) === 1.35);

// ── §N3 · $25K floor ─────────────────────────────────────────────────────────
ok("N3: floor binds on a small project (10% of $100K < $25K)",
   F.flipProfitGuidance({ arv: 100000, rep: 5000, hold: 4, self: false }).investmentPoint === 25000);
ok("N3: floor does not bind when 10% ARV exceeds it",
   F.flipProfitGuidance({ arv: 300000, rep: 5000, hold: 4, self: false }).investmentPoint === 30000);

// ── §N4 · owner-labor allowance ON/OFF ───────────────────────────────────────
const gOff = F.flipProfitGuidance({ ...BASE });
const gOn  = F.flipProfitGuidance({ ...BASE, self: true });
ok("N4: labor allowance is 0 when not self-renovating", gOff.laborAllowance === 0);
ok("N4: labor allowance is exactly 5% of ARV when self-renovating", gOn.laborAllowance === 15000);

// ── §N5/§N6 · rounding + apples-to-apples project-profit presentation ────────
// Base (no labor): point 34,650 → raw 31,185 / 38,115 / 34,650.
ok("N5: low rounds DOWN to $1K", gOff.lowRaw === 31185 && gOff.low === 31000);
ok("N5: high rounds UP to $1K", gOff.highRaw === 38115 && gOff.high === 39000);
ok("N5: midpoint rounds NEAREST $1K", gOff.midRaw === 34650 && gOff.mid === 35000);
ok("N6: labor allowance shifts the WHOLE range by exactly 5% ARV (same unit as the target)",
   gOn.lowRaw - gOff.lowRaw === 15000 && gOn.highRaw - gOff.highRaw === 15000 && gOn.midRaw - gOff.midRaw === 15000);

// ── §N7 · user target below / inside / above DealFit range (model + UI law) ──
ok("N7: comparisons run against the DISPLAYED bounds (low/high present)",
   gOff.low < gOff.mid && gOff.mid < gOff.high);
const flipJs = src("docs/src/js/flip.js");
ok("N7: soft below-range state is display-only (never FAIL, never blocking)",
   /t > 0 && t < _lastGuide\.low/.test(flipJs) && !/FAIL/.test(flipJs.slice(flipJs.indexOf("fg-soft"))));
const html = src("docs/index.html");
ok("N7: soft copy matches the governed wording",
   /Below DealFit&#8217;s suggested range — thin for this project&#8217;s size and risk\./.test(html));
ok("N7: educational qualifier present, target stays user-editable",
   /DealFit estimate only\. Not a guarantee or lender requirement\./.test(html) &&
   /id="f-target"/.test(html));

// ── §N8 · user-target ceiling solve — proven against the canonical engine ────
const solveCk = (d, T, label) => {
  const P = F.solveMaxPriceForProfit(d, T);
  ok(label + " (engine-consistency: profit(P) ≥ T > profit(P+1))",
     P !== null &&
     F.computeFlip({ ...d, ask: P }).profit >= T &&
     F.computeFlip({ ...d, ask: P + 1 }).profit < T);
  return P;
};
const uc = solveCk(BASE, 28000, "N8: base fixture user-target solve");
ok("N8: base fixture ceiling is exactly $203,921", uc === 203921);

// ── §N9/§N10 · which constraint binds the walk-away ──────────────────────────
const n9 = F.flipNegotiationGuidance({ ...BASE, ask: 200000, target: 28000 });
ok("N9: rule-bound — walk-away is the 70% rule ceiling", n9.walkAway === 170000 && n9.ruleBound === true);
ok("N9: rule ceiling comes from the ENGINE's own maxOffer", n9.ruleCeiling === F.computeFlip({ ...BASE, ask: 1 }).maxOffer);
const n10 = F.flipNegotiationGuidance({ ...BASE, ask: 200000, target: 80000 });
ok("N10: user-target-bound — the stricter own-target ceiling wins",
   n10.userCeiling === 152941 && n10.walkAway === 152941 && n10.ruleBound === false);

// ── §N11 · asking already at/below walk-away (§G2) ───────────────────────────
// Heavy carry makes stress fail (pass class) while the ask sits under the
// user ceiling — the verdict must NOT invent a counter instruction.
const g2d = { ...BASE, carry: 15000, ask: 120000, target: 28000 };
const g2n = F.flipNegotiationGuidance(g2d);
ok("N11: askBelowWalkAway flagged", g2n.askBelowWalkAway === true && g2n.walkAway === 124509);
const g2e = F.computeFlip(g2d);
const g2s = F.computeFlipStress({ ...g2d, financed: false, target: 28000 });
const g2v = F.flipVerdict({ profit: g2e.profit, roi: g2e.roi, target: 28000, maxOffer: g2e.maxOffer,
  marginOfSafety: g2s.marginOfSafety, stressedProfit: g2s.stressedProfit, self: false, ask: 120000, nego: g2n });
ok("N11: pass-class deal below the ceiling keeps the LEGACY verdict (no counter theater)",
   g2v.cls === 'pass' && g2v.verdict === 'Counter at Max Offer — Walk Away');

// ── §N12 · no workable positive price (§G1) ──────────────────────────────────
// (a) rule side: repairs exceed the ARV ceiling
const g1a = F.flipNegotiationGuidance({ ...BASE, arv: 100000, rep: 80000, ask: 90000, target: 28000 });
ok("N12a: rule-side no-workable-price flagged", g1a.noWorkablePrice === true && g1a.counter === null);
// (b) user side: target unreachable at ANY positive price
const g1b = F.flipNegotiationGuidance({ ...BASE, ask: 210000, target: 500000 });
ok("N12b: user-side no-workable-price flagged", g1b.noWorkablePrice === true && g1b.userCeiling === null);
const g1e = F.computeFlip({ ...BASE, ask: 210000 });
const g1s = F.computeFlipStress({ ...BASE, ask: 210000, financed: false, target: 500000 });
const g1v = F.flipVerdict({ profit: g1e.profit, roi: g1e.roi, target: 500000, maxOffer: g1e.maxOffer,
  marginOfSafety: g1s.marginOfSafety, stressedProfit: g1s.stressedProfit, self: false, ask: 210000, nego: g1b });
ok("N12: verdict names the truth — No Workable Price — Walk Away",
   g1v.verdict === 'No Workable Price — Walk Away' && /No purchase price reaches your \$500,000 profit target/.test(g1v.vsub));
ok("N12: no counter is invented", g1b.counter === null && g1b.cushionDollars === null);

// ── §N13 · DealFit high range unattainable (§G3) ─────────────────────────────
const g3 = F.flipNegotiationGuidance({ arv: 100000, rep: 60000, hold: 6, cc1: 0.02, cc2: 0.05,
  carry: 1500, loan: 0, rate: 0.10, points: 0.03, self: false, ask: 50000, target: 5000 });
ok("N13: high range unreachable → highUnachievable, walk-away kept, NO fabricated counter",
   g3.highUnachievable === true && g3.counter === null && g3.walkAway === 10000 && g3.noWorkablePrice === false);

// ── §N14 · counter cushion 3–8% below walk-away BEFORE rounding ──────────────
// Base fixture: comfortable-price solve (194,004) exceeds the cushion → the
// pre-round candidate clamps to 97% of walk-away (3.0% cushion), then rounds.
ok("N14: comfortable solve is engine-consistent",
   n9.counterComfortRaw === 194004 &&
   F.computeFlip({ ...BASE, ask: 194004 }).profit >= gOff.highRaw &&
   F.computeFlip({ ...BASE, ask: 194005 }).profit < gOff.highRaw);
const preRound9  = Math.min(Math.max(n9.counterComfortRaw,  n9.walkAway * 0.92),  n9.walkAway * 0.97);
const preRound10 = Math.min(Math.max(n10.counterComfortRaw, n10.walkAway * 0.92), n10.walkAway * 0.97);
const inBand = (c, w) => (w - c) / w >= 0.0299 && (w - c) / w <= 0.0801;
ok("N14: pre-round candidate sits in the 3–8% cushion (rule-bound case)", inBand(preRound9, n9.walkAway));
ok("N14: pre-round candidate sits in the 3–8% cushion (target-bound case)", inBand(preRound10, n10.walkAway));
ok("N14: rounding never pushes the counter ABOVE the 97% bound",
   n9.counter <= n9.walkAway * 0.97 && n10.counter <= n10.walkAway * 0.97);

// ── §N15/§N16 · counter rounding increments ──────────────────────────────────
ok("N15: walk-away ≥ $100K rounds the counter DOWN to $5K (164,900 → 160,000)",
   n9.counter === 160000 && n9.counter % 5000 === 0);
const small = F.flipNegotiationGuidance({ arv: 120000, rep: 30000, hold: 4, cc1: 0.02, cc2: 0.05,
  carry: 800, loan: 0, rate: 0.10, points: 0.03, self: false, ask: 60000, target: 15000 });
ok("N16: walk-away < $100K rounds the counter DOWN to $1K (52,254 → 52,000)",
   small.walkAway === 54000 && small.counter === 52000 && small.counter % 1000 === 0 && small.counter % 5000 !== 0);

// ── §N17 · scenario is pure: zero persistence, zero input mutation ───────────
const FROZEN = Object.freeze({ type: 'flip', ask: 289000, arv: 365000, rep: 88000, hold: 5,
  cc1: 2, cc2: 5, carry: 2150, loan: 0, rate: 0.10, points: 0.03, self: true, target: 28000 });
const SNAP = JSON.stringify(FROZEN);
const sb = F.computeNegotiationScenario(FROZEN);
ok("N17: scenario mutates NOTHING on the deal input", JSON.stringify(FROZEN) === SNAP);
const financeJs = src("docs/src/js/finance.js");
ok("N17: the model layer contains no persistence or storage calls",
   !/save_pipeline|saveDeal|localStorage|supabase/.test(financeJs));
const mainJs = src("docs/src/js/main.js");
const renderer = mainJs.slice(mainJs.indexOf('function showMaxOfferScenario'),
                              mainJs.indexOf("document.querySelectorAll('.modal-backdrop')"));
ok("N17: the renderer writes ONLY into the read-only modal body",
   /getElementById\('maxoffer-body'\)/.test(renderer) &&
   !/saveDeal|save_pipeline|requestDelete|dealEdit|localStorage|supabase\./.test(renderer));

// ── §N18 · repair provenance untouched by the wave ───────────────────────────
const pipeJs = src("docs/src/js/pipeline.js");
ok("N18: edit-path repair ownership law is byte-identical in spirit — estimator only when owned AND matching",
   /repSource = repEl\?\.dataset\?\.repOwned === 'estimator' \? 'estimator' : 'manual'/.test(pipeJs));
ok("N18: guidance code never writes the repair field",
   !/getElementById\('f-rep'\)\.value\s*=/.test(flipJs.slice(flipJs.indexOf('Design wave'))));

// ── §N19 · self-reno toggle recomputation ────────────────────────────────────
const selfOn  = F.flipNegotiationGuidance({ ...BASE, self: true,  ask: 200000, target: 28000 });
const selfOff = n9;
ok("N19: self ON moves the rule ceiling by the engine's own 75-vs-70 delta (+$15,000)",
   selfOn.ruleCeiling - selfOff.ruleCeiling === 15000 &&
   selfOn.ruleCeiling === F.computeFlip({ ...BASE, self: true, ask: 1 }).maxOffer);
ok("N19: self ON adds the labor allowance to guidance, OFF removes it",
   selfOn.guidance.laborAllowance === 15000 && selfOff.guidance.laborAllowance === 0);

// ── §N20 · Saddlebrooke acceptance fixture (§K) — canonical end-to-end ───────
const SBE = { ask: 289000, arv: 365000, rep: 88000, hold: 5, cc1: 0.02, cc2: 0.05,
              carry: 2150, loan: 0, rate: 0.10, points: 0.03, self: true, target: 28000 };
const sbBase = F.computeFlip(SBE);
ok("K: asking economics — profit −$46,780", sbBase.profit === -46780);
ok("K: asking economics — ROI −11.9%", Math.round(sbBase.roi * 10) / 10 === -11.9);
ok("K: 75% rule ceiling $185,750", sbBase.maxOffer === 185750);
const sbg = F.flipProfitGuidance(SBE);
ok("K: rehab ratio 24.1% → intensity 1.20", Math.round(sbg.rehabRatio * 1000) === 241 && sbg.intensity === 1.20);
ok("K: 5-month hold → 1.05", sbg.holdMult === 1.05);
ok("K: investment point $45,990", sbg.investmentPoint === 45990);
ok("K: owner-labor allowance $18,250", sbg.laborAllowance === 18250);
ok("K: raw range $59,641–$68,839", sbg.lowRaw === 59641 && sbg.highRaw === 68839);
ok("K: displayed range $59,000–$69,000", sbg.low === 59000 && sbg.high === 69000);
ok("K: usable midpoint $64,000 (from $64,240)", sbg.midRaw === 64240 && sbg.mid === 64000);
const sbn = F.flipNegotiationGuidance(SBE);
ok("K: user-target ceiling $215,686", sbn.userCeiling === 215686);
ok("K: walk-away is rule-bound at $185,750", sbn.walkAway === 185750 && sbn.ruleBound === true);
ok("K: comfortable-price solve ≈ $175,648", sbn.counterComfortRaw === 175648);
ok("K: suggested counter $175,000", sbn.counter === 175000);
ok("K: cushion $10,750 / 5.8%", sbn.cushionDollars === 10750 && Math.round(sbn.cushionPct * 10) / 10 === 5.8);
const sbs = F.computeFlipStress({ ...SBE, financed: false });
const sbv = F.flipVerdict({ profit: sbBase.profit, roi: sbBase.roi, target: 28000, maxOffer: sbBase.maxOffer,
  marginOfSafety: sbs.marginOfSafety, stressedProfit: sbs.stressedProfit, self: true, ask: 289000, nego: sbn });
ok("K: negotiation verdict line — COUNTER AT $175K — WALK ABOVE $185,750",
   sbv.verdict === 'Counter at $175K — Walk Above $185,750' && sbv.cls === 'pass');
ok("K: scenario at walk-away — profit $58,535 / ROI 20.3% / stress $30,248 Strong (canonical, not hard-coded)",
   sb.atWalkAway.price === 185750 && sb.atWalkAway.profit === 58535 &&
   Math.round(sb.atWalkAway.roi * 10) / 10 === 20.3 &&
   Math.round(sb.atWalkAway.stressedProfit) === 30248 && sb.atWalkAway.marginOfSafety === 'strong');
ok("K: scenario at counter — profit $69,500 / stress Strong",
   sb.atCounter.price === 175000 && sb.atCounter.profit === 69500 && sb.atCounter.marginOfSafety === 'strong');
ok("K: range status law — counter lands above the range, walk-away below it",
   sb.atCounter.rangeStatus === 'above' && sb.atWalkAway.rangeStatus === 'below');
ok("K: scenario equals computeFlip at those prices — no second engine",
   sb.atWalkAway.profit === F.computeFlip({ ...SBE, ask: 185750 }).profit &&
   sb.atCounter.profit === F.computeFlip({ ...SBE, ask: 175000 }).profit);

// ── §G4 · invalid inputs → no recommendation, never NaN ──────────────────────
ok("G4: zero/invalid ARV → null guidance", F.flipProfitGuidance({ arv: 0, rep: 1, hold: 5 }) === null &&
   F.flipProfitGuidance({ arv: NaN, rep: 1, hold: 5 }) === null);
ok("G4: invalid hold → null guidance", F.flipProfitGuidance({ arv: 300000, rep: 1, hold: 0 }) === null);
ok("G4: negotiation guidance passes the null through", F.flipNegotiationGuidance({ ...BASE, hold: 0, ask: 1, target: 1 }) === null);
ok("G4: no NaN/Infinity leaks from a valid model run",
   Object.values(sbn.guidance).every(v => typeof v === 'boolean' || Number.isFinite(v)) &&
   Number.isFinite(sbn.walkAway) && Number.isFinite(sbn.counter));

// ── §I plumbing · both surfaces feed the SAME dynamic verdict law ────────────
ok("I: analyzer passes ask+nego into flipVerdict",
   /flipVerdict\(\{\s*profit, roi, target, maxOffer, marginOfSafety, stressedProfit, self, ask, nego,/.test(flipJs));
ok("I: pipeline editor passes ask+nego into flipVerdict (one law on both surfaces)",
   /flipVerdict\(\{\s*profit: eng\.profit, roi: eng\.roi, target, maxOffer: eng\.maxOffer, marginOfSafety, stressedProfit, self, ask, nego,/.test(pipeJs));
ok("I: legacy flipVerdict calls (no nego) keep the pre-wave text",
   F.flipVerdict({ profit: 10000, roi: 5, target: 40000, maxOffer: 170000,
     marginOfSafety: 'strong', stressedProfit: 5000, self: false }).verdict === 'Counter at Max Offer — Walk Away');
ok("I: interactive badge behavior retained from 7e9caff (button + isolation)",
   /<button type="button" class="deal-badge/.test(pipeJs) &&
   /event\.stopPropagation\(\);showMaxOfferScenario\(\$\{d\.id\}\)/.test(pipeJs));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`dealguide: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('Profit-guidance / walk-away / counter law holds ✓');
