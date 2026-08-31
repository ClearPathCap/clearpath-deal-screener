// ─── REAL-OPERATOR FINAL CORRECTIVE suite ────────────────────────────────────
// Tracks under proof:
//   C · Fix & Flip profit signal law (flipProfitClass) — display classes keyed
//       to the user's OWN Min Profit Target, incl. Aaron's $28k ruling set
//   D · "Counter at Max Offer" what-if (computeMaxOfferScenario) — canonical
//       engine numbers, and PROOF the scenario mutates nothing
//   E · Pro occupied-slot replacement confirmation — source pins on the ruled
//       copy and the per-path confirm-button text
//   A2 · modal body-scroll lock / top-reset law — source pins on main.js and
//        the pipeline/share delegation to the ONE lock-aware implementation
// Run: node tests/dealsignal.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

// finance.js is browser ESM with a .js extension and no "type":"module" in the
// repo — load it via a data: URL (same trick as finance.test.mjs).
const { flipProfitClass, computeMaxOfferScenario, computeFlip } =
  await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/finance.js")));

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── §C · the profit signal law ───────────────────────────────────────────────
// RED: profit <= 0 OR profit < min($10,000, target)
// AMBER: clears red but below target · GREEN: >= target
// Aaron's ruling set at his own $28,000 target:
ok("C: a loss is RED at $28k target",            flipProfitClass(-5000, 28000) === 'bad');
ok("C: exactly $0 is RED",                       flipProfitClass(0, 28000) === 'bad');
ok("C: $5,000 is RED (under the $10k floor)",    flipProfitClass(5000, 28000) === 'bad');
ok("C: $15,000 is AMBER (floor cleared, under target)", flipProfitClass(15000, 28000) === 'warn');
ok("C: $27,999 is still AMBER",                  flipProfitClass(27999, 28000) === 'warn');
ok("C: $28,000 exactly is GREEN",                flipProfitClass(28000, 28000) === 'good');
ok("C: $60,000 is GREEN",                        flipProfitClass(60000, 28000) === 'good');
// Floor law: min($10,000, target) — a modest target lowers the red floor:
ok("C: $7,000 at an $8k target is RED (floor = target)", flipProfitClass(7000, 8000) === 'bad');
ok("C: $8,000 at an $8k target is GREEN (no amber band below a sub-$10k target)",
   flipProfitClass(8000, 8000) === 'good');
ok("C: $10,000 at a $50k target is AMBER (floor capped at $10k)",
   flipProfitClass(10000, 50000) === 'warn');
ok("C: $9,999 at a $50k target is RED",          flipProfitClass(9999, 50000) === 'bad');
// Missing / invalid target falls back to the app default ($40k):
ok("C: no target → $35k is AMBER against the $40k default", flipProfitClass(35000, undefined) === 'warn');
ok("C: no target → $40k is GREEN",               flipProfitClass(40000, null) === 'good');
ok("C: zero/garbage target uses the default, never 'everything is green'",
   flipProfitClass(15000, 0) === 'warn' && flipProfitClass(15000, 'x') === 'warn');

// ── §D · the max-offer what-if runs the CANONICAL engine ─────────────────────
// Saved-deal units law: cc1/cc2 whole numbers, rate/points fractions.
const DEAL_DATA = Object.freeze({
  type: 'flip', ask: 200000, arv: 300000, rep: 40000, hold: 6,
  cc1: 2, cc2: 5, carry: 1500, loan: 0, rate: 0.10, points: 0.03,
  self: false, target: 28000,
});
const BEFORE = JSON.stringify(DEAL_DATA);
const sc = computeMaxOfferScenario(DEAL_DATA);
ok("D: a scenario is produced for a viable deal", !!sc);
// maxOffer is the canonical 70% rule: 300k × 0.70 − 40k = 170,000
ok("D: scenario price is the engine's max offer", sc && sc.offer === 170000);
ok("D: original ask is reported untouched", sc && sc.originalAsk === 200000);
// Hand-computed through the same engine law at ask=170,000:
// cost 210,000 · buy 3,400 · sell 15,000 · hold 9,000 → profit 62,600
ok("D: profit at max offer is the engine's number", sc && sc.profit === 62600);
ok("D: CoC ROI is profit over cash-in (62,600 / 222,400)",
   sc && Math.abs(sc.roi - (62600 / 222400) * 100) < 1e-9);
