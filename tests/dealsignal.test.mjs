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
const { flipProfitClass, computeNegotiationScenario, computeFlip } =
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

// ── §D · the negotiation what-if runs the CANONICAL engine ───────────────────
// DESIGN-WAVE RE-PIN (same-commit law): the what-if evolved from the single
// max-offer view into the negotiation plan (counter + walk-away). The deep
// model law lives in dealguide.test.mjs; these pins hold the scenario payload
// to the canonical engine and to non-mutation.
// Saved-deal units law: cc1/cc2 whole numbers, rate/points fractions.
const DEAL_DATA = Object.freeze({
  type: 'flip', ask: 200000, arv: 300000, rep: 40000, hold: 6,
  cc1: 2, cc2: 5, carry: 1500, loan: 0, rate: 0.10, points: 0.03,
  self: false, target: 28000,
});
const BEFORE = JSON.stringify(DEAL_DATA);
const sc = computeNegotiationScenario(DEAL_DATA);
ok("D: a scenario is produced for a viable deal", !!sc && !sc.noWorkablePrice);
ok("D: original ask is reported untouched", sc && sc.originalAsk === 200000);
// Walk-away is the engine's 70% rule here (170,000 < user ceiling 203,921):
ok("D: walk-away is the canonical rule ceiling", sc && sc.walkAway === 170000 && sc.ruleBound === true);
// Hand-computed through the same engine law at the walk-away (ask=170,000):
// cost 210,000 · buy 3,400 · sell 15,000 · hold 9,000 → profit 62,600
ok("D: profit at the walk-away is the engine's number", sc && sc.atWalkAway.profit === 62600);
ok("D: CoC ROI is profit over cash-in (62,600 / 222,400)",
   sc && Math.abs(sc.atWalkAway.roi - (62600 / 222400) * 100) < 1e-9);
ok("D: total project cost includes selling costs", sc && sc.atWalkAway.totalProject === 237400);
ok("D: target judgment uses the deal's own target", sc && sc.atWalkAway.targetMet === true && sc.target === 28000);
// Stress at the walk-away (ARV −5%, rehab +10%, +1 month):
// 285,000 − 14,250 − 214,000 − 3,400 − 10,500 = 42,850 → strong (≥ 0.5×target)
ok("D: stressed profit runs the canonical stress law", sc && sc.atWalkAway.stressedProfit === 42850);
ok("D: margin of safety comes from the stress verdict", sc && sc.atWalkAway.marginOfSafety === 'strong');
// The engine agrees with itself — the scenario IS computeFlip at those prices:
const direct = computeFlip({ ask: 170000, arv: 300000, rep: 40000, hold: 6,
  cc1: 0.02, cc2: 0.05, carry: 1500, loan: 0, rate: 0.10, points: 0.03, self: false });
ok("D: no second engine — scenario equals computeFlip at the walk-away",
   sc && sc.atWalkAway.profit === direct.profit && sc.atWalkAway.cashIn === direct.cashIn);
ok("D: the suggested counter is priced below the walk-away with a real cushion",
   sc && sc.counter === 160000 && sc.counter < sc.walkAway && sc.atCounter.profit === computeFlip({ ask: 160000, arv: 300000, rep: 40000, hold: 6, cc1: 0.02, cc2: 0.05, carry: 1500, loan: 0, rate: 0.10, points: 0.03, self: false }).profit);
// NON-MUTATION: the input (a frozen stand-in for the saved deal) is byte-identical after.
ok("D: the what-if mutates NOTHING on the deal", JSON.stringify(DEAL_DATA) === BEFORE);
// Repairs beyond the ARV ceiling → honest no-workable-price flag, no fake price:
const dead = computeNegotiationScenario({ ...DEAL_DATA, arv: 100000, rep: 80000 });
ok("D: an impossible deal flags noWorkablePrice, never a fake price",
   dead && dead.noWorkablePrice === true && dead.counter === null && dead.atWalkAway === null);
