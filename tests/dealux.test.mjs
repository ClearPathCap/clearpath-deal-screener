// D-1 P2 batch + M-1 — deal-entry UX law.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/dealux.test.mjs
//
// M-1  the repair estimator's ranges must never outlive the market they came
//      from. `updateRepairRangesForMarket` carries its own reset branch, but the
//      ONLY caller sat inside `if (activeId)` in renderMarketSlots — so when the
//      active market went away (slot cleared, or a tier downgrade / sign-out that
//      locks the slot holding it while slot 0 is empty) the reset was
//      unreachable and `_ranges` kept serving the departed market. The chips read
//      "Pick Market"; the bands, and the Repair Costs figure auto-filled from
//      them, were still Charlotte's.
//
// P2-1 estimator-filled Repair Costs is currency-formatted, so typing into it
//      CONCATENATES: 7,800 with 55,000 typed becomes 7,800,055,000.
//
// P2-2 the pipeline's flip "ROI" is a cash-on-cash return.
//
// The M-1 assertions observe `_ranges` through repair.js's own exported
// getCurrentTier() — module-private state, read the way the app reads it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── browser shims ────────────────────────────────────────────────────────────
const elements = new Map();
const mkEl = (id) => ({
  id, textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, checked: false,
  classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
               contains(c){return this._s.has(c);}, toggle(c,f){const on=f===undefined?!this._s.has(c):!!f; on?this._s.add(c):this._s.delete(c); return on;} },
  addEventListener(){}, removeEventListener(){}, setAttribute(){}, removeAttribute(){},
  focus(){}, click(){}, select(){}, appendChild(){}, insertBefore(){}, dispatchEvent(){ return true; },
  querySelectorAll: () => [], querySelector: () => null,
});
globalThis.Event = globalThis.Event ?? class { constructor(type){ this.type = type; } };
const el = (id) => { if (!elements.has(id)) elements.set(id, mkEl(id)); return elements.get(id); };

globalThis.location = { search: '', href: 'https://dealfit.example/', pathname: '/' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  getElementById: el, querySelectorAll: () => [], querySelector: () => null,
  addEventListener(){}, removeEventListener(){},
  body: mkEl('body'), documentElement: mkEl('html'), createElement: (t) => mkEl('_'+t),
};
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener ?? (() => {});
globalThis.removeEventListener = globalThis.removeEventListener ?? (() => {});
globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches:false, addEventListener(){}, addListener(){} }));
globalThis.history = { replaceState(){} };
globalThis.alert = () => {};
console.error = () => {};

globalThis.__stubSupabase = { session: null, rpc: { current_tier: { data: null, error: null } } };
const main   = await import("../docs/src/js/main.js");
const repair = await import("../docs/src/js/repair.js");

// The governed no-market baseline. M-2 is PARKED: this batch must not move it,
// so the expected values are pinned to repair.js's existing DEFAULT_RANGES.
const NO_MARKET = { light:{lo:18,hi:35}, mid:{lo:42,hi:70}, full:{lo:90,hi:130} };
const CHARLOTTE_MID = { lo: 40, hi: 85 };   // FLIP_MARKETS['charlotte-nc'] {40,85}

const bandsNow = () => { const t = repair.getCurrentTier(); return { lo: t.hiredLow, hi: t.hiredHigh }; };
const setMarket = (slug) => { if (slug) store.set('primaryMarket', slug); else store.delete('primaryMarket'); };

ok("[HARNESS] main.js loads and publishes the slot renderer path", typeof globalThis.openUpgrade === 'function');
ok("[HARNESS] repair.js exposes its current tier", typeof repair.getCurrentTier === 'function');

// ── §A · M-1 · ranges must not outlive their market ─────────────────────────
// renderAllSlots is module-private, so the suite drives the exact path the app
// uses whenever tier or auth state changes: an auth resolution fires
// onAuthChange → refreshTierUI → renderAllSlots → renderMarketSlots. That is the
// same entry point a sign-out or a tier downgrade goes through, which is
// precisely the transition M-1 is about.
const auth = await import("../docs/src/js/auth.js");
const resync = async () => { await auth.initAuthAndEntitlement(); };

store.set('activeSlot', '0');
setMarket('charlotte-nc');
await resync();
ok("[SETUP] selecting a market drives the estimator to that market's bands",
   bandsNow().lo === CHARLOTTE_MID.lo && bandsNow().hi === CHARLOTTE_MID.hi);

// 1. Clear the active slot → ranges must return to the no-market default.
setMarket(null);
await resync();
const afterClear = bandsNow();
ok("[DEFECT-CLOSING · M-1] clearing the active market returns the bands to the no-market default",
   afterClear.lo === NO_MARKET.mid.lo && afterClear.hi === NO_MARKET.mid.hi);
ok("[DEFECT-CLOSING · M-1] the cleared state does NOT retain Charlotte's bands",
   !(afterClear.lo === CHARLOTTE_MID.lo && afterClear.hi === CHARLOTTE_MID.hi));

