// Public tool pages + technical SEO — regression guard (seo/n1122 wave).
// Run: node tests/seo.test.mjs
//
// What this pins:
//   §A  every public page is crawlable as built: unique title + description,
//       self canonical, one H1, parseable JSON-LD whose FAQ text is VISIBLE.
//   §B  robots.txt + sitemap.xml list exactly the indexable pages.
//   §C  the /?tool= deep link opens a real analyzer and strips itself.
//   §D  every factual claim the pages make about the stress tests and verdict
//       bars still exists in the engine. If the engine changes, this fails —
//       update the page copy IN THE SAME COMMIT, never just the pin.
//   §E  compliance wording: broker-not-lender + estimate disclaimer on every
//       page, no lending/approval/guarantee language, CPC links attributed.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (v, label) => { if (v) pass++; else { fail++; fails.push(label); } };

const ORIGIN = "https://dealfit.clearpathcapfunding.com";
const PAGES = [
  { slug: "risk-evaluation", tool: "flip" },
  { slug: "fix-and-flip-calculator", tool: "flip" },
  { slug: "dscr-calculator", tool: "ltr" },
  { slug: "brrrr-calculator", tool: "brrrr" },
  { slug: "short-term-rental-calculator", tool: "str" },
];
const ALL = [{ slug: "", file: "docs/index.html", app: true },
  ...PAGES.map((p) => ({ ...p, file: `docs/${p.slug}/index.html` }))];

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&minus;/g, "−")
  .replace(/&rarr;/g, "→").replace(/&larr;/g, "←").replace(/&middot;/g, "·").replace(/&divide;/g, "÷").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#8217;/g, "’").replace(/&nbsp;/g, " ");
const visibleText = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<head[\s\S]*?<\/head>/, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const metaContent = (html, attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (ld) => ld.flatMap((d) => d["@graph"] || [d]);
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => decode(m[1]));

