// Wave 5 · tier/funding law + dev-bypass closure + keepalive contract pins.
// Run: node tests/tierlaw.test.mjs
//
// Sections:
//  §A [DEFECT-CLOSING · SR-1] no rendered surface sells funding priority,
//     queue position, dedicated-broker access, or better lender treatment as a
//     paid benefit. Proven FAILING at baseline 20a74620 (the Guide ladder,
//     investor upgrade modal, and investor CTA card all carried the claims).
//  §B [DEFECT-CLOSING · SR-3/C-2] no tier-mutating dev mode ships: no ?dev=1,
//     no window-exposed subscription setTier, no setDevTier, no dev tier panel,
//     no dev-gated suppression of entitlement sync. Proven FAILING at baseline.
//  §C [DEFECT-CLOSING · SR-4] the unfulfillable "email you when it launches"
//     promise and the orphaned upgradeInterest write are gone; cloud-sync
//     promises are gone. Proven FAILING at baseline.
//  §D [DEFECT-CLOSING · matrix §18-1] pipeline capacity is a UNIFORM allowance,
//     not a tier differentiator. Proven FAILING at baseline (starter-only cap).
//  §E [PRESERVATION] keepalive contract: the workflow bytes still target
//     /rest/v1/entitlements and migration 0008 does not drop/rename the
//     legacy table or touch its RLS. Green at baseline AND after Wave 5.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

const mainJs  = src("docs/src/js/main.js");
const tiersJs = src("docs/src/js/tiers.js");
const authJs  = src("docs/src/js/auth.js");
const pipeJs  = src("docs/src/js/pipeline.js");
const html    = src("docs/index.html");
const allShipped = [mainJs, tiersJs, authJs, pipeJs, html,
  src("docs/src/js/clearpath.js"), src("docs/src/js/funding.js"),
  src("docs/src/js/share.js"), src("docs/src/js/storage.js")].join("\n<<<FILE>>>\n");

// ── §A · SR-1: prohibited funding-priority claims (scope lock §4 list + equivalents)
const PROHIBITED = [
  /priority review/i,
  /dedicated broker/i,
  /dedicated lender/i,
  /priority submission/i,
  /better (loan|lender) access/i,
  /best terms/i,
  /faster (cpc )?review/i,
  /first look/i,
  /front of the queue/i,
  /pre-reviews? your file/i,
  /funding priority/i,
  /highest[- ]priority funding/i,
  /priority funding/i,
];
for (const re of PROHIBITED) {
  ok(`[DEFECT-CLOSING] no shipped surface matches ${re}`, !re.test(allShipped));
}
// Generic proximity sweep: "priority" near funding/review/lender/broker/submit.
const prox = allShipped.match(/[^\n]*priority[^\n]*/gi) || [];
const badProx = prox.filter(l => /fund|review|lender|broker|submi|queue/i.test(l));
ok("[DEFECT-CLOSING] no 'priority' line touches funding/review/lender/broker/queue", badProx.length === 0);
// The corrected ladder exists and states tier-uniform funding treatment.
ok("[DEFECT-CLOSING] corrected 'How Funding Works' section exists", /How Funding Works</.test(mainJs));
ok("[DEFECT-CLOSING] ladder states funding works the same on every tier",
   /works the same on every tier/i.test(mainJs));
// Compliance-supportive line survives.
ok("[PRESERVATION] 'funding stays free on every tier' subhead survives",
   /funding stays free on every tier/i.test(allShipped));

