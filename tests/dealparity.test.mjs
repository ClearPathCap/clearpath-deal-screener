// ─── Live deal parity suite — LTR guidance + cross-analyzer parity ───────────
// Proves the parity corrective (owner dispatch 2026-09-04, live LTR test at
// 73 Orange Street, Bridgeport CT):
//   ltrGates            §A — the EXISTING ltrVerdict bars, exported, identical
//   ltrGuidance         §B — non-mutating guidance payload (bars + levers)
//   solveLtr*ForHot     §C — single-lever solvers whose predicate IS ltrVerdict
//   renderer routing    §D — ONE showMaxOfferScenario, branched by deal type
//   pipeline badge      §E — LTR badge is a real button; STR/BRRR stay inert
//   funding CTA         §F — label wraps on every surface (no nowrap/ellipsis)
//   compliance          §G — guidance copy never claims approval or terms
// CANONICAL LAW: no test here accepts a second underwriting formula — every
// lever is proven against computeLtr + ltrVerdict themselves (hot at the lever,
// not hot one notch past it). No threshold is restated as a literal except the
// ones ltrVerdict already publishes through ltrGates.
// Run: node tests/dealparity.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");
const F = await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/finance.js")));

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// Saved-deal shape (ltr.js lastLtrResult carries `rent`, the engine wants
// `rentMo` — ltrEngineInput is the one mapping). Orange Street, as analyzed live.
const ORANGE = { type: 'ltr', addr: '73 Orange Street, Bridgeport, CT 06607',
  price: 609000, units: 3, band: '1-4', down: 20, rent: 6000, vac: 5,
  tax: 6000, ins: 3344, hoa: 0, maint: 5, pm: 8, capex: 5,
  rate: 7.25, amort: 30, points: 1, cc: 2, target: 8 };
const engine = (d) => F.computeLtr(F.ltrEngineInput(d));
const verdictOf = (d) => F.ltrVerdict(engine(d));
const hotAt = (d) => verdictOf(d).cls === 'hot';

// ── §A · ltrGates is ltrVerdict's own law, exported — identity over a grid ───
ok("A0: ltrGates + ltrGuidance + solvers are exported from finance.js",
   ['ltrGates', 'ltrGuidance', 'ltrEngineInput', 'solveLtrPriceForHot', 'solveLtrRentForHot', 'solveLtrDownForHot']
     .every(k => typeof F[k] === 'function'));
let gridN = 0, gridMismatch = 0;
for (const band of ['1-4', '5-8']) for (const price of [250000, 400000, 609000, 800000])
for (const rent of [2500, 4500, 6000, 9000]) for (const down of [10, 20, 35]) {
  const d = { ...ORANGE, band, units: band === '5-8' ? 6 : 3, price, rent, down };
  const m = engine(d), v = F.ltrVerdict(m), g = F.ltrGates(m);
  const hotByGates = g.dscrOk && (g.dollarOk || g.cocOk) && g.cfPositive && g.survives;
  gridN++;
  if ((v.cls === 'hot') !== hotByGates) gridMismatch++;
  if (g.band !== band) gridMismatch++;
  if (band === '5-8' && g.floorOk === null) gridMismatch++;
  if (band === '1-4' && g.floorOk !== null) gridMismatch++;
}
ok(`A1: verdict 'hot' ⇔ gates pass across ${gridN} grid points (0 mismatches)`, gridN === 96 && gridMismatch === 0);
const gO = F.ltrGates(engine(ORANGE));
ok("A2: the gates publish ltrVerdict's OWN bars (1-4: hot DSCR 1.25, $6,000/yr, target 8%)",
   gO.hotDscr === 1.25 && gO.dollarBar === 6000 && gO.target === 8 && gO.smallMfFloor === null);
const g58 = F.ltrGates(engine({ ...ORANGE, band: '5-8', units: 6 }));
ok("A3: 5-8 band publishes the small-multifamily floor (1.20) alongside the lender bar",
   g58.hotDscr === 1.25 && g58.smallMfFloor === 1.20 && typeof g58.floorOk === 'boolean');
