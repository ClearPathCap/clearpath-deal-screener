// Wave 5 · SR-7: shareDeal must not mislabel LTR/BRRR deals as short-term
// rentals or print `undefined% occ.` Run: node tests/share.test.mjs
//
// Baseline defect (Pass-0 SR-7, share.js:91-103 at 20a74620): the summary
// builder branched only `flip` vs everything-else-as-STR, so LTR and BRRR
// deals shared as "SHORT-TERM RENTAL ANALYSIS" with `undefined% occ.` and
// absent field names. [DEFECT-CLOSING] tests below are proven FAILING at the
// baseline; [PRESERVATION] pins keep flip/STR summaries intact.
//
// buildDealSummaryText is imported directly — Wave 5 extracts it as a pure
// export (the module's window/location touches are init-guarded so a Node
// import is side-effect-free).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

const shareSrc = src("docs/src/js/share.js");

// Source-level pins (these alone prove the defect at baseline).
ok("[DEFECT-CLOSING] share.js branches ltr explicitly", /d\.type === 'ltr'/.test(shareSrc));
ok("[DEFECT-CLOSING] share.js branches brrr explicitly", /d\.type === 'brrr'/.test(shareSrc));
ok("[DEFECT-CLOSING] buildDealSummaryText is exported for tests", /export function buildDealSummaryText/.test(shareSrc));

// Behavioral golden checks via the pure export.
const mod = await import("../docs/src/js/share.js").catch(() => null);
ok("[DEFECT-CLOSING] share.js is importable in Node (no top-level browser access)", !!mod);

if (mod && mod.buildDealSummaryText) {
  const base = { name: "Test Deal", verdict: "hot", notes: "" };

  const ltr = mod.buildDealSummaryText({
    ...base, type: "ltr",
    data: { addr: "1 Elm St", price: 250000, down: 20, rentMo: 2100,
            cashFlowMo: 240, dscr: 1.31, taxStatus: "entered", insStatus: "entered" },
  });
  ok("[DEFECT-CLOSING] LTR summary carries the LTR header", /LONG-TERM RENTAL/.test(ltr));
  ok("[DEFECT-CLOSING] LTR summary never says SHORT-TERM", !/SHORT-TERM/.test(ltr));
  ok("[DEFECT-CLOSING] LTR summary has no undefined field", !/undefined/.test(ltr));
  ok("[DEFECT-CLOSING] LTR summary shows DSCR", /DSCR/.test(ltr));

  const brrr = mod.buildDealSummaryText({
    ...base, type: "brrr",
    data: { addr: "2 Oak St", price: 180000, rehab: 40000, arv: 290000,
            cashFlowMo: 150, dscr: 1.22, capLeft: 12000,
            taxStatus: "entered", insStatus: "entered" },
  });
  ok("[DEFECT-CLOSING] BRRR summary carries the BRRR header", /BRRR/.test(brrr));
  ok("[DEFECT-CLOSING] BRRR summary never says SHORT-TERM", !/SHORT-TERM/.test(brrr));
  ok("[DEFECT-CLOSING] BRRR summary has no undefined field", !/undefined/.test(brrr));

  const flip = mod.buildDealSummaryText({
    ...base, type: "flip",
    data: { addr: "3 Pine St", ask: 200000, arv: 320000, rep: 45000,
            profit: 41000, roi: 0.19, maxOffer: 189000 },
  });
  ok("[PRESERVATION] flip summary keeps its header", /FIX & FLIP ANALYSIS/.test(flip));
  ok("[PRESERVATION] flip summary keeps max offer", /Max offer/.test(flip));

  const str = mod.buildDealSummaryText({
    ...base, type: "rental",
    data: { addr: "4 Beach Rd", price: 400000, down: 25, rent: 52000, occ: 70,
            cashflow: 9000, coc: 0.09, capRate: 0.06 },
  });
  ok("[PRESERVATION] STR summary keeps its header", /SHORT-TERM RENTAL ANALYSIS/.test(str));
  ok("[PRESERVATION] STR summary keeps occupancy", /70% occ\./.test(str));
} else {
  // Import failed at baseline: count the behavioral block as the failing evidence.
  for (let i = 0; i < 11; i++) ok("[DEFECT-CLOSING] behavioral golden check (unreachable at baseline)", false);
}

console.log(`\nshare: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("shareDeal summaries are type-honest ✓");
