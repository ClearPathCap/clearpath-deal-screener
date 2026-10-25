// ─── DF-2026-10-25-01 · Market guide never shows "NaN% cap" ─────────────────
// Most LTR_MARKETS entries carry no capRate; the guide's long-term-rental row
// multiplied the missing field and printed "NaN% cap". The cap clause (value and
// label) now renders only when the market has a capRate; rent and vacancy render
// as before. Executes the REAL buildRegionIntel bytes sliced from main.js against
// the REAL market tables — no production test seam.
// Run: node tests/marketguide.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// Real market tables (markets.js has no imports).
const M = await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/markets.js")));
const { FLIP_MARKETS, STR_MARKETS, LTR_MARKETS } = M;

// Real renderer: _kFmt + buildRegionIntel, sliced verbatim from main.js.
const main = src("docs/src/js/main.js");
const start = main.indexOf("function _kFmt(");
const fnAt = main.indexOf("function buildRegionIntel(", start);
const end = main.slice(fnAt).search(/\r?\n\}\r?\n/);
ok("slice: found _kFmt and buildRegionIntel in main.js", start >= 0 && fnAt > start && end > 0);
const body = main.slice(start, fnAt + end) + "\n}\n";
const getMarketLabel = (slug) => slug;   // label text is not under test
const buildRegionIntel = new Function("FLIP_MARKETS", "STR_MARKETS", "LTR_MARKETS", "getMarketLabel",
  body + "\nreturn buildRegionIntel;")(FLIP_MARKETS, STR_MARKETS, LTR_MARKETS, getMarketLabel);

const ltrRow = (html) => {
  const m = html.match(/<div class="gi-label">(Long-term rent \(2BR\)[^<]*)<\/div><div class="gi-val">([^<]*)<\/div>/);
  return m ? { label: m[1], val: m[2] } : null;
};

const slugs = Object.keys(LTR_MARKETS);
const noCap = slugs.filter(s => !Number.isFinite(LTR_MARKETS[s].capRate));
const withCap = slugs.filter(s => Number.isFinite(LTR_MARKETS[s].capRate));
ok("premise: some LTR markets carry no capRate (the defect's trigger)", noCap.length > 0);
ok("premise: some LTR markets carry a capRate", withCap.length > 0);

// Every LTR market, every tier: no NaN / undefined anywhere in the guide block.
let bad = [];
for (const s of slugs) for (const tier of ["starter", "investor", "pro"]) {
  const html = buildRegionIntel(s, tier, null);
  if (/NaN|undefined/.test(html)) bad.push(`${s}/${tier}`);
}
ok(`no guide block prints NaN or undefined (${slugs.length} markets × 3 tiers)` + (bad.length ? ` — ${bad.slice(0, 5).join(", ")}` : ""), bad.length === 0);

// Markets without a capRate: rent + vacancy only, label without "cap rate".
let badNo = noCap.filter(s => {
  const r = ltrRow(buildRegionIntel(s, "pro", null));
  return !r || r.label !== "Long-term rent (2BR)" || /cap/.test(r.val) || !/\/mo · \d+% vac\.$/.test(r.val);
});
ok(`no-capRate markets show rent and vacancy, no cap clause (${noCap.length})` + (badNo.length ? ` — ${badNo.slice(0, 5).join(", ")}` : ""), badNo.length === 0);

// Markets with a capRate: unchanged three-part row.
let badWith = withCap.filter(s => {
  const r = ltrRow(buildRegionIntel(s, "pro", null));
  const c = (LTR_MARKETS[s].capRate * 100).toFixed(1);
  return !r || r.label !== "Long-term rent (2BR) · cap rate" || !r.val.includes(` · ${c}% cap · `);
});
ok(`capRate markets keep the cap clause (${withCap.length})` + (badWith.length ? ` — ${badWith.slice(0, 5).join(", ")}` : ""), badWith.length === 0);

// The owner-observed market, exactly.
const bp = ltrRow(buildRegionIntel("bridgeport-ct", "starter", null));
ok("Bridgeport: '$1,750/mo · 7% vac.' under 'Long-term rent (2BR)'", bp && bp.label === "Long-term rent (2BR)" && bp.val === "$1,750/mo · 7% vac.");
const ch = ltrRow(buildRegionIntel("charlotte-nc", "starter", null));
ok("Charlotte (capRate 0.035): '$1,757/mo · 3.5% cap · 5% vac.'", ch && ch.label === "Long-term rent (2BR) · cap rate" && ch.val === "$1,757/mo · 3.5% cap · 5% vac.");

console.log(`\nmarketguide: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Market guide renders no NaN ✓");
