// UX wave finding 1 — editable Pipeline through the ONE canonical flip engine.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/dealedit.test.mjs
//
// THE LAW: pipeline editing and the Fix & Flip analyzer share one engine —
// computeFlip / computeFlipStress / flipVerdict in finance.js. This suite
// proves (a) the engine reproduces the analyzer's inline math EXACTLY, on the
// real deal that motivated the wave; (b) the editor recomputes through it,
// preserves identity/ownership/other deals, and stamps update metadata;
// (c) Cancel writes nothing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── minimal DOM: flat elements + one pipeline card with data-pe fields ───────
const elements = new Map();
const mkEl = (id) => ({
  id, textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, checked: false,
  classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
               contains(c){return this._s.has(c);}, toggle(){} },
  addEventListener(){}, removeEventListener(){}, setAttribute(){}, removeAttribute(){},
  focus(){}, click(){}, select(){}, querySelectorAll: () => [], querySelector: () => null,
});
const el = (id) => { if (!elements.has(id)) elements.set(id, mkEl(id)); return elements.get(id); };

// The edit form reads fields via card.querySelector('[data-pe="x"]').
const peFields = new Map();
const pe = (k) => { if (!peFields.has(k)) peFields.set(k, mkEl('pe-' + k)); return peFields.get(k); };
const card = mkEl('card');
card.querySelector = (sel) => {
  const m = /\[data-pe="([a-z0-9]+)"\]/.exec(sel);
  if (m) return pe(m[1]);
  if (sel === '.deal-detail') return el('detail-host');
  return null;
};

globalThis.location = { search: '', href: 'https://dealfit.example/', pathname: '/' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  getElementById: el,
  querySelector: (sel) => (/\.deal-card\[data-id=/.test(sel) ? card : null),
  querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){},
  body: mkEl('body'), documentElement: mkEl('html'), createElement: (t) => mkEl('_' + t),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, addListener(){} });
globalThis.history = { replaceState(){} };
globalThis.alert = () => {};
const toasts = [];
globalThis.showToast = (m) => toasts.push(m);
console.error = () => {}; console.warn = () => {};

const session = { user: { id: 'u-edit', email: 'qa@example.com' } };
globalThis.__stubSupabase = { session, rpc: {} };

const finance  = await import("../docs/src/js/finance.js");
const auth     = await import("../docs/src/js/auth.js");
const storage  = await import("../docs/src/js/storage.js");
const pipeline = await import("../docs/src/js/pipeline.js");

// ── §A · canonical engine goldens — the REAL 417 Saddlebrooke Rd deal ────────
// Aaron's live underwriting (self-renovating checked — that's what makes
// maxOffer $175,750 rather than $157,500): ask 289k, ARV 365k, rep 98k, hold 5,
// buying 2%, selling 5%, carry $2,150/mo. The verdict the app showed and the
// GC independently confirmed: walk away.
const SB = { ask: 289000, arv: 365000, rep: 98000, hold: 5, cc1: 0.02, cc2: 0.05, carry: 2150, loan: 0, self: true };
const g = finance.computeFlip(SB);
ok("[GOLDEN] Saddlebrooke net profit is exactly -$56,780", g.profit === -56780);
ok("[GOLDEN] Saddlebrooke max offer is exactly $175,750 (75% self rule)", g.maxOffer === 175750);
ok("[GOLDEN] cash required before resale is $403,530 (excludes selling costs)", g.cashIn === 403530);
ok("[GOLDEN] total project cost incl. selling costs is $421,780", g.totalIn + g.sellCost === 421780);
ok("[GOLDEN] all-cash view labels Price/ARV, not LTV", g.ltvLabel === 'Price / ARV' && !g.financed);
const sv = finance.flipVerdict({ profit: g.profit, roi: g.roi, target: 40000, maxOffer: g.maxOffer,
  ...finance.computeFlipStress({ ...SB, financed: false, rate: 0.10, points: 0.03, target: 40000 }), self: true });
ok("[GOLDEN] verdict is the walk-away the app showed live", sv.cls === 'pass' && /Counter at Max Offer/.test(sv.verdict));

// Engine identity: the stress test IS the engine on haircut inputs — one formula set.
const stress = finance.computeFlipStress({ ...SB, financed: false, rate: 0.10, points: 0.03, target: 40000 });
const manual = finance.computeFlip({ ...SB, arv: SB.arv * 0.95, rep: SB.rep * 1.1, hold: SB.hold + 1 });
ok("[DEFECT-CLOSING] computeFlipStress === computeFlip(haircut inputs) — no second formula set",
   stress.stressedProfit === manual.profit);
