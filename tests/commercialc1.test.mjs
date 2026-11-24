// ─── Commercial C1 — conversion accuracy and friction (local wave, 2026-11-24) ───
// Source-level pins plus one pure-function check. Behaviour of the default deal name inside
// saveDeal is exercised by wave-a1 B2 (re-pinned in the same commit).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/commercialc1.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

const app = src('docs/index.html');
const pipe = src('docs/src/js/pipeline.js');
const main = src('docs/src/js/main.js');
const cp = src('docs/src/js/clearpath.js');
const storage = src('docs/src/js/storage.js');

// P — plan copy matches what the plans actually include (pipeline capacity is the same on every tier).
ok(/export const PIPELINE_ALLOWANCE = 25;/.test(storage), 'P0 premise: one uniform pipeline allowance for every tier');
const features = (app.match(/<ul class="tc-features"[^>]*>[\s\S]*?<\/ul>/g) || []).join('\n');
ok(features.length > 0, 'P1 the paid-plan feature lists exist');
ok(!/unlimited pipeline|Unlimited everything|Never lose a deal/i.test(features), 'P2 no paid plan claims an unlimited or larger pipeline');
ok(!/pipeline|deal history/i.test(features), 'P3 no paid plan sells the pipeline or deal history (both are the same on every tier)');
ok(!/unlimited saves/i.test(app), 'P4 the structured-data offer no longer claims unlimited saves');
ok(/paid plans add more markets, market data, and shareable deal summaries/.test(app), 'P5 the structured-data offer names real paid features');
ok(!/unlimited/i.test(features), 'P6 no plan line says "unlimited" (nothing on any plan is metered differently by tier except markets)');
ok(/<li>Market intel for every market you track<\/li>/.test(features), 'P9 market intel is described per market (it lives in the Field Guide, not on saved deals)');
ok(/<li>Change a market region any time — no waiting period<\/li>/.test(features)
   && /if \(tier === 'pro'\) return 0;/.test(src('docs/src/js/tiers.js'))
   && /v_cooldown := case v_tier when 'pro' then 0 when 'investor' then 14 else 30 end;/.test(src('supabase/migrations/0003_phase1b_market_intel_and_user_markets.sql')),
   'P10 the Pro "no waiting period" line matches the client AND the server cooldown (pro 0 days)');
ok(/<li>Share any saved deal as a read-only link<\/li>/.test(features)
   && /getActiveTier\(\) === 'investor' \|\| getActiveTier\(\) === 'pro'/.test(pipe), 'P11 the Investor sharing line matches the Investor+ share gate');
for (const f of ['docs/index.html', 'docs/shared.html', 'docs/privacy.html', 'docs/terms.html']) {
  ok(!/unlimited (pipeline )?saves/i.test(src(f)), 'P12 no "unlimited saves" claim in ' + f + ' (the SEO pages are Organic Growth\'s and are fixed there)');
}
ok(/Analyze deals in 4 markets, not 2/.test(features) && /All 6 of your markets, fully unlocked/.test(features), 'P7 the market counts stay as before');
ok(/\$14<span class="tc-per">\/mo/.test(app) && /\$29<span class="tc-per">\/mo/.test(app), 'P8 prices unchanged ($14 / $29)');

// N — a blank deal name never stops the save with a browser alert.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const save = stripComments(pipe.slice(pipe.indexOf('export async function saveDeal('), pipe.indexOf('export function requestDelete(')));
ok(save.length > 0, 'N0 saveDeal located');
ok(!/alert\([^)]*name/i.test(save), 'N1 saveDeal has no browser alert about the deal name');
ok(!/refused-name/.test(save), 'N2 saveDeal never refuses a blank name');
ok(/const name = typedName\s*\|\| \(reviewing && reviewing\.type === type && reviewing\.name\)\s*\|\| defaultDealName\(type, new Date\(\)\);/.test(save),
   'N3 a blank name keeps a reviewed deal\'s saved name, else falls back to the default name');