// Financed deal: scenario keeps the deal's own financing terms.
const fin = computeNegotiationScenario({ ...DEAL_DATA, loan: 150000 });
const finDirect = computeFlip({ ask: fin.walkAway, arv: 300000, rep: 40000, hold: 6,
  cc1: 0.02, cc2: 0.05, carry: 1500, loan: 150000, rate: 0.10, points: 0.03, self: false });
ok("D: financed scenario carries the loan through the engine",
   fin && fin.atWalkAway.profit === finDirect.profit && fin.atWalkAway.cashIn === finDirect.cashIn);
// Self-perform raises the canonical rule ceiling to 75%:
const selfSc = computeNegotiationScenario({ ...DEAL_DATA, self: true });
ok("D: self-perform uses the engine's 75% ceiling", selfSc && selfSc.ruleCeiling === 185000);

// ── §D-wiring · both entry points are read-only renderers ────────────────────
const mainJs = src("docs/src/js/main.js");
const pipeJs = src("docs/src/js/pipeline.js");
const flipJs = src("docs/src/js/flip.js");
const html   = src("docs/index.html");
const renderer = mainJs.slice(mainJs.indexOf('function showMaxOfferScenario'),
                              mainJs.indexOf('document.querySelectorAll(\'.modal-backdrop\')'));
ok("D: renderer exists in main.js", renderer.length > 100);
ok("D: renderer never saves, duplicates, or edits a deal",
   !/saveDeal|save_pipeline|requestDelete|dealEdit|localStorage|supabase\./.test(renderer));
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
                               mainJs.indexOf('const willLockUntil'));   // Wave A · A7 re-anchor: `const cooldownDays` left with the old copy
ok("E: Pro replacement warns with the ruled copy — replace phrasing",
   /Replace \$\{label\}\? Choosing another region will replace this market slot\./.test(proBranch));
ok("E: Pro replacement copy reassures about underwritten deals",
   /Deals already underwritten in \$\{label\} will keep their saved region\./.test(proBranch));
ok("E: Pro path routes through the SAME confirm modal (no new modal, no stacking)",
   /openModal\('modal-market-confirm'\)/.test(proBranch) && /_pendingSlotChange = slotIndex/.test(proBranch));
ok("E: Pro confirm button reads 'Choose another region'",
   /textContent = 'Choose another region'/.test(proBranch));