ok("A4: verdict text/vsub for Orange Street is the pre-existing warm copy (no rewording)",
   verdictOf(ORANGE).cls === 'warm' && verdictOf(ORANGE).verdict === 'Dig Deeper & Negotiate');

// ── §B · ltrGuidance — the live case explained by its own bars ───────────────
const G = F.ltrGuidance(ORANGE);
ok("B1: guidance carries the verdict verbatim (warm · Dig Deeper & Negotiate)",
   G && G.cls === 'warm' && G.verdict === 'Dig Deeper & Negotiate' && G.isHot === false);
ok("B2: Orange Street clears DSCR, the dollar bar and positive cash flow — ONLY the stress test fails",
   G.gates.dscrOk && G.gates.dollarOk && !G.gates.cocOk && G.gates.cfPositive && !G.gates.survives
   && G.failing.length === 1 && G.failing[0] === 'survives');
ok("B3: current numbers are the engine's (dscr 1.25, cf ≈ $6.5k/yr, stressed DSCR < 1)",
   Math.abs(G.current.dscr - 1.253) < 0.002 && Math.round(G.current.cashFlowYr) === 6501
   && G.current.stressedDscr < 1.10 && G.current.stressedCfMo < 0);
ok("B4: every lever is present and finite for the live case",
   Number.isFinite(G.levers.price) && Number.isFinite(G.levers.rent) && Number.isFinite(G.levers.down));
ok("B5: hotLabel is the ENGINE's lender-ready verdict text at the lever (not a restated string)",
   G.hotLabel === verdictOf({ ...ORANGE, price: G.levers.price }).verdict && /Lender-Ready/.test(G.hotLabel));
ok("B6: guidance never mutates its input", (() => {
  const before = JSON.stringify(ORANGE); F.ltrGuidance(ORANGE); return JSON.stringify(ORANGE) === before; })());
ok("B7: guidance refuses non-LTR / empty input honestly (null, no throw)",
   F.ltrGuidance(null) === null && F.ltrGuidance({ type: 'flip', ask: 1 }) === null);

// ── §C · solvers — proven against ltrVerdict itself at the boundary ──────────
ok("C1: price lever — hot at the lever, not hot $1 above", hotAt({ ...ORANGE, price: G.levers.price }) && !hotAt({ ...ORANGE, price: G.levers.price + 1 }));
ok("C2: price lever is the MAX price (below current ask)", G.levers.price < ORANGE.price);
ok("C3: rent lever — hot at the lever, not hot $1 below", hotAt({ ...ORANGE, rent: G.levers.rent }) && !hotAt({ ...ORANGE, rent: G.levers.rent - 1 }));
ok("C4: rent lever is the MIN rent (above current rent)", G.levers.rent > ORANGE.rent);
ok("C5: down lever — hot at the lever, not hot 1 point below", hotAt({ ...ORANGE, down: G.levers.down }) && !hotAt({ ...ORANGE, down: G.levers.down - 1 }));
ok("C6: down lever is a whole percentage above current", Number.isInteger(G.levers.down) && G.levers.down > ORANGE.down);
const HOT = { ...ORANGE, rent: 7200 };
const GH = F.ltrGuidance(HOT);
ok("C7: an already-hot deal reports isHot with no failing bars and levers = current",
   hotAt(HOT) && GH.isHot && GH.failing.length === 0
   && GH.levers.price === HOT.price && GH.levers.rent === HOT.rent && GH.levers.down === HOT.down);
const DEAD = { ...ORANGE, rent: 800 };
const GD = F.ltrGuidance(DEAD);
ok("C8: a hopeless deal gets honest nulls (no fabricated lever) or an engine-true lever",
   (GD.levers.price === null || hotAt({ ...DEAD, price: GD.levers.price }))
   && (GD.levers.rent === null || hotAt({ ...DEAD, rent: GD.levers.rent }))
   && (GD.levers.down === null || hotAt({ ...DEAD, down: GD.levers.down })));
