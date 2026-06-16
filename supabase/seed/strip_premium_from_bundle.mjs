// Removes the PREMIUM depth fields (analyst notes, regulatory, sources, confidence,
// STR-viability) from the client bundle markets.js — they now live server-side in
// market_premium and are served tier-gated via get_market_intel(). The FREE numbers
// (medianArv, dom, arvRule*, repair*, holdPct*, monthlyHold* getters, rev*, occ*,
// adr*, makeReady*) stay — the analyzers need them.
//
//   node supabase/seed/strip_premium_from_bundle.mjs
//
// Text/line filter (NOT parse-reserialize) so getters/closures/formatting survive.
// markets.js is git-tracked — `git checkout` restores it if anything looks wrong.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MARKETS = join(here, '..', '..', 'docs', 'src', 'js', 'markets.js');

const PREMIUM_KEYS = ['rehabNote', 'strViability', 'strRevLow', 'strRevHigh',
  'benchmarkNote', 'regulatoryNote', 'regulatoryRisk', 'confidence', 'sourceUrl'];
// Anchor at line start so a key name appearing INSIDE a string value is never matched.
const keyRe = new RegExp('^\\s*(' + PREMIUM_KEYS.join('|') + ')\\s*:');

const src = readFileSync(MARKETS, 'utf8');
let removed = 0;
const out = src.split('\n').filter(line => {
  if (keyRe.test(line)) { removed++; return false; }
  return true;
}).join('\n');
writeFileSync(MARKETS, out);
console.log(`Stripped ${removed} premium property lines from markets.js`);

// Verify: re-import the stripped module; free fields intact, premium gone, getters live.
const mod = await import('data:text/javascript,' + encodeURIComponent(readFileSync(MARKETS, 'utf8')));
const { FLIP_MARKETS, STR_MARKETS, ALL_MARKETS } = mod;
const flipVals = Object.values(FLIP_MARKETS);
const strVals = Object.values(STR_MARKETS);
const f = flipVals[0], s = strVals[0];
const check = {
  flipCount: flipVals.length, strCount: strVals.length, allMarketsCount: ALL_MARKETS.length,
  freeNumbersIntact: !!(f.medianArv && f.repairLow !== undefined && s.revLow !== undefined && s.occLow !== undefined),
  monthlyHoldGetterWorks: typeof f.monthlyHoldLow === 'number',
  premiumGone: PREMIUM_KEYS.every(k =>
    flipVals.every(m => m[k] === undefined) && strVals.every(m => m[k] === undefined)),
};
console.log(JSON.stringify(check, null, 2));
if (!check.freeNumbersIntact || !check.premiumGone || !check.monthlyHoldGetterWorks) {
  console.error('VERIFY FAILED — run `git checkout docs/src/js/markets.js` to restore.');
  process.exit(1);
}
console.log('OK — bundle stripped + verified.');