// Wave A · A7 re-pin (same-commit law): the lower-tier copy now states the
// entitlement law (30-day / 14-day wait, slot counts, upgrade re-check) instead
// of the "{cooldownDays} days" sentence; tests/marketcopy.test.mjs pins the
// exact wording against tiers.js. The 'Continue' label restore is unchanged.
ok("E: lower tiers keep their cooldown copy AND restore the 'Continue' label",
   /starts a 30-day wait before this slot can change again/.test(mainJs) &&
   /starts a 14-day wait before this slot can change again/.test(mainJs) &&
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

// ── §Badge · LIVE DEFECT: interactive verdict badge (pipeline max-offer) ─────
// Proven live failure: the verdict badge was an inert div inside
// `.deal-header onclick="toggleDeal(...)"`, so tapping "COUNTER AT MAX OFFER"
// only expanded/collapsed the card. Event model now under pin: a flip verdict
// with a governed scenario is a REAL <button> whose inline handler stops
// propagation BEFORE opening the scenario — activation (mouse, touch, and
// native keyboard Enter/Space) can never reach the card toggle.
const badgeBtn = (pipeJs.match(/<button type="button" class="deal-badge[\s\S]*?<\/button>`/) || [''])[0];
ok("BADGE-A: scenario verdict renders as a semantic <button type=\"button\">",
   badgeBtn.length > 0 && /type="button"/.test(badgeBtn) && /aria-haspopup="dialog"/.test(badgeBtn));
ok("BADGE-A2: the button is gated to flip deals WITH a governed scenario",
   /d\.type === 'flip' && !insP && data\.maxOffer > 0/.test(pipeJs));
// Stale-badge corrective re-pin: badge class/text now come from the render-time
// canonical derivation (liveFlipVerdict), stored values as fallback.
ok("BADGE-A3: every other badge stays an inert div (no scenario, no control)",
   /<div class="deal-badge \$\{badgeCls\}">\$\{badgeText\}<\/div>/.test(pipeJs));
ok("BADGE-CURRENT: badge text derives at render time from the canonical chain",
   /export function liveFlipVerdict/.test(pipeJs) &&
   /const nego = flipNegotiationGuidance\(eng\);/.test(pipeJs.slice(pipeJs.indexOf('function liveFlipVerdict'))) &&
   /badgeText\s*=\s*live \? live\.verdict/.test(pipeJs));
ok("BADGE-CURRENT: card badge and negotiation modal share ONE guidance law",
   /flipNegotiationGuidance\(eng\)/.test(src("docs/src/js/finance.js").slice(
     src("docs/src/js/finance.js").indexOf('function computeNegotiationScenario'))) &&
   /flipNegotiationGuidance\(eng\)/.test(pipeJs.slice(pipeJs.indexOf('function liveFlipVerdict'))));
ok("BADGE-CURRENT: ONE badge slot per card — collapsed and expanded share it",
   (pipeJs.slice(pipeJs.indexOf('function buildDealCard')).match(/class="deal-badge/g) || []).length === 2);
ok("BADGE-CURRENT: render derivation never writes back to the record",
   !/saveDeals|save_pipeline|d\.verdict\s*=|data\.verdict\s*=/.test(
     pipeJs.slice(pipeJs.indexOf('function liveFlipVerdict'), pipeJs.indexOf('function buildDealCard'))));
ok("BADGE-B: activation stops propagation FIRST, then opens the scenario — never the card toggle",
   /onclick="event\.stopPropagation\(\);showMaxOfferScenario\(\$\{d\.id\}\)"/.test(badgeBtn));
ok("BADGE-D: keyboard law — native button semantics (Enter/Space fire the same isolated click)",
   /type="button"/.test(badgeBtn));
ok("BADGE-E: ordinary header space still expands/collapses via the card handler",
   /<div class="deal-header" onclick="toggleDeal\(\$\{d\.id\}\)">/.test(pipeJs));
ok("BADGE-F: the chevron affordance remains inside the toggling header",
   /class="expand-arrow"/.test(pipeJs.slice(pipeJs.indexOf('deal-header'), pipeJs.indexOf('deal-detail'))));
ok("BADGE-G: Delete/Edit/Share remain their own isolated controls",
   /event\.stopPropagation\(\);requestDelete\(/.test(pipeJs) &&
   /event\.stopPropagation\(\);startDealEdit\(/.test(pipeJs) &&
   /event\.stopPropagation\(\);shareDeal\(/.test(pipeJs));
ok("BADGE-H: badge routes into the ONE renderer already proven non-persisting — no duplicate handlers",
   (mainJs.match(/function showMaxOfferScenario/g) || []).length === 1 &&
   !/function showMaxOfferScenario/.test(pipeJs) &&
   !/function showMaxOfferScenario/.test(flipJs));
// (H's persistence teeth are the §D-wiring pins above: the renderer writes only
// into #maxoffer-body and calls no save/RPC path; I is the frozen-input proof.)
const cssBadge = src("docs/src/css/styles.css");
ok("BADGE-desktop: hover + cursor make the control unmistakable",
   /\.badge-action\{cursor:pointer/.test(cssBadge) && /\.badge-action:hover\{filter:brightness/.test(cssBadge));
ok("BADGE-desktop: focus-visible ring exists for keyboard users",
   /\.badge-action:focus-visible\{outline:2px solid var\(--accent\)/.test(cssBadge));
ok("BADGE-font: button variant keeps the app font (buttons don't inherit)",
   /button\.deal-badge\{font-family:var\(--font\)\}/.test(cssBadge));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`dealsignal: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