ok("C9: rent lever on a dead deal is engine-true when it exists",
   GD.levers.rent === null || (hotAt({ ...DEAD, rent: GD.levers.rent }) && !hotAt({ ...DEAD, rent: GD.levers.rent - 1 })));
// 5-8 band: solvers honour the band's own vacancy/floor law through the verdict.
const MF = { ...ORANGE, band: '5-8', units: 6, rent: 9000, price: 800000 };
const GM = F.ltrGuidance(MF);
ok("C10: 5-8 band levers are proven against the 5-8 verdict (floor + one-vacant-unit stress)",
   GM.gates.band === '5-8' && (GM.isHot || (
     (GM.levers.price === null || (hotAt({ ...MF, price: GM.levers.price }) && !hotAt({ ...MF, price: GM.levers.price + 1 })))
     && (GM.levers.rent === null || (hotAt({ ...MF, rent: GM.levers.rent }) && !hotAt({ ...MF, rent: GM.levers.rent - 1 }))))));

// ── §D · renderer routing — ONE renderer, branched by type ───────────────────
const mainJs = src("docs/src/js/main.js");
const renderer = mainJs.slice(mainJs.indexOf('function showMaxOfferScenario'), mainJs.indexOf("document.querySelectorAll('.modal-backdrop')"));
ok("D1: exactly ONE showMaxOfferScenario (single renderer law holds)", (mainJs.match(/function showMaxOfferScenario/g) || []).length === 1);
ok("D2: analyzer entry points — 'analyzer' (flip) and 'analyzer:ltr' (LTR)",
   /ref === 'analyzer'[\s\S]*?getLastFlipResult\(\)/.test(renderer) && /ref === 'analyzer:ltr'[\s\S]*?getLastLtrResult\(\)/.test(renderer));
ok("D3: saved-deal entry accepts flip OR ltr and routes by the DEAL's type",
   /x\.type === 'flip' \|\| x\.type === 'ltr'/.test(renderer) && /type === 'ltr' \? renderLtrGuidanceHTML\(data\) : renderFlipPlanHTML\(data\)/.test(renderer));
ok("D4: LTR content comes from ltrGuidance (canonical), flip from computeNegotiationScenario (unchanged)",
   /const g = ltrGuidance\(data\)/.test(renderer) && /const sc = computeNegotiationScenario\(data\)/.test(renderer));
ok("D5: main.js imports ltrGuidance and getLastLtrResult", /ltrGuidance \}/.test(mainJs.slice(0, 2500)) && /getLastLtrResult \}\s+from '\.\/ltr\.js'/.test(mainJs));
ok("D6: the renderer still writes ONLY the read-only modal body (single innerHTML, no persistence)",
   (renderer.match(/innerHTML/g) || []).length === 1 && /getElementById\('maxoffer-body'\)/.test(renderer)
   && !/saveDeal|save_pipeline|requestDelete|dealEdit|localStorage|supabase\./.test(renderer));
ok("D7: modal title + note are set PER TYPE on every open (shared modal never shows stale flip copy on LTR)",
   /h3\.textContent\s+=\s+type === 'ltr' \? 'What to Dig Into' : 'Your Negotiation Plan'/.test(renderer)
   && /note\.textContent = type === 'ltr'/.test(renderer));
ok("D8: LTR guidance renders the bars with PASS/FAIL from ltrGates (no local thresholds)",
   /gates\.coversDebt/.test(renderer) && /gates\.dscrOk/.test(renderer) && /gates\.dollarOk \|\| gates\.cocOk/.test(renderer)
   && /gates\.cfPositive/.test(renderer) && /gates\.survives/.test(renderer) && /gates\.floorOk !== null/.test(renderer)
   && /gates\.hotDscr\.toFixed\(2\)/.test(renderer) && /fmt\(gates\.dollarBar\)/.test(renderer) && /gates\.target/.test(renderer)
   && !/1\.25|6000|1\.20/.test(renderer.slice(renderer.indexOf('function renderLtrGuidanceHTML'))));