// ── §B · SR-3/C-2: no tier-mutating dev mode in the production bundle
ok("[DEFECT-CLOSING] ?dev=1 recognition removed from tiers.js", !/[?&']dev'?\s*\)|get\('dev'\)/.test(tiersJs));
ok("[DEFECT-CLOSING] setDevTier removed from shipped code", !/setDevTier/.test(allShipped));
ok("[DEFECT-CLOSING] no window-exposed subscription setTier",
   !/setTier\(name/.test(mainJs) && !/setDevTier\(name\)/.test(mainJs));
ok("[DEFECT-CLOSING] dev tier switcher modal removed from index.html", !/modal-dev/.test(html));
ok("[DEFECT-CLOSING] exitDevMode removed", !/exitDevMode/.test(allShipped));
ok("[DEFECT-CLOSING] dev unlock code removed from client", !/CPC-DEV-/.test(allShipped));
ok("[DEFECT-CLOSING] devModeVisible no longer exists (nothing left to reveal)",
   !/devModeVisible/.test(allShipped));
ok("[DEFECT-CLOSING] entitlement sync is unconditional in auth.js",
   !/devModeVisible\(\)/.test(authJs) && /await syncEntitlement\(\);/.test(authJs));
ok("[DEFECT-CLOSING] no cpcDevUnlock flag anywhere in shipped code", !/cpcDevUnlock/.test(allShipped));

// ── §C · SR-4: no unfulfillable promises
ok("[DEFECT-CLOSING] upgradeInterest localStorage write removed", !/upgradeInterest/.test(allShipped));
ok("[DEFECT-CLOSING] 'email you when ... launches' promise removed",
   !/ll email you when/i.test(allShipped));
ok("[DEFECT-CLOSING] cross-device cloud sync promise removed",
   !/cloud sync/i.test(allShipped));
// The upgrade CTAs now start a real checkout through the trusted server path.
ok("[DEFECT-CLOSING] upgrade buttons call startCheckout", /startCheckout\('investor'\)/.test(html) && /startCheckout\('pro'\)/.test(html));
ok("[DEFECT-CLOSING] checkout goes through supabase.functions.invoke", /functions\.invoke\('checkout'/.test(mainJs));
ok("[DEFECT-CLOSING] refused gate renders a not-open state, no fake entitlement",
   /open yet/i.test(mainJs) && /status === 403/.test(mainJs));
// The success redirect only TRIGGERS reconcile + sync — never entitles by itself.
ok("[DEFECT-CLOSING] success return invokes reconcile then syncEntitlement",
   /get\('checkout'\)/.test(mainJs) && /functions\.invoke\('reconcile'/.test(mainJs)
   && /syncEntitlement\(\)/.test(mainJs));
ok("[PRESERVATION] no client code writes localStorage.tier outside setCachedTier",
   !/localStorage\.setItem\('tier'/.test(mainJs) && /localStorage\.setItem\('tier'/.test(tiersJs));

// ── §D · uniform pipeline allowance (matrix §18-1: capacity is not sold)
ok("[DEFECT-CLOSING] FREE_DEAL_CAP starter-only vocabulary is gone", !/FREE_DEAL_CAP/.test(allShipped));
ok("[DEFECT-CLOSING] uniform PIPELINE_ALLOWANCE exists in storage.js",
   /PIPELINE_ALLOWANCE\s*=\s*25/.test(src("docs/src/js/storage.js")));
ok("[DEFECT-CLOSING] pipeline save gate is tier-blind (no tier check in the cap gate)",
   !/tier !== 'investor' && tier !== 'pro'/.test(pipeJs));
ok("[PRESERVATION] Share stays investor/pro-gated (accepted Class 2)",
   /getActiveTier\(\) === 'investor' \|\| getActiveTier\(\) === 'pro'/.test(pipeJs));

// ── §E · keepalive contract preservation (C-3)
const workflow = src(".github/workflows/supabase-keepalive.yml");
ok("[PRESERVATION] keepalive still targets /rest/v1/entitlements?select=count",
   /\/rest\/v1\/entitlements\?select=count/.test(workflow));
const mig8 = src("supabase/migrations/0008_wave5_entitlement_grants.sql");
ok("[PRESERVATION] 0008 never drops the entitlements table", !/drop\s+table[^;]*\bentitlements\b/i.test(mig8));
ok("[PRESERVATION] 0008 never renames the entitlements table", !/alter\s+table[^;]*\bentitlements\b[^;]*rename/i.test(mig8));
ok("[PRESERVATION] 0008 never alters entitlements RLS/policies/grants",
   !/((alter|create|drop)\s+policy[^;]*\bon\s+public\.entitlements\b)|revoke[^;]*\bon\s+(table\s+)?public\.entitlements\b/i.test(mig8));

// ── §F · [DEFECT-CLOSING] ratified pricing law: Investor $14/mo, Pro $29/mo,
//    monthly ONLY. Proven FAILING pre-fix at 1d9ba5b2 (modal carried $17/mo
//    Investor plus $149/yr and $249/yr annual offers with savings claims —
//    unauthorized commercial terms; owner ratification 8d99dc18 + Amendment 1).
ok("[DEFECT-CLOSING] Investor card shows governed $14/mo",
   /class="tc-price">\$14<span class="tc-per">\/mo<\/span>/.test(html));
ok("[DEFECT-CLOSING] Pro card shows governed $29/mo",
   /class="tc-price">\$29<span class="tc-per">\/mo<\/span>/.test(html));
ok("[DEFECT-CLOSING] no $17 Investor offer survives anywhere shipped", !/\$17\b/.test(allShipped));
ok("[DEFECT-CLOSING] no $149 annual offer survives anywhere shipped", !/\$149\b/.test(allShipped));
ok("[DEFECT-CLOSING] no $249 annual offer survives anywhere shipped", !/\$249\b/.test(allShipped));
ok("[DEFECT-CLOSING] no yearly-subscription price copy survives (\"$N/yr\" offer shape)",
   !/\$\d+\s*\/\s*yr/.test(allShipped));
ok("[DEFECT-CLOSING] no annual-savings claim survives", !/save \d+%/i.test(allShipped));
ok("[DEFECT-CLOSING] tc-annual element is gone from the modal", !/tc-annual/.test(html));
ok("[PRESERVATION] checkout still offers exactly the two abstract monthly tiers",
   /startCheckout\('investor'\)/.test(html) && /startCheckout\('pro'\)/.test(html)
   && !/startCheckout\('(?!investor'|pro')/.test(html));

// ── §G · [K-4B] legal surface: pages exist, are linked, and the stale
//    local-only README privacy claim is gone. Proven FAILING before K-4B
//    (neither page existed and no legal link shipped).
const termsHtml   = src("docs/terms.html");
const privacyHtml = src("docs/privacy.html");
ok("[K-4B] docs/terms.html exists and is a DealFit page",
   /<title>Terms of Service — DealFit/.test(termsHtml) && /styles\.css/.test(termsHtml));
ok("[K-4B] docs/privacy.html exists and is a DealFit page",
   /<title>Privacy Policy — DealFit/.test(privacyHtml) && /styles\.css/.test(privacyHtml));
ok("[K-4B] both documents carry the governed effective date",
   /Effective Date: August 26, 2026/.test(termsHtml) && /Effective Date: August 26, 2026/.test(privacyHtml));
ok("[K-4B] the app links to Terms at its canonical path", /href="terms\.html"/.test(html));
ok("[K-4B] the app links to Privacy at its canonical path", /href="privacy\.html"/.test(html));
ok("[K-4B] the legal links live in a single quiet footer, not the analyzer body",
   (html.match(/class="legal-footer"/g) || []).length === 1);
ok("[K-4B] each document offers a return path to DealFit and to the other document",
   /href="\.\/"/.test(termsHtml) && /href="privacy\.html"/.test(termsHtml)
   && /href="\.\/"/.test(privacyHtml) && /href="terms\.html"/.test(privacyHtml));
// Mechanism check, not a word check: the documents legitimately DISCUSS
// analytics in prose, so assert on script tags and external hosts instead.
const legalHosts = [...new Set(
  ((termsHtml + privacyHtml).match(/https?:\/\/[a-z0-9.-]+/gi) || [])
    .map(u => u.replace(/^https?:\/\//i, '').toLowerCase()))];
ok("[K-4B] legal pages ship no script tag and no host beyond the app's existing font CDN",
   !/<script/i.test(termsHtml) && !/<script/i.test(privacyHtml)
   && legalHosts.every(h => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com'));
const readme = src("README.md");
ok("[K-4B] the stale local-only privacy claim is gone from README",
   !/stored locally on your device/i.test(readme) && !/Nothing is sent to any server/i.test(readme));
ok("[K-4B] README privacy section is architecture-accurate",
   /Supabase/.test(readme) && /Stripe/.test(readme) && /browser-local/.test(readme));
// [PRESERVATION] the legal work changed no commercial surface.
ok("[PRESERVATION] Starter purchase CTAs and governed prices are untouched",
   /startCheckout\('investor'\)/.test(html) && /startCheckout\('pro'\)/.test(html)
   && /class="tc-price">\$14<span class="tc-per">\/mo<\/span>/.test(html)
   && /class="tc-price">\$29<span class="tc-per">\/mo<\/span>/.test(html));
ok("[PRESERVATION] no payment or consent control was added to the app shell",
   !/consent_collection/.test(html) && !/type="checkbox"[^>]*agree/i.test(html));

console.log(`\ntierlaw: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Tier/funding law holds ✓");