ok("D: total project cost includes selling costs", sc && sc.totalProject === 237400);
ok("D: target met is judged against the deal's own target", sc && sc.targetMet === true && sc.target === 28000);
// Stress at the scenario price (ARV −5%, rehab +10%, +1 month):
// 285,000 − 14,250 − 214,000 − 3,400 − 10,500 = 42,850 → strong (≥ 0.5×target)
ok("D: stressed profit runs the canonical stress law", sc && sc.stressedProfit === 42850);
ok("D: margin of safety comes from the stress verdict", sc && sc.marginOfSafety === 'strong');
// The engine agrees with itself — the scenario IS computeFlip at the max offer:
const direct = computeFlip({ ask: 170000, arv: 300000, rep: 40000, hold: 6,
  cc1: 0.02, cc2: 0.05, carry: 1500, loan: 0, rate: 0.10, points: 0.03, self: false });
ok("D: no second engine — scenario equals computeFlip at the offer price",
   sc && sc.profit === direct.profit && sc.cashIn === direct.cashIn);
// NON-MUTATION: the input (a frozen stand-in for the saved deal) is byte-identical after.
ok("D: the what-if mutates NOTHING on the deal", JSON.stringify(DEAL_DATA) === BEFORE);
// No scenario when repairs exceed the ARV ceiling (max offer non-positive):
ok("D: an impossible deal returns null, never a fake price",
   computeMaxOfferScenario({ ...DEAL_DATA, arv: 100000, rep: 80000 }) === null);
// Financed deal: scenario keeps the deal's own financing terms.
const fin = computeMaxOfferScenario({ ...DEAL_DATA, loan: 150000 });
const finDirect = computeFlip({ ask: 170000, arv: 300000, rep: 40000, hold: 6,
  cc1: 0.02, cc2: 0.05, carry: 1500, loan: 150000, rate: 0.10, points: 0.03, self: false });
ok("D: financed scenario carries the loan through the engine",
   fin && fin.profit === finDirect.profit && fin.cashIn === finDirect.cashIn);
// Self-perform raises the canonical ceiling to 75%:
const selfSc = computeMaxOfferScenario({ ...DEAL_DATA, self: true });
ok("D: self-perform uses the engine's 75% ceiling", selfSc && selfSc.offer === 185000);

// ── §D-wiring · both entry points are read-only renderers ────────────────────
const mainJs = src("docs/src/js/main.js");
const pipeJs = src("docs/src/js/pipeline.js");
const flipJs = src("docs/src/js/flip.js");
const html   = src("docs/index.html");
const renderer = mainJs.slice(mainJs.indexOf('function showMaxOfferScenario'),
                              mainJs.indexOf('document.querySelectorAll(\'.modal-backdrop\')'));