ok("D9: LTR levers render price / rent / down with honest 'not reachable' fallbacks",
   /g\.levers\.price != null \? '≤ ' \+ fmt\(g\.levers\.price\) : 'No price clears every bar'/.test(renderer)
   && /g\.levers\.rent != null \? '≥ ' \+ fmt\(g\.levers\.rent\) \+ '\/mo' : 'Not reachable'/.test(renderer)
   && /g\.levers\.down != null \? '≥ ' \+ g\.levers\.down \+ '%' : 'Not reachable at ≤ 100%'/.test(renderer));
ok("D10: 5-8 stress law is described as one-vacant-unit (matches computeLtr), 1-4 as +3pts",
   /one-vacant-unit vacancy/.test(renderer) && /vacancy \+3pts/.test(renderer));

// ── §E · analyzer + pipeline surfaces ─────────────────────────────────────────
const ltrJs = src("docs/src/js/ltr.js");
const html  = src("docs/index.html");
const plJs  = src("docs/src/js/pipeline.js");
ok("E1: index.html LTR verdict block carries the guidance affordance routed to 'analyzer:ltr'",
   /id="lv-whatif"[\s\S]{0,120}onclick="showMaxOfferScenario\('analyzer:ltr'\)"/.test(html));
ok("E2: ltr.js shows the affordance after a valid analysis and hides it while income is pending",
   /elv\('lv-whatif'\)/.test(ltrJs) && /whatif\.style\.display = insP \? 'none' : ''/.test(ltrJs));
ok("E3: flip's own affordance is untouched (fv-whatif → 'analyzer')",
   /id="fv-whatif"/.test(html) && /showMaxOfferScenario\('analyzer'\)/.test(html));
ok("E4: pipeline badge gate — flip literal PRESERVED, LTR added, STR/BRRR excluded",
   /\(d\.type === 'flip' && !insP && data\.maxOffer > 0\) \|\| \(d\.type === 'ltr' && !insP && data\.price > 0\)/.test(plJs)
   && !/d\.type === 'rental' && !insP/.test(plJs) && !/d\.type === 'brrr' && !insP/.test(plJs));