console.log("— §A pages are crawlable as built —");
const titles = new Set(), descs = new Set();
for (const p of ALL) {
  ok(existsSync(join(root, p.file)), `A0 ${p.file} exists`);
  const html = src(p.file);
  const url = ORIGIN + "/" + (p.slug ? p.slug + "/" : "");
  const title = decode((html.match(/<title>([^<]+)<\/title>/) || [])[1] || "");
  const desc = decode(metaContent(html, "name", "description") || "");
  ok(title.length >= 20 && title.length <= 80 && !titles.has(title), `A1 ${p.file} unique title 20–80 chars (${title.length})`);
  ok(desc.length >= 70 && desc.length <= 200 && !descs.has(desc), `A2 ${p.file} unique description 70–200 chars (${desc.length})`);
  titles.add(title); descs.add(desc);
  ok((html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1] === url, `A3 ${p.file} self canonical = ${url}`);
  ok(metaContent(html, "property", "og:url") === url, `A4 ${p.file} og:url = canonical`);
  ok((html.match(/<h1[\s>]/g) || []).length === 1, `A5 ${p.file} has exactly one H1`);
  ok(!/name="robots" content="[^"]*noindex/.test(html), `A6 ${p.file} is not noindex`);
  let ld = [];
  try { ld = jsonLd(html); ok(ld.length >= 1, `A7 ${p.file} carries JSON-LD`); } catch (e) { ok(false, `A7 ${p.file} JSON-LD parses (${e.message})`); }
  const vis = visibleText(html);
  for (const n of nodes(ld)) {
    if (n["@type"] === "FAQPage") {
      for (const q of n.mainEntity) {
        ok(vis.includes(q.name), `A8 ${p.file} FAQ question is visible: "${q.name}"`);
        ok(vis.includes(q.acceptedAnswer.text), `A9 ${p.file} FAQ answer is visible verbatim: "${q.name}"`);
      }
    }
    if (n["@type"] === "BreadcrumbList") {
      const last = n.itemListElement[n.itemListElement.length - 1];
      ok(last.item === url, `A10 ${p.file} breadcrumb ends at the canonical`);
    }
  }
  // every root-relative link and asset resolves to a file that ships in docs/
  for (const h of hrefs(html).filter((x) => x.startsWith("/"))) {
    const path = h.split(/[?#]/)[0];
    const target = path.endsWith("/") ? join(root, "docs", path, "index.html") : join(root, "docs", path);
    ok(existsSync(target), `A11 ${p.file} link ${h} resolves`);
  }
}
const app = src("docs/index.html");
ok(nodes(jsonLd(app)).some((n) => n["@type"] === "SoftwareApplication" && n.url === ORIGIN + "/"), "A12 app shell declares SoftwareApplication at the canonical URL");
for (const p of PAGES) ok(app.includes(`href="/${p.slug}/"`), `A13 app shell links to /${p.slug}/`);
for (const p of PAGES) {
  const others = PAGES.filter((q) => q.slug !== p.slug);
  const html = src(`docs/${p.slug}/index.html`);
  ok(others.every((q) => html.includes(`href="/${q.slug}/"`)), `A14 /${p.slug}/ links to every other tool page`);
}

console.log("— §B robots + sitemap —");
const robots = src("docs/robots.txt");
ok(/^User-agent: \*$/m.test(robots) && /^Allow: \/$/m.test(robots), "B1 robots allows all crawlers");
ok(!/^Disallow:/m.test(robots), "B2 robots disallows nothing (noindex pages must stay crawlable to be seen)");
ok(robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`), "B3 robots names the sitemap");
const locs = [...src("docs/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const expected = ALL.map((p) => ORIGIN + "/" + (p.slug ? p.slug + "/" : ""));
ok(locs.length === expected.length && expected.every((u) => locs.includes(u)), "B4 sitemap lists exactly the indexable pages");
ok(/noindex/.test(src("docs/shared.html")) && !locs.some((u) => /shared/.test(u)), "B5 shared deal view stays noindex and out of the sitemap");

console.log("— §C /?tool= deep link —");
// docs/ has no package.json "type": load the ES module source via a data: URL (same pattern as finance.js suites).
const TL = await import("data:text/javascript;base64," + Buffer.from(src("docs/src/js/toolLink.js")).toString("base64"));
ok(TL.parseToolParam("?tool=flip")?.page === "flip" && TL.parseToolParam("?tool=flip").view === null, "C1 flip → Fix & Flip page");
ok(TL.parseToolParam("?tool=ltr")?.view === "ltr" && TL.parseToolParam("?tool=DSCR")?.view === "ltr", "C2 ltr / dscr (any case) → Long-Term view");
ok(TL.parseToolParam("?tool=brrrr")?.view === "brrr" && TL.parseToolParam("?tool=str")?.view === "str", "C3 brrrr → BRRRR, str → Short-Term");
ok(TL.parseToolParam("?tool=__proto__") === null && TL.parseToolParam("?tool=pipeline") === null && TL.parseToolParam("") === null, "C4 unknown or absent names are ignored");
ok(TL.stripToolParam("?tool=flip") === "" && TL.stripToolParam("?src=x&tool=ltr") === "?src=x" && TL.stripToolParam("?src=x") === "?src=x", "C5 strip removes only tool");
for (const view of new Set(Object.values(TL.TOOL_TARGETS).map((t) => t.view).filter(Boolean))) ok(app.includes(`id="subtab-${view}"`) && app.includes(`id="rental-view-${view}"`), `C6 view ${view} exists in the app shell`);
for (const page of new Set(Object.values(TL.TOOL_TARGETS).map((t) => t.page))) ok(app.includes(`data-tab="${page}"`) && app.includes(`id="page-${page}"`), `C7 page ${page} exists in the app shell`);
for (const p of PAGES) {
  const links = hrefs(src(`docs/${p.slug}/index.html`)).filter((h) => h.startsWith("/?tool="));
  ok(links.length >= 1 && links.every((h) => TL.parseToolParam(h.slice(1)) !== null) && links.includes(`/?tool=${p.tool}`), `C8 /${p.slug}/ CTA opens ?tool=${p.tool}`);
}
const mainJs = src("docs/src/js/main.js");
const iTool = mainJs.indexOf("const toolLink = consumeToolLink();"), iOnb = mainJs.indexOf("\ninitOnboarding();");
ok(/import \{ consumeToolLink \}\s+from '\.\/toolLink\.js';/.test(mainJs) && iTool > 0 && iTool < iOnb, "C9 main.js consumes the tool link at init, before onboarding");

console.log("— §D page claims match the engine —");
const fin = src("docs/src/js/finance.js");
const str = src("docs/src/js/strFinance.js");
const pin = (re, label) => ok(re.test(fin), `D ${label}`);
pin(/Flip stress test: ARV −5%, rehab \+10%, hold \+1 month → net profit ≥ 0/, "flip haircuts ARV −5% / rehab +10% / +1 month");
pin(/const strongBar = target > 0 \? 0\.5 \* target : 25000;/, "flip Strong = ½ target, or $25,000 with no target");
pin(/stressedProfit < 0 \? 'fails'/, "flip Fails below $0");
pin(/const hotDollar = Math\.max\(50000, target \|\| 0\);/, "flip strongest verdict ≥ max($50K, target)");
pin(/profit >= hotDollar && roi >= 15 && maxOffer > 0 && survives/, "flip strongest verdict: ROI ≥ 15%, max offer > 0, survives");
pin(/const maxOffer = arv \* \(self \? 0\.75 : 0\.70\) - rep;/, "max offer 70% (75% self-renovating) of ARV − repairs");
pin(/rentYr: rentMo \* 0\.95 \* 12,/, "rent −5% haircut");
pin(/: vacF \+ 0\.03;/, "1–4 unit LTR vacancy +3 points");
pin(/Math\.max\(vacF \+ 0\.05, \(\+inp\.units > 0 \? 1 \/ Number\(inp\.units\) : vacF \+ 0\.05\)\)/, "5–8 unit vacancy: higher of +5 points or one vacant unit");
pin(/rate: rateF \+ 0\.005,/, "LTR rate +0.5%");
pin(/'1-4':\{[^}]*hotDscr:1\.25[^}]*mosStrong:1\.15/, "1–4 bands: strong DSCR 1.25, Strong margin 1.15");
pin(/'5-8':\{[^}]*hotDscr:1\.25[^}]*mosStrong:1\.20/, "5–8 bands: strong DSCR 1.25, Strong margin 1.20");
pin(/survives = \(stressedDscr === null \|\| stressedDscr >= 1\.0\) && stressedCfMo >= 0;/, "1–4 LTR Fails: stressed DSCR < 1.0 or cash flow < 0");
pin(/dollarBar: 6000,/, "LTR $6,000/yr dollar bar");
pin(/g\.dscrOk && \(g\.dollarOk \|\| g\.cocOk\) && g\.cfPositive && survives/, "LTR strongest verdict gates");
pin(/const sArv = arv \* 0\.95;/, "BRRRR ARV −5%");
pin(/stressSurvives = \(stressedDscr === null \|\| stressedDscr >= 1\.0\) && sCapitalLeftPct <= 50;/, "BRRRR Fails: DSCR < 1.0 or > 50% left in");
pin(/stressedDscr >= rules\.mosStrong\) && sCapitalLeftPct <= 25/, "BRRRR Strong: ≤ 25% left in");
pin(/d >= hotDscr && rec >= 75 && cf > 0 && survives/, "BRRRR strongest verdict: DSCR 1.25, 75% recovered, CF > 0");
pin(/const hardFail = !coversDebt \|\| m\.refiLoan <= m\.acqPayoff \|\| m\.equityCreated <= 0;/, "BRRRR breaks conditions");
pin(/Risk floors \+ haircuts are FIXED nationwide constants \(not user-editable\)/, "haircuts are fixed, not user-editable");
ok(!/stress/i.test(str), "D STR engine has no stress test (pages say so)");
ok(/coc >= tgtCoc && capRate >= 6/.test(str), "D STR strongest verdict: CoC ≥ target and cap rate ≥ 6%");
ok(/downAmt\s+= price \* down \+ furnish;/.test(str), "D STR cash-on-cash basis = down payment + furnishing");
// No analyzer requires sign-in (pages say "No account needed to run an analysis").
for (const f of ["flip.js", "ltr.js", "brrr.js", "rental.js"]) ok(!/isSignedIn|getSession|requireAuth/.test(src("docs/src/js/" + f)), `D ${f} runs without sign-in`);

console.log("— §E compliance wording —");
const BANNED = /pre-?approv|approved for|guarantee|qualif(y|ies|ied) for|we lend|our loans|lowest rate|best rate|better rate|beat your lender|NMLS|licensed lender|lender-ready|risk-free|eliminate (the )?risk|safe investment|funding priority/i;
for (const p of PAGES) {
  const vis = visibleText(src(`docs/${p.slug}/index.html`));
  ok(vis.includes("Clear Path Capital is a broker, not a lender"), `E1 /${p.slug}/ states broker, not lender`);
  ok(/results are estimates/.test(vis) && /not an appraisal, a loan offer, or financial, tax or legal advice/.test(vis), `E2 /${p.slug}/ carries the estimate disclaimer`);
  ok(/business-purpose, non-owner-occupied/.test(vis), `E3 /${p.slug}/ says business-purpose, non-owner-occupied`);
  const m = vis.match(BANNED);
  ok(!m, `E4 /${p.slug}/ has no lending/approval/guarantee language${m ? ` (found "${m[0]}")` : ""}`);
  const cpc = hrefs(src(`docs/${p.slug}/index.html`)).filter((h) => /^https:\/\/clearpathcapfunding\.com/.test(h));
  ok(cpc.length >= 1 && cpc.every((h) => h === "https://clearpathcapfunding.com/?src=dealscreener"), `E5 /${p.slug}/ CPC links all carry ?src=dealscreener on the homepage (CPC reads src only there)`);
  ok(/free on every DealFit plan/.test(vis) && /not an application or a commitment from any lender/.test(vis), `E6 /${p.slug}/ funding path: free on every plan, not an application`);
}

console.log(`seo: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