// Financed branch parity with the analyzer's documented math.
const fin = finance.computeFlip({ ...SB, loan: 200000, rate: 0.10, points: 0.03 });
ok("[GOLDEN] financed: interest-only carry over hold", fin.loanInt === 200000 * (0.10 / 12) * 5);
ok("[GOLDEN] financed: points on the loan", fin.loanFees === 200000 * 0.03);
ok("[GOLDEN] financed: cashIn nets out the loan", fin.cashIn === (387000 - 200000) + 5780 + 10750 + fin.finCost);
ok("[GOLDEN] financed: ltv switches to loan/arv", fin.ltvLabel === 'LTV' && Math.abs(fin.ltvVal - (200000/365000)*100) < 1e-9);

// The analyzer now DELEGATES — its inline copy of the formulas is gone.
const flipSrc = src("docs/src/js/flip.js");
ok("[DEFECT-CLOSING] analyzeFlip calls the canonical engine", /computeFlip\(\{ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self \}\)/.test(flipSrc));
ok("[DEFECT-CLOSING] the inline profit formula is gone from flip.js", !/const profit\s+= arv - sellCost/.test(flipSrc));
ok("[DEFECT-CLOSING] the inline maxOffer formula is gone from flip.js", !/const maxOffer = arv \* \(self/.test(flipSrc));
const finSrc = src("docs/src/js/finance.js");
ok("[DEFECT-CLOSING] the stress test delegates to computeFlip", /const stressedProfit = computeFlip\(\{/.test(finSrc));

// ── §B · edit flow through the real pipeline.js ──────────────────────────────
const DEAL = {
  id: 4001, name: '417 Saddlebrooke Rd — Lake Murray', type: 'flip',
  verdict: 'Counter at Max Offer — Walk Away', cls: 'pass', notes: 'GC visiting Friday',
  date: 'Aug 26, 2026', savedAt: '2026-08-26T12:00:00.000Z',
  market: 'lake-murray-sc', marketLabel: 'Lake Murray SC',
  data: { type: 'flip', addr: '417 Saddlebrooke Rd, Lexington SC', ask: 289000, arv: 365000, rep: 98000,
          hold: 5, cc1: 2, cc2: 5, carry: 2150, target: 40000, sqft: 2100, self: true,
          loan: 0, rate: 0.10, points: 0.03, financed: false,
          profit: -56780, roi: -14.07, maxOffer: 175750 },
  stats: [{ l: 'Profit', v: '-$56,780' }],
};
const OTHER = { id: 4002, name: 'CANARY-LIKE OTHER DEAL', type: 'ltr', verdict: 'X', cls: 'warm',
  notes: '', date: 'Aug 15, 2026', data: { price: 1 }, stats: [] };

let savedPayloads = [];
globalThis.__stubSupabase = { session, rpc: {
  get_pipeline: { data: [DEAL, OTHER], error: null },
  save_pipeline: (args) => { savedPayloads.push(args.p_deals); return { data: { ok: true }, error: null }; },
} };
await auth.initAuthAndEntitlement();
await storage.hydratePipeline();
ok("[HARNESS] cache hydrated with both deals", storage.getDeals().length === 2);

// Seed the edit form: the GC's real bid replaces the planning estimate, seller drops.
// RE-PINNED (provenance/market corrective, same-commit law): the real form now
// carries a market <select data-pe="market"> pre-selected to the deal's stamp,
// and a rep-ownership dataset. The harness seeds both exactly as the form does.
pe('market').value = 'lake-murray-sc';
pe('rep').dataset.repOwned = 'manual';
pe('name').value = '417 Saddlebrooke Rd — Lake Murray';
pe('ask').value = '235,000'; pe('arv').value = '365,000'; pe('rep').value = '82,000';
pe('hold').value = '6'; pe('cc1').value = '2'; pe('cc2').value = '5';
pe('carry').value = '2,150'; pe('target').value = '40,000'; pe('sqft').value = '2100';
pe('rate').value = '10'; pe('points').value = '3'; pe('loan').value = '';
pe('self').checked = false;   // GC does the work now — self no longer true
pe('notes').value = 'GC bid $82k; seller countered 235k';

const res = await pipeline.saveDealEdits(4001);
ok("[DEFECT-CLOSING] edit save resolves saved", res.status === 'saved');
ok("[DEFECT-CLOSING] exactly one durable write", savedPayloads.length === 1);
const cand = savedPayloads[0];
const edited = cand.find(d => d.id === 4001);
const other  = cand.find(d => d.id === 4002);
ok("[DEFECT-CLOSING] deal id is stable across the edit", !!edited);
ok("[DEFECT-CLOSING] every OTHER deal rides forward intact (whole-array law)",
   other && other.name === 'CANARY-LIKE OTHER DEAL' && cand.length === 2);
const expect = finance.computeFlip({ ask: 235000, arv: 365000, rep: 82000, hold: 6,
  cc1: 0.02, cc2: 0.05, carry: 2150, loan: 0, self: false });
ok("[DEFECT-CLOSING] profit recomputed through the canonical engine", edited.data.profit === expect.profit);
ok("[DEFECT-CLOSING] maxOffer recomputed (70% rule — self was unchecked)", edited.data.maxOffer === expect.maxOffer);
ok("[DEFECT-CLOSING] verdict/cls rebaked at the deal level",
   edited.verdict === edited.data.verdict && edited.cls === edited.data.cls);
ok("[DEFECT-CLOSING] stats rebaked to the new numbers", JSON.stringify(edited.stats).includes('Cash-on-Cash ROI'));
ok("[DEFECT-CLOSING] updatedAt + display Updated stamp added",
   typeof edited.updatedAt === 'string' && typeof edited.updated === 'string');
ok("[PRESERVATION] original save date survives", edited.date === 'Aug 26, 2026' && edited.savedAt === DEAL.savedAt);
// RE-PINNED: the editor now persists the market from the explicit selector and
// normalizes the label through getMarketLabel ('Lake Murray, SC' — with comma).
ok("[PRESERVATION] underwritten market association survives the edit",
   edited.market === 'lake-murray-sc' && edited.marketLabel === 'Lake Murray, SC');
ok("[PRESERVATION] address survives (not an editable field this wave)",
   edited.data.addr === '417 Saddlebrooke Rd, Lexington SC');
ok("[DEFECT-CLOSING] notes edit persisted", edited.notes === 'GC bid $82k; seller countered 235k');
ok("[PRESERVATION] schema units preserved: cc whole numbers, rate/points fractions",
   edited.data.cc1 === 2 && edited.data.cc2 === 5 && edited.data.rate === 0.10 && edited.data.points === 0.03);

// Cancel writes NOTHING.
savedPayloads = [];
pipeline.cancelDealEdit(4001);
ok("[DEFECT-CLOSING] cancel performs zero writes", savedPayloads.length === 0);
ok("[DEFECT-CLOSING] cancel leaves the cache at the last saved state",
   storage.getDeals().find(d => d.id === 4001).data.ask === 235000);

// Refusals.
pe('name').value = '   ';
ok("[DEFECT-CLOSING] blank name refused", (await pipeline.saveDealEdits(4001)).status === 'refused-name');
pe('name').value = 'x'; pe('cc1').value = '250';
ok("[DEFECT-CLOSING] out-of-range input refused via shared validateInputs",
   (await pipeline.saveDealEdits(4001)).status === 'invalid');
pe('cc1').value = '2';
ok("[DEFECT-CLOSING] unknown deal id refused", (await pipeline.saveDealEdits(999)).status === 'not-found');
ok("[PRESERVATION] refusals wrote nothing", savedPayloads.length === 0);

// ── §C · save stamps market + savedAt; auto-name mechanism pinned ────────────
const plSrc = src("docs/src/js/pipeline.js");
ok("[DEFECT-CLOSING] new saves stamp the underwritten market", /market:\s+marketId \|\| null/.test(plSrc)
   && /marketLabel: marketId \? getMarketLabel\(marketId\) : null/.test(plSrc));
ok("[DEFECT-CLOSING] new saves carry machine-readable savedAt", /savedAt: new Date\(\)\.toISOString\(\)/.test(plSrc));
ok("[DEFECT-CLOSING] the editor lives in pipeline.js beside the stat baking (no duplicate module)",
   /export async function saveDealEdits/.test(plSrc) && /buildDealStats\('flip', newData\)/.test(plSrc));
ok("[PRESERVATION] the Edit affordance is flip-only this wave", /d\.type === 'flip' \? `<button class="btn-action" onclick="event\.stopPropagation\(\);startDealEdit/.test(plSrc));
const mainSrc = src("docs/src/js/main.js");
ok("[DEFECT-CLOSING] deal name auto-defaults to street — region after analysis",
   /maybeDefaultDealName\('flip-deal-name', 'f-addr'\)/.test(mainSrc));
ok("[DEFECT-CLOSING] a user-customized name is never overwritten",
   /if \(current && current !== nameEl\.dataset\.autoName\) return;/.test(mainSrc));
ok("[DEFECT-CLOSING] street only — no city duplication in the auto name",
   /\.split\(','\)\[0\]\.trim\(\)/.test(mainSrc));

// ── §D · silent-wipe guard at the EDIT surface (hardening ruling 1) ──────────
// The scenario the guard exists for: a session whose hydration failed holds an
// empty/stale cache; an edit-save from it would wholesale-replace the server
// pipeline. Proof: failed hydrate → saveDealEdits refuses honestly with ZERO
// save RPC; a successful re-hydrate re-arms and the same edit then persists.
storage.clearPipelineCache();
globalThis.__stubSupabase = { session, rpc: {
  get_pipeline: { data: null, error: { message: 'network down' } },
  save_pipeline: (args) => { savedPayloads.push(args.p_deals); return { data: { ok: true }, error: null }; },
} };
await auth.initAuthAndEntitlement();
await storage.hydratePipeline();                       // fails
savedPayloads = [];
pe('name').value = 'x';
let staleRes = await pipeline.saveDealEdits(4001);
ok("[DEFECT-CLOSING · WIPE] edit-save after failed hydrate is refused",
   staleRes.status === 'not-found' || (staleRes.status === 'save-failed' && staleRes.failureClass === 'stale'));
ok("[DEFECT-CLOSING · WIPE] zero save RPC — server deals cannot be erased", savedPayloads.length === 0);
// Re-hydrate successfully and prove the path re-arms end to end.
globalThis.__stubSupabase = { session, rpc: {
  get_pipeline: { data: [DEAL, OTHER], error: null },
  save_pipeline: (args) => { savedPayloads.push(args.p_deals); return { data: { ok: true }, error: null }; },
} };
await auth.initAuthAndEntitlement();
await storage.hydratePipeline();
pe('name').value = 'Re-armed'; pe('cc1').value = '2';
pe('ask').value = '235,000'; pe('arv').value = '365,000'; pe('rep').value = '82,000';
staleRes = await pipeline.saveDealEdits(4001);
ok("[DEFECT-CLOSING · WIPE] successful re-hydrate re-arms the edit path",
   staleRes.status === 'saved' && savedPayloads.length === 1);
ok("[DEFECT-CLOSING · WIPE] the re-armed save still carries every other deal",
   savedPayloads[0].some(d => d.id === 4002));

// ── §E · repair provenance (real-operator corrective, defect 1) ──────────────
// PROVEN LIVE: toggling Self-Renovating in the editor left an estimator-owned
// $98,000 untouched while max-offer moved — internally inconsistent. Root
// cause: ownership lived ONLY in analyzer DOM state (dataset.autoFilled /
// userEdited) and was never serialized. The law now: estimator-owned swaps to
// the OTHER governed midpoint from the deal's frozen underwriting snapshot;
// user-owned dollars are never touched; legacy deals without provenance are
// never mutated.
const repair = await import("../docs/src/js/repair.js");

// E0 · the snapshot IS the governed estimator math. Aaron's real numbers are
// mathematically determined by the existing rules: lake-murray-sc has no flip
// entry → Southeast regional fallback {38,82}; self bands are round(lo*.62)=24
// / round(hi*.62)=51; at 2,622 sqft the midpoints are exactly 98,000 / 157,000.
repair.updateRepairRangesForMarket({ repairLow: 38, repairHigh: 82 });
const snap = repair.repairEstimateSnapshot(2622);
ok("[GOLDEN · E0] snapshot self midpoint is exactly Aaron's $98,000", snap.selfMid === 98000);
ok("[GOLDEN · E0] snapshot hired midpoint is the governed $157,000", snap.hiredMid === 157000);
ok("[GOLDEN · E0] snapshot records the scope tier", snap.tier === 'mid');
ok("[E0] no sqft → no snapshot (never a fabricated estimate)", repair.repairEstimateSnapshot(0) === null);

const EST_DEAL = {
  id: 6001, name: '417 Saddlebrooke Rd — Lake Murray', type: 'flip',
  verdict: 'Counter at Max Offer — Walk Away', cls: 'pass', notes: '',
  date: 'Aug 27, 2026', market: 'lake-murray-sc', marketLabel: 'Lake Murray, SC',
  data: { type: 'flip', addr: '417 Saddlebrooke Rd, Lexington SC', ask: 289000, arv: 365000,
          rep: 98000, hold: 5, cc1: 2, cc2: 5, carry: 2150, target: 28000, sqft: 2622, self: true,
          loan: 0, rate: 0.10, points: 0.03, financed: false,
          repSource: 'estimator', repEstimate: { tier: 'mid', selfMid: 98000, hiredMid: 157000 } },
  stats: [],
};
const LEGACY_DEAL = { id: 6002, name: 'Legacy No Provenance', type: 'flip', verdict: 'X', cls: 'warm',
  notes: '', date: 'Jun 16, 2026',
  data: { type: 'flip', ask: 100000, arv: 200000, rep: 40000, hold: 5, cc1: 2, cc2: 5,
          carry: 900, target: 40000, sqft: 0, self: false, loan: 0, rate: 0.10, points: 0.03 },
  stats: [] };
savedPayloads = [];
globalThis.__stubSupabase = { session, rpc: {
  get_pipeline: { data: [EST_DEAL, LEGACY_DEAL], error: null },
  save_pipeline: (args) => { savedPayloads.push(args.p_deals); return { data: { ok: true }, error: null }; },
} };
await auth.initAuthAndEntitlement();
await storage.hydratePipeline();

// E1 · estimator-owned + toggle → governed midpoint swap, then canonical recompute at Save
pe('name').value = '417 Saddlebrooke Rd — Lake Murray';
pe('market').value = 'lake-murray-sc';
pe('ask').value = '289,000'; pe('arv').value = '365,000';
pe('rep').value = '98,000'; pe('rep').dataset.repOwned = 'estimator';
pe('hold').value = '5'; pe('cc1').value = '2'; pe('cc2').value = '5';
pe('carry').value = '2,150'; pe('target').value = '28,000'; pe('sqft').value = '2622';
pe('rate').value = '10'; pe('points').value = '3'; pe('loan').value = ''; pe('notes').value = '';
pe('self').checked = false;                           // Aaron's live action: turn self OFF
pipeline.dealEditSelfToggled(6001);
ok("[DEFECT-CLOSING · E1] estimator-owned repair swaps to the hired midpoint on toggle",
   pe('rep').value === '157,000');
pe('self').checked = true; pipeline.dealEditSelfToggled(6001);
ok("[DEFECT-CLOSING · E1] toggling back restores the self midpoint", pe('rep').value === '98,000');
pe('self').checked = false; pipeline.dealEditSelfToggled(6001);
let r6 = await pipeline.saveDealEdits(6001);
let e6 = savedPayloads.at(-1).find(d => d.id === 6001);
const expOff = finance.computeFlip({ ask: 289000, arv: 365000, rep: 157000, hold: 5,
  cc1: 0.02, cc2: 0.05, carry: 2150, loan: 0, self: false });
ok("[DEFECT-CLOSING · E1] save persists the recalculated estimator repair", e6.data.rep === 157000);
ok("[DEFECT-CLOSING · E1] downstream economics recompute through canonical computeFlip",
   e6.data.profit === expOff.profit && e6.data.maxOffer === expOff.maxOffer
   && e6.data.totalIn === expOff.totalIn);
ok("[DEFECT-CLOSING · E1] ownership stays estimator after a governed swap", e6.data.repSource === 'estimator');
ok("[PRESERVATION · E1] the snapshot rides forward", JSON.stringify(e6.data.repEstimate) === JSON.stringify(EST_DEAL.data.repEstimate));

// E2 · manual override + toggle → the user's dollars are never touched
pe('rep').value = '120,000'; pe('rep').dataset.repOwned = 'manual';   // E3: typing flips ownership
pe('self').checked = true; pipeline.dealEditSelfToggled(6001);
ok("[DEFECT-CLOSING · E2] toggling never rewrites a user-owned repair number", pe('rep').value === '120,000');
r6 = await pipeline.saveDealEdits(6001);
e6 = savedPayloads.at(-1).find(d => d.id === 6001);
ok("[DEFECT-CLOSING · E2/E3] save persists the manual number and manual ownership",
   e6.data.rep === 120000 && e6.data.repSource === 'manual');
ok("[PRESERVATION · E2] self flag still reaches the engine (75% rule) despite manual repair",
   e6.data.maxOffer === finance.computeFlip({ ask: 289000, arv: 365000, rep: 120000, hold: 5,
     cc1: 0.02, cc2: 0.05, carry: 2150, loan: 0, self: true }).maxOffer);

// E4 · explicit re-adoption returns ownership to the estimator
pipeline.dealEditUseEstimate(6001);
ok("[DEFECT-CLOSING · E4] use-estimator re-applies the governed midpoint for the current self state",
   pe('rep').value === '98,000' && pe('rep').dataset.repOwned === 'estimator');
pe('self').checked = false; pipeline.dealEditSelfToggled(6001);
ok("[DEFECT-CLOSING · E4] subsequent toggles recalc again after re-adoption", pe('rep').value === '157,000');

// E5 · legacy unknown provenance — SAFE BY DEFAULT, ADOPTABLE BY EXPLICIT
// ACTION (final pre-push ruling): loads unchanged; self-toggle alone never
// rewrites; but "Use estimator midpoint" WORKS, computing the governed snapshot
// from the deal's own sqft + saved/selected market — no leaving the Pipeline.
delete pe('rep').dataset.repSnapshot;
pe('rep').value = '40,000'; pe('rep').dataset.repOwned = 'manual';
pe('ask').value = '100,000'; pe('arv').value = '200,000'; pe('name').value = 'Legacy No Provenance';
pe('market').value = ''; pe('sqft').value = ''; pe('carry').value = '900'; pe('target').value = '40,000';
pe('loan').value = ''; pe('notes').value = ''; pe('hold').value = '5'; pe('cc1').value = '2'; pe('cc2').value = '5';
pe('rate').value = '10'; pe('points').value = '3';
pe('self').checked = true; pipeline.dealEditSelfToggled(6002);
ok("[RULING · E5-1/2] legacy loads unchanged; toggle alone mutates nothing", pe('rep').value === '40,000');
pe('msg').textContent = '';
pipeline.dealEditUseEstimate(6002);
ok("[RULING · E5] adoption without sqft refuses with guidance, value untouched",
   pe('rep').value === '40,000' && /square footage/.test(pe('msg').textContent));
r6 = await pipeline.saveDealEdits(6002);
let l6 = savedPayloads.at(-1).find(d => d.id === 6002);
ok("[RULING · E5] un-adopted legacy save keeps the number, records known-manual, invents no snapshot",
   l6.data.rep === 40000 && l6.data.repSource === 'manual' && !l6.data.repEstimate);

// E5b · explicit adoption (ruling tests 3–7) — the REAL target path: sqft 2622
// + Lake Murray (no flip entry → Southeast fallback {38,82} → 98,000/157,000).
pe('sqft').value = '2622'; pe('market').value = 'lake-murray-sc';
pe('self').checked = true;
pipeline.dealEditUseEstimate(6002);
ok("[RULING · E5b-3/4] adoption computes the governed snapshot from the deal's market+sqft and applies the SELF midpoint",
   pe('rep').value === '98,000' && pe('rep').dataset.repOwned === 'estimator');
pe('self').checked = false; pipeline.dealEditSelfToggled(6002);
ok("[RULING · E5b-6] subsequent toggles swap estimator-owned values", pe('rep').value === '157,000');
r6 = await pipeline.saveDealEdits(6002);
l6 = savedPayloads.at(-1).find(d => d.id === 6002);
const expAdopt = finance.computeFlip({ ask: 100000, arv: 200000, rep: 157000, hold: 5,
  cc1: 0.02, cc2: 0.05, carry: 900, loan: 0, self: false });
ok("[RULING · E5b-5] downstream economics recompute through canonical computeFlip",
   l6.data.profit === expAdopt.profit && l6.data.maxOffer === expAdopt.maxOffer);
ok("[RULING · E5b] adoption persists estimator ownership AND the governed snapshot",
   l6.data.repSource === 'estimator'
   && JSON.stringify(l6.data.repEstimate) === JSON.stringify({ tier: 'mid', selfMid: 98000, hiredMid: 157000 }));
ok("[RULING · E5b] the deal's saved market drives the snapshot", l6.market === 'lake-murray-sc');
pe('rep').value = '150,000'; pe('rep').dataset.repOwned = 'manual';
pe('self').checked = true; pipeline.dealEditSelfToggled(6002);
ok("[RULING · E5b-7] a manual edit after adoption is protected from automatic changes", pe('rep').value === '150,000');
r6 = await pipeline.saveDealEdits(6002);
l6 = savedPayloads.at(-1).find(d => d.id === 6002);
ok("[RULING · E5b-7] manual ownership persists after adoption-then-override",
   l6.data.repSource === 'manual' && l6.data.rep === 150000);

// E6 · the analyzer now stamps provenance at the source
const flipSrc2 = src("docs/src/js/flip.js");
ok("[DEFECT-CLOSING · E6] analyzeFlip serializes ownership from the DOM law",
   /repSource: repOwnedByEstimator \? 'estimator' : 'manual'/.test(flipSrc2));
ok("[DEFECT-CLOSING · E6] analyzeFlip stamps the frozen estimator snapshot",
   /repEstimate: repairEstimateSnapshot\(sqft\)/.test(flipSrc2));
ok("[PRESERVATION · E6] estimator bands/discounts untouched by the corrective",
   /hiredLow:\s*Math\.round\(lo \* 0\.35\)/.test(src("docs/src/js/repair.js"))
   && /selfLow:\s*Math\.round\(lo \* 0\.62\)/.test(src("docs/src/js/repair.js")));

// ── §F · market association is editable, explicit, and durable (defect 2) ────
// F1 · the form pre-selects the stored stamp (source law: selected attribute)
const plSrc2 = src("docs/src/js/pipeline.js");
ok("[DEFECT-CLOSING · F1] the editor renders a market selector", /select data-pe="market"/.test(plSrc2));
ok("[DEFECT-CLOSING · F1] the stored stamp pre-selects its option",
   /o\.id === currentId \? ' selected' : ''/.test(plSrc2));
ok("[DEFECT-CLOSING · F1] a stamped id outside the catalog is preserved, never dropped",
   /opts\.unshift\(\{ id: currentId/.test(plSrc2));
// F2/F3 · legacy deal: explicit selection persists (behavioral, incl. the real target flow)
pe('name').value = 'Legacy No Provenance';
pe('market').value = 'lake-murray-sc';
await pipeline.saveDealEdits(6002);
let f2 = savedPayloads.at(-1).find(d => d.id === 6002);
ok("[DEFECT-CLOSING · F2] Edit → select Lake Murray → Save persists the association",
   f2.market === 'lake-murray-sc' && f2.marketLabel === 'Lake Murray, SC');
globalThis.__stubSupabase.rpc.get_pipeline = { data: savedPayloads.at(-1), error: null };
await storage.hydratePipeline();
ok("[DEFECT-CLOSING · F3] refresh (re-hydration) retains the market",
   storage.getDeals().find(d => d.id === 6002).market === 'lake-murray-sc');
// F4 · the read-only detail advertises the association
ok("[DEFECT-CLOSING · F4] expanded detail renders the Underwritten-in row",
   /'Underwritten in', v: escapeHtml\(deal\.marketLabel\)/.test(plSrc2));
// F5 · the ACTIVE market has no say: change it, save again, stamp unmoved
store.set('activeSlot', '0'); store.set('primaryMarket', 'charlotte-nc');
await pipeline.saveDealEdits(6002);
f2 = savedPayloads.at(-1).find(d => d.id === 6002);
ok("[DEFECT-CLOSING · F5] a different ACTIVE market never rewrites the saved stamp",
   f2.market === 'lake-murray-sc');
// F6 · sharing consumes the SAVED association (pure builder takes only the deal)
const share2 = await import("../docs/src/js/share.js");
ok("[DEFECT-CLOSING · F6] the share message region comes from the saved deal, not the active market",
   /in Lake Murray, SC/.test(share2.buildShareMessage(f2, null))
   && store.get('primaryMarket') === 'charlotte-nc');
// F7 · deal-name text does not determine market identity
pe('name').value = 'Somewhere — Asheville';
pe('market').value = '';
await pipeline.saveDealEdits(6002);
f2 = savedPayloads.at(-1).find(d => d.id === 6002);
ok("[DEFECT-CLOSING · F7] name text never infers a market (cleared selector → null stamp)",
   f2.market === null && f2.marketLabel === null && /Asheville/.test(f2.name));

console.log(`\ndealedit: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Canonical-engine pipeline editing holds ✓");