ok(save.indexOf('defaultDealName(type') > save.indexOf("status: 'refused-result'"), 'N3b the default is chosen only after the result check (a refused save never touches the form)');
ok(!/\.value = defaultDealName/.test(save), 'N3c the default name is never written into the form field');
ok(/return \{ status: 'refused-name' \}/.test(pipe.slice(pipe.indexOf('export async function saveDealEdits('))), 'N4 editing an existing deal still refuses a blank name (inline message)');
{
  const m = pipe.match(/const DEAL_TYPE_LABEL = [^\n]+\nexport function defaultDealName[\s\S]*?\n}\n/);
  ok(!!m, 'N5 defaultDealName located');
  if (m) {
    const fn = new Function(m[0].replace('export function', 'function') + '\nreturn defaultDealName;')();
    const when = new Date(2026, 10, 24, 15, 7);
    ok(/^Flip deal · Nov 24, 3:07\sPM$/u.test(fn('flip', when)), 'N6 flip default name: ' + fn('flip', when));
    ok(fn('ltr', when).startsWith('Long-term rental deal · '), 'N7 long-term rental label');
    ok(fn('rental', when).startsWith('Short-term rental deal · '), 'N8 STR label');
    ok(fn('brrr', when).startsWith('BRRRR deal · '), 'N9 BRRRR label');
    ok(/^Deal · Nov 24, 3:07\sPM$/u.test(fn('other', when)), 'N10 an unknown type falls back to "Deal": ' + fn('other', when));
    ok(fn('flip', { toLocaleString() { throw new Error('x'); } }) === 'Flip deal', 'N11 a date failure still yields a name');
  }
}

// T — a public tool-page visit (/?tool=) lands on the analyzer, not the first-launch market picker.
const onbStart = main.indexOf('function initOnboarding()');
const onb = main.slice(onbStart, main.indexOf('openMarketPicker(0, true /* isFirstLaunch */);', onbStart) + 60);
ok(/if \(toolLink\) return;/.test(onb), 'T1 initOnboarding returns early on a tool-link visit');
ok(onb.indexOf('if (toolLink) return;') < onb.indexOf('openMarketPicker(0, true'), 'T2 the early return precedes the picker');
const decl = main.indexOf('const toolLink = consumeToolLink();');
const call = main.lastIndexOf('initOnboarding();');
ok(decl > 0 && call > decl, 'T3 toolLink is assigned before initOnboarding() runs (no temporal-dead-zone error)');
ok(/const TOOL_TARGETS = Object\.freeze\(\{\s*flip:[\s\S]*str:[\s\S]*ltr:[\s\S]*dscr:[\s\S]*brrrr:/.test(src('docs/src/js/toolLink.js')), 'T4 the tool-link contract (values owned with Organic Growth) is unchanged');

// F — the active funding button states the business-purpose scope next to the broker line.
ok(/Business-purpose, non-owner-occupied investment property only\. Clear Path Capital is a broker; final terms come from the lender\./.test(cp), 'F1 business-purpose line on the funding button');
ok((cp.match(/Clear Path Capital is a broker/g) || []).length >= 6, 'F2 the broker statements remain, and the flip/STR summaries gain one');
{
  const pipeBtn = cp.slice(cp.indexOf('pipeline-funding-btn'), cp.indexOf('export function handlePipelineFundingClick'));
  ok(/Business-purpose, non-owner-occupied investment property only\. Clear Path Capital is a broker; final terms come from the lender\./.test(pipeBtn),
     'F4 the pipeline funding button carries the same business-purpose and broker caption');
  const summaryEnds = cp.match(/'Estimate only — not a loan offer[^']*',\n\s*'Generated by DealFit — Clear Path Capital'/g) || [];
  ok(summaryEnds.length === 4 && summaryEnds.every(l => /Business-purpose, non-owner-occupied investment property only\./.test(l) && /Clear Path Capital is a broker\./.test(l)),
     'F5 all four clipboard summaries state business-purpose and broker (' + summaryEnds.length + ')');
}
ok(!/\bapproved\b|pre-approv|guarantee(d)? (rate|terms|funding)/i.test(cp.replace(/not a loan offer, approval, or guarantee of terms/g, '')), 'F3 no approval or guarantee language added');

console.log(`commercialc1: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
