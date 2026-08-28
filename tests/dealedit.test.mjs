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
ok("[PRESERVATION] underwritten market association survives the edit",
   edited.market === 'lake-murray-sc' && edited.marketLabel === 'Lake Murray SC');
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

console.log(`\ndealedit: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Canonical-engine pipeline editing holds ✓");
