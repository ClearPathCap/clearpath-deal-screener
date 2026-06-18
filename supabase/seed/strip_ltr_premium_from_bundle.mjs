// Strips the leaked PREMIUM LTR fields (ltrNote = analyst note, sourceUrl = data
// source) from the client bundle's LTR_MARKETS (SPEC_LTR §5). These are inline on
// single-line entries, so the line-anchored strip_premium_from_bundle.mjs misses
// them — this does a scoped, escape-safe inline removal limited to the LTR_MARKETS
// block (never touches FLIP/STR rows), then verifies by re-importing.
//
//   node supabase/seed/strip_ltr_premium_from_bundle.mjs
//
// markets.js is git-tracked — `git checkout docs/src/js/markets.js` restores it.
// NOTE: server-side seeding of these notes into market_premium / get_market_intel
// (so Pro/Investor still SEE them) is a separate follow-up; this only closes the leak.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MARKETS = join(here, '..', '..', 'docs', 'src', 'js', 'markets.js');

const src = readFileSync(MARKETS, 'utf8');
const lines = src.split('\n');

// Isolate the LTR_MARKETS block: from its declaration to the next top-level export.
const startIdx = lines.findIndex(l => l.includes('export const LTR_MARKETS'));
let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (/^export const /.test(lines[i])) { endIdx = i; break; }
}
if (startIdx < 0 || endIdx < 0) {
  console.error('LTR_MARKETS block not found'); process.exit(1);
}

// Remove inline `, ltrNote: '...'` / `, sourceUrl: '...'` — single-quoted values,
// escape-safe (handles \' inside the string). The optional leading comma keeps the
// object well-formed; a following comma stays as the next separator.
const keyRe = /\s*,?\s*(?:ltrNote|sourceUrl)\s*:\s*'(?:[^'\\]|\\.)*'/g;
let removed = 0;
for (let i = startIdx; i < endIdx; i++) {
  lines[i] = lines[i].replace(keyRe, () => { removed++; return ''; });
}
writeFileSync(MARKETS, lines.join('\n'));
console.log(`Removed ${removed} inline ltrNote/sourceUrl premium values from LTR_MARKETS.`);

// Verify: re-import the stripped module; premium gone, free numbers intact.
const mod = await import('data:text/javascript,' + encodeURIComponent(readFileSync(MARKETS, 'utf8')));
const vals = Object.values(mod.LTR_MARKETS);
const leak = vals.some(m => m.ltrNote !== undefined || m.sourceUrl !== undefined);
const freeIntact = vals.every(m => m.rent2br !== undefined && m.vacancyRate !== undefined);
const flipStrIntact = Object.keys(mod.FLIP_MARKETS).length > 0 && Object.keys(mod.STR_MARKETS).length > 0;
console.log(JSON.stringify({ ltrCount: vals.length, premiumGone: !leak, freeNumbersIntact: freeIntact, flipStrIntact }, null, 2));
if (leak || !freeIntact || !flipStrIntact) {
  console.error('VERIFY FAILED — run `git checkout docs/src/js/markets.js` to restore.');
  process.exit(1);
}
console.log('OK — LTR premium (ltrNote/sourceUrl) stripped + verified.');