// 2. A tier transition that locks the slot holding the market leaves nothing stale.
setMarket('charlotte-nc');
store.set('market_2', 'charlotte-nc');
await resync();
ok("[SETUP] market re-applied", bandsNow().lo === CHARLOTTE_MID.lo);
store.delete('primaryMarket');       // slot 0 empty …
store.delete('market_2');            // … and the slot that held it is gone/locked
await resync();
const afterDowngrade = bandsNow();
ok("[DEFECT-CLOSING · M-1] a transition that removes the active market cannot leave stale ranges",
   afterDowngrade.lo === NO_MARKET.mid.lo && afterDowngrade.hi === NO_MARKET.mid.hi);

// 3. Visible empty-market state and the data behind it agree, on every scope tier.
for (const [name, exp] of Object.entries(NO_MARKET)) {
  repair.setRepairTier(name, mkEl('tier-' + name));
  const t = repair.getCurrentTier();
  ok(`[DEFECT-CLOSING · M-1] empty-market ${name} band is the governed default (${exp.lo}-${exp.hi})`,
     t.hiredLow === exp.lo && t.hiredHigh === exp.hi);
}
repair.setRepairTier('mid', mkEl('tier-mid'));

// 4. M-2 is PARKED — the no-market default must still be repair.js's own
//    DEFAULT_RANGES, NOT flip.js's FLIP_NATIONAL_DEFAULT (Southeast {38,82}).
ok("[PARKED · M-2] the no-market reset uses the EXISTING DEFAULT_RANGES, not the flip national default",
   bandsNow().lo === 42 && bandsNow().hi === 70 && bandsNow().lo !== 38 && bandsNow().hi !== 82);
const repairSrc = src("docs/src/js/repair.js");
ok("[PARKED · M-2] DEFAULT_RANGES still exists and is unchanged",
   /const DEFAULT_RANGES = \{\s*light: \{ selfLow: 12, selfHigh: 22, hiredLow: 18, hiredHigh: 35 \},\s*mid:\s*\{ selfLow: 28, selfHigh: 48, hiredLow: 42, hiredHigh: 70 \},\s*full:\s*\{ selfLow: 60, selfHigh: 95, hiredLow: 90, hiredHigh: 130 \},\s*\}/.test(repairSrc));
ok("[PARKED · M-2] repair.js does not import the flip national default",
   !/FLIP_NATIONAL_DEFAULT|FLIP_REGIONAL_DEFAULTS/.test(repairSrc));

// 5. The reset is wired as the dispatch specified: unconditional call, null on empty.
const mainSrc = src("docs/src/js/main.js");
ok("[DEFECT-CLOSING · M-1] the empty-market path calls the updater with null",
   /updateRepairRangesForMarket\(null\)/.test(mainSrc));
ok("[DEFECT-CLOSING · M-1] it is reached on the else of the active-market branch",
   mainSrc.indexOf("} else if (tabType === 'flip') {") > -1
   && mainSrc.indexOf('updateRepairRangesForMarket(null)') > mainSrc.indexOf("} else if (tabType === 'flip') {"));
ok("[PRESERVATION] market state itself was not redesigned — the slot API is untouched",
   /export function setMarketSlot/.test(src("docs/src/js/tiers.js"))
   && /export function getMarketForSlot/.test(src("docs/src/js/tiers.js")));

// ── §B · P2-1 · Repair Costs is replacement-ready, but never hijacks editing ──
// Resolved through a fallback so this suite COUNTS failures rather than throwing
// when the predicate is absent — that is what lets the whole file still reach the
// M-1 assertions when run against the parent commit, where the real proof is that
// the ORDERING/reset behaviour was wrong, not merely that an export is new.
const S = typeof repair.repairFieldShouldSelectOnFocus === 'function'
  ? repair.repairFieldShouldSelectOnFocus
  : () => null;
ok("[DEFECT-CLOSING · P2-1] an estimator-filled value selects on focus", S({ autoFilled: '1' }) === true);
ok("[DEFECT-CLOSING · P2-1] a user-edited value NEVER selects (caret is left where it was put)",
   S({ autoFilled: '1', userEdited: '1' }) === false);