ok("E5: badge button title is per type", /title="\$\{d\.type === 'ltr' \? 'See what to dig into' : /.test(plJs));
ok("E6: exactly 2 badge slots per card (button + inert div) — no duplicate badge",
   (plJs.slice(plJs.indexOf('function buildDealCard')).match(/class="deal-badge/g) || []).length === 2);
ok("E7: LTR detail carries the isolated guidance action (stopPropagation first), never while pending",
   /function buildLtrDetail\(d, deal\)/.test(plJs)
   && /deal && !pend && d\.price > 0/.test(plJs)
   && /class="whatif-link" onclick="event\.stopPropagation\(\);showMaxOfferScenario\(\$\{deal\.id\}\)">See what to dig into →<\/button>/.test(plJs)
   && /buildLtrDetail\(data, d\)/.test(plJs));
ok("E8: flip detail's own whatif-link is unchanged (parity, not replacement)",
   /function buildFlipDetail\(d, deal\)/.test(plJs) && (plJs.match(/class="whatif-link"/g) || []).length === 2);
ok("E9: Share/Delete/Funding stay isolated controls (stopPropagation on each)",
   /event\.stopPropagation\(\);requestDelete/.test(plJs) && /event\.stopPropagation\(\);shareDeal/.test(plJs));
// One builder's body: from its `function name(` to the first line that is just `}`.
const fnBody = (name) => { const a = plJs.indexOf('function ' + name + '('); const b = plJs.indexOf('\n}\n', a); return plJs.slice(a, b + 3); };
ok("E10: STR/BRRR detail builders still have no guidance action (genuinely unsupported — no inert button)",
   !/whatif-link/.test(fnBody('buildRentalDetail')) && !/whatif-link/.test(fnBody('buildBrrrDetail'))
   && /whatif-link/.test(fnBody('buildFlipDetail')) && /whatif-link/.test(fnBody('buildLtrDetail')));
// Parity sweep finding (introduced by 305e642): buildRentalDetail(d) evaluated
// `deal && d.maxOffer > 0` with `deal` undeclared — a ReferenceError for every
// saved STR card, and renderPipeline has no try/catch, so ONE saved STR deal
// blanked the whole pipeline. Executed proof lives in wave-a1 §G (G11/G12).
ok("E11: buildRentalDetail references no undeclared `deal` (live STR render defect closed)",
   /function buildRentalDetail\(d\)/.test(plJs) && !/\bdeal\b/.test(fnBody('buildRentalDetail').replace(/\/\/[^\n]*/g, '')));
ok("E12: buildBrrrDetail likewise references only its own argument",
   /function buildBrrrDetail\(d\)/.test(plJs) && !/\bdeal\b/.test(fnBody('buildBrrrDetail').replace(/\/\/[^\n]*/g, '')));

// ── §F · CPC funding CTA — wraps on every surface ────────────────────────────
const cpJs = src("docs/src/js/clearpath.js");
const css  = src("docs/src/css/styles.css");
ok("F1: analyzer, below-minimum and pipeline CTAs all wrap the label in .funding-btn-label",
   (cpJs.match(/<span class="funding-btn-label">\$\{btnLabel\}<\/span>/g) || []).length === 3);
ok("F2: no inline nowrap/ellipsis span remains in clearpath.js", !/white-space:nowrap/.test(cpJs) && !/text-overflow:ellipsis/.test(cpJs));
const btnRule = (css.match(/^\.btn-get-funding\{[^}]*\}/m) || [''])[0];
ok("F3: .btn-get-funding no longer forces nowrap; it centers and pads for a two-line label",
   btnRule.length > 0 && !/white-space:nowrap/.test(btnRule) && /text-align:center/.test(btnRule) && /line-height:1\.25/.test(btnRule) && /padding:10px 14px/.test(btnRule));
ok("F4: the shared label rule wraps (normal + anywhere), balanced, min-width:0",
   /^\.funding-btn-label\{white-space:normal;overflow-wrap:anywhere;text-wrap:balance;min-width:0;text-align:center;line-height:1\.25\}/m.test(css));
ok("F5: the old pipeline-only nowrap/ellipsis label rule is gone", !/\.pipeline-funding-btn \.funding-btn-label\{white-space:nowrap/.test(css));
ok("F6: the icon keeps its size beside a wrapped label (flex-shrink:0)", /^\.funding-icon\{[^}]*flex-shrink:0/m.test(css));
ok("F7: label wording law untouched — getFundingLabel still substitutes the type phrase", /replace\('Get Funding', /.test(cpJs));

// ── §G · compliance — guidance copy is estimate-only, never an approval ──────
const ltrCopy = renderer.slice(renderer.indexOf('function renderLtrGuidanceHTML'));
ok("G1: LTR guidance qualifier: estimates only, not lender requirements, an approval, or an offer",
   /estimates only, not lender requirements, an approval, or an offer/.test(ltrCopy));
ok("G2: no approval / guarantee / qualify language in LTR guidance copy",
   !/approved|guarantee|pre-?qualif|you qualify|will fund/i.test(ltrCopy.replace(/an approval/g, '')));
ok("G3: guidance never names Deal Screener / DS to a lender surface (brand law)", !/Deal Screener|\bDS\b/.test(ltrCopy));
ok("G4: flip plan qualifier unchanged", /DealFit estimate only\. Not a guarantee, an offer, or a lender requirement/.test(renderer));

console.log(`dealparity: ${pass} passed, ${fail} failed`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fail ? 1 : 0);