ok("D: renderer exists in main.js", renderer.length > 100);
ok("D: renderer never saves, duplicates, or edits a deal",
   !/saveDeal|save_pipeline|requestDelete|dealEdit|\.push\(|localStorage|supabase\./.test(renderer));
ok("D: renderer writes ONLY into the read-only modal body",
   /getElementById\('maxoffer-body'\)/.test(renderer) && (renderer.match(/innerHTML/g) || []).length <= 2);
ok("D: analyzer entry — verdict button lives in the verdict block and opens the scenario",
   /id="fv-whatif"[^>]*onclick="showMaxOfferScenario\('analyzer'\)"/.test(html));
ok("D: flip.js shows the button only when a positive max offer exists",
   /maxOffer > 0/.test(flipJs.slice(flipJs.indexOf("fv-whatif") - 400, flipJs.indexOf("fv-whatif") + 400)));
ok("D: pipeline entry — expanded flip detail links the scenario by deal id",
   /showMaxOfferScenario\(\$\{deal\.id\}\)/.test(pipeJs));
ok("D: the modal exists with a Close-only action row (no mutating buttons)",
   /id="modal-maxoffer"/.test(html) &&
   /closeModal\('modal-maxoffer'\)/.test(html) &&
   !/onclick="(save|confirm|apply)/i.test(html.slice(html.indexOf('id="modal-maxoffer"'), html.indexOf('id="modal-maxoffer"') + 900)));

// ── §E · Pro occupied-slot replacement confirmation (source pins) ────────────
const proBranch = mainJs.slice(mainJs.indexOf("if (tier === 'pro')", mainJs.indexOf('function handleSlotClick')),
                               mainJs.indexOf('const cooldownDays'));
ok("E: Pro replacement warns with the ruled copy — replace phrasing",
   /Replace \$\{label\}\? Choosing another region will replace this market slot\./.test(proBranch));
ok("E: Pro replacement copy reassures about underwritten deals",
   /Deals already underwritten in \$\{label\} will keep their saved region\./.test(proBranch));
ok("E: Pro path routes through the SAME confirm modal (no new modal, no stacking)",
   /openModal\('modal-market-confirm'\)/.test(proBranch) && /_pendingSlotChange = slotIndex/.test(proBranch));
ok("E: Pro confirm button reads 'Choose another region'",
   /textContent = 'Choose another region'/.test(proBranch));
ok("E: lower tiers keep their cooldown copy AND restore the 'Continue' label",
   /locks that slot for \$\{cooldownDays\} days/.test(mainJs) &&
   /textContent = 'Continue'/.test(mainJs));
// Ordering pin: the NOT-active populated branch (instant switch, toast, no
// popup) must come BEFORE the Pro confirm — switching between configured
// slots stays frictionless; only replacing the ACTIVE slot's market warns.
const slotFn = mainJs.slice(mainJs.indexOf('function handleSlotClick'),
                            mainJs.indexOf('function confirmMarketChange'));
const switchIdx = slotFn.indexOf('slotIndex !== _activeSlot');
const proIdx    = slotFn.indexOf("tier === 'pro'");
ok("E: instant switch between configured slots precedes (and bypasses) the confirm",
   switchIdx > -1 && proIdx > -1 && switchIdx < proIdx &&
   /setActiveSlot\(slotIndex\)/.test(slotFn.slice(switchIdx, proIdx)) &&
   !/openModal/.test(slotFn.slice(switchIdx, slotFn.indexOf('return;', switchIdx))));
ok("E: Pro branch returns before the lock/cooldown path — no stacked warnings",
   proIdx < slotFn.indexOf('isSlotLocked') &&
   /return;/.test(slotFn.slice(proIdx, slotFn.indexOf('isSlotLocked'))));

// ── §A2 · modal scroll law (source pins on the ONE implementation) ───────────
const openImpl  = mainJs.slice(mainJs.indexOf('function openModal'),  mainJs.indexOf('function closeModal'));
const closeImpl = mainJs.slice(mainJs.indexOf('function closeModal'), mainJs.indexOf('// ─── Track D'));
ok("A2: opening the first modal position-fixes the body at its scroll offset",
   /b\.position = 'fixed'/.test(openImpl) && /b\.top = \(-_scrollLockY\) \+ 'px'/.test(openImpl));
ok("A2: every open resets the modal surface to the TOP",
   /surface\.scrollTop = 0/.test(openImpl));
ok("A2: closing the last modal restores the body and the exact page scroll",
   /b\.position = ''/.test(closeImpl) && /window\.scrollTo\(0, _scrollLockY\)/.test(closeImpl));
ok("A2: backdrop clicks route through closeModal (the lock can never leak)",
   /closeModal\(m\.id\)/.test(mainJs) &&
   !/m\.classList\.remove\('active'\)/.test(mainJs));
// pipeline.js / share.js had their own bare-class helpers — they now delegate
// so their modals get the same body lock:
for (const [name, s] of [["pipeline.js", pipeJs], ["share.js", src("docs/src/js/share.js")]]) {
  ok(`A2: ${name} delegates openModal to the lock-aware window implementation`,
     /window\.openModal\s*\|\|/.test(s) && /window\.closeModal\s*\|\|/.test(s));
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`dealsignal: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