ok("[DEFECT-CLOSING · P2-1] userEdited alone never selects", S({ userEdited: '1' }) === false);
ok("[DEFECT-CLOSING · P2-1] an untouched empty field never selects", S({}) === false);
ok("[DEFECT-CLOSING · P2-1] a missing dataset is safe", S(undefined) === false && S(null) === false);
ok("[DEFECT-CLOSING · P2-1] only the exact estimator flag counts", S({ autoFilled: 'yes' }) === false);
ok("[PRESERVATION · P2-1] the existing userEdited law still stops estimator rewrites",
   /if \(repField && !repField\.dataset\.userEdited\) \{/.test(repairSrc));
ok("[PRESERVATION · P2-1] typing still sets userEdited and clears autoFilled",
   /repField\.dataset\.userEdited = '1';\s*\n\s*delete repField\.dataset\.autoFilled;/.test(mainSrc));
ok("[DEFECT-CLOSING · P2-1] focus consults the predicate, not an ad-hoc check",
   /if \(!repairFieldShouldSelectOnFocus\(repField\.dataset\)\) return;/.test(mainSrc));
ok("[DEFECT-CLOSING · P2-1] the focusing press cannot collapse the selection",
   /selectOnRelease = true/.test(mainSrc) && /mouseup/.test(mainSrc) && /e\.preventDefault\(\)/.test(mainSrc));
ok("[DEFECT-CLOSING · P2-1] a LATER press still positions the caret (flag is one-shot)",
   /if \(!selectOnRelease\) return;\s*\n\s*selectOnRelease = false;/.test(mainSrc));
ok("[PRESERVATION · P2-1] select() is guarded so an engine without it cannot break focus",
   /try \{ repField\.select\(\); \} catch/.test(mainSrc));

// ── §C · P2-2 · the pipeline names cash-on-cash precisely ───────────────────
const pipeSrc = src("docs/src/js/pipeline.js");
ok("[DEFECT-CLOSING · P2-2] no bare 'ROI' label survives in the pipeline",
   !/\{ l: 'ROI'|l: 'ROI',/.test(pipeSrc));
ok("[DEFECT-CLOSING · P2-2] the collapsed card names it Cash-on-Cash ROI",
   /\{ l: 'Cash-on-Cash ROI', v: pct\(r\.roi\) \}/.test(pipeSrc));
ok("[DEFECT-CLOSING · P2-2] the expanded surface names it Cash-on-Cash ROI",
   /\{ l: 'Cash-on-Cash ROI',\s+v: d\.roi\s+!= null \? pct\(d\.roi\)\s+: '—' \}/.test(pipeSrc));
ok("[DEFECT-CLOSING · P2-2] both affected surfaces were updated (exactly two)",
   (pipeSrc.match(/Cash-on-Cash ROI/g) || []).length === 2);
ok("[PRESERVATION · P2-2] the label matches the results screen's governed wording",
   /Cash-on-Cash ROI<\/span>/.test(src("docs/src/js/flip.js")));
ok("[PRESERVATION · P2-2] the value expressions are untouched",
   /v: pct\(r\.roi\)/.test(pipeSrc) && /pct\(d\.roi\)/.test(pipeSrc));
ok("[PRESERVATION · P2-2] sibling analyzer labels are NOT swept up",
   /\{ l: 'DSCR',/.test(pipeSrc) && /\{ l: 'CoC',/.test(pipeSrc) && /\{ l: 'Cash Flow',/.test(pipeSrc));

// ── §D · arithmetic and market data are untouched ───────────────────────────
// Market data integrity, stated against the canonical dataset itself rather than
// as an absence-of-string claim: main.js legitimately renders repairLow/High in
// the Guide market intel, so "the file never mentions them" was never the law.
const marketsSrc = src("docs/src/js/markets.js");
ok("[PRESERVATION] Charlotte's canonical repair data is unchanged",
   /'charlotte-nc': \{[\s\S]{0,400}?repairLow: 40, repairHigh: 85,/.test(marketsSrc));
ok("[PRESERVATION] the flip regional/national fallbacks are unchanged (M-2 parked)",
   /'Southeast':\s*\{ medianArv: 310000, arvRuleLow: 0\.65, arvRuleHigh: 0\.69, repairLow: 38, repairHigh: 82,/.test(src("docs/src/js/flip.js"))
   && /const FLIP_NATIONAL_DEFAULT = FLIP_REGIONAL_DEFAULTS\['Southeast'\];/.test(src("docs/src/js/flip.js")));
ok("[PRESERVATION] the market catalog still carries its full set of entries",
   (marketsSrc.match(/repairLow:/g) || []).length === 133);
ok("[PRESERVATION] the range derivation formula is unchanged",
   /hiredLow:\s*Math\.round\(lo \* 0\.35\)/.test(repairSrc)
   && /hiredHigh:\s*Math\.round\(hi \* 1\.45\)/.test(repairSrc)
   && /selfLow:\s*Math\.round\(hi \* 0\.62\)/.test(repairSrc));
ok("[PRESERVATION] the midpoint auto-fill formula is unchanged",
   /const mid = Math\.round\(\(sqft \* \(low \+ high\) \/ 2\) \/ 1000\) \* 1000;/.test(repairSrc));
ok("[PRESERVATION] finance.js was not touched by this batch", !/P2-1|P2-2|M-1:/.test(src("docs/src/js/finance.js")));
ok("[PRESERVATION] flip.js analyzer math was not touched by this batch",
   !/P2-1|P2-2/.test(src("docs/src/js/flip.js")));

console.log(`\ndealux: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Deal-entry UX law holds ✓");
