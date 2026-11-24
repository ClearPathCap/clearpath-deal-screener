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
ok(/Unlimited exports \+ shareable deal summaries/.test(app), 'P6 the Pro line pinned by the SEO suite (W4) is kept');
ok(/Analyze deals in 4 markets, not 2/.test(features) && /All 6 of your markets, fully unlocked/.test(features), 'P7 the market counts stay as before');
ok(/\$14<span class="tc-per">\/mo/.test(app) && /\$29<span class="tc-per">\/mo/.test(app), 'P8 prices unchanged ($14 / $29)');

// N — a blank deal name never stops the save with a browser alert.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const save = stripComments(pipe.slice(pipe.indexOf('export async function saveDeal('), pipe.indexOf('export function requestDelete(')));
ok(save.length > 0, 'N0 saveDeal located');
ok(!/alert\([^)]*name/i.test(save), 'N1 saveDeal has no browser alert about the deal name');
ok(!/refused-name/.test(save), 'N2 saveDeal never refuses a blank name');
ok(/const name\s+= document\.getElementById\(nameId\)\.value\.trim\(\) \|\| defaultDealName\(type, new Date\(\)\);/.test(save), 'N3 a blank name falls back to the default name');
ok(save.indexOf('defaultDealName(type') > save.indexOf("status: 'refused-result'"), 'N3b the default is chosen only after the result check (a refused save never touches the form)');
ok(!/\.value = defaultDealName/.test(save), 'N3c the default name is never written into the form field');
ok(/return \{ status: 'refused-name' \}/.test(pipe.slice(pipe.indexOf('export async function saveDealEdits('))), 'N4 editing an existing deal still refuses a blank name (inline message)');
{
  const m = pipe.match(/const DEAL_TYPE_LABEL = [^\n]+\nexport function defaultDealName[\s\S]*?\n}\n/);
  ok(!!m, 'N5 defaultDealName located');
  if (m) {
    const fn = new Function(m[0].replace('export function', 'function') + '\nreturn defaultDealName;')();
    const when = new Date(2026, 10, 24, 15, 7);
    ok(fn('flip', when) === 'Flip deal · Nov 24, 3:07 PM', 'N6 flip default name: ' + fn('flip', when));
    ok(fn('ltr', when).startsWith('Rental deal · '), 'N7 long-term rental label');
    ok(fn('rental', when).startsWith('Short-term rental deal · '), 'N8 STR label');
    ok(fn('brrr', when).startsWith('BRRRR deal · '), 'N9 BRRRR label');
    ok(fn('other', when) === 'Deal · Nov 24, 3:07 PM', 'N10 an unknown type falls back to "Deal": ' + fn('other', when));
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
ok((cp.match(/Clear Path Capital is a broker/g) || []).length >= 3, 'F2 the broker statements remain');
ok(!/\bapproved\b|pre-approv|guarantee(d)? (rate|terms|funding)/i.test(cp.replace(/not a loan offer, approval, or guarantee of terms/g, '')), 'F3 no approval or guarantee language added');

console.log(`commercialc1: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
