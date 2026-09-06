// ─── Wave A · A7 (2026-09-06): market-region change / lock copy states the law ──
// Owner/GPT ruling: describe the actual entitlement — a wait between changes to
// a used slot (starter 30 d / investor 14 d / pro none), the slot counts
// (2 / 4 / 6), and that an upgrade re-evaluates the current lock under the new
// tier — not a vague "additional changes" quota. App features only: the copy
// must never mention funding treatment. Source pins against main.js / index.html,
// cross-checked with the real tiers.js numbers so the words can never drift
// from the law they describe.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/marketcopy.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8');

let pass = 0, fail = 0;
const ok = (label, v) => { if (v) pass++; else { fail++; console.log('  FAIL: ' + label); } };

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const tiers = await import('../docs/src/js/tiers.js');

const mainSrc = src('docs/src/js/main.js');
const html = src('docs/index.html');
const block = mainSrc.slice(mainSrc.indexOf('if (isSlotLocked(slotIndex)) {'), mainSrc.indexOf('const confirmBtn2'));

// ── the law the copy must describe (real tiers.js) ───────────────────────────
const days = {}; const slots = {};
for (const t of ['starter', 'investor', 'pro']) { store.set('tier', t); if (t === 'starter') store.delete('tier'); days[t] = tiers.getSlotCooldownDays(); slots[t] = tiers.getUnlockedSlotCount(); }
ok('[LAW] cooldown starter 30 / investor 14 / pro 0', days.starter === 30 && days.investor === 14 && days.pro === 0);
ok('[LAW] slots starter 2 / investor 4 / pro 6', slots.starter === 2 && slots.investor === 4 && slots.pro === 6);

// ── starter change warning ───────────────────────────────────────────────────
const starterWarn = 'Changing this Market Region starts a 30-day wait before this slot can change again — your next change opens ${willLockUntil}. Investor shortens the wait to 14 days and gives you 4 region slots; Pro removes the wait and gives you 6. Upgrading re-checks this lock under your new plan. Continue?';
ok('[A7] starter change warning is the ruled copy', block.includes(starterWarn));
ok('[A7] starter copy names the 30-day wait from the law', starterWarn.includes(`${days.starter}-day wait`));
ok('[A7] starter copy names Investor\'s 14-day wait and 4 slots from the law', starterWarn.includes(`${days.investor} days`) && starterWarn.includes(`${slots.investor} region slots`));
ok('[A7] starter copy names Pro\'s no-wait and 6 slots from the law', /Pro removes the wait and gives you 6/.test(starterWarn) && slots.pro === 6);

// ── investor change warning ──────────────────────────────────────────────────
const investorWarn = 'Changing this Market Region starts a 14-day wait before this slot can change again — your next change opens ${willLockUntil}. Pro removes the wait and gives you 6 region slots. Upgrading re-checks this lock under your new plan. Continue?';
ok('[A7] investor change warning is the ruled copy', block.includes(investorWarn));
ok('[A7] investor copy names the 14-day wait and Pro\'s 6 slots', investorWarn.includes(`${days.investor}-day wait`) && investorWarn.includes(`${slots.pro} region slots`));

// ── locked toasts ────────────────────────────────────────────────────────────
// A9 moved both toasts into one shared helper (slotLockedToast) so the local
// check and the server-refusal path read the same lock date; pin the helper.
const toastFn = mainSrc.slice(mainSrc.indexOf('function slotLockedToast(slotIndex) {'), mainSrc.indexOf('function confirmMarketChange() {'));
ok('[A7] starter locked toast names the shorter Investor wait and Pro\'s removal', toastFn.includes('`This slot is locked until ${lockedUntil}. Investor shortens the wait to 14 days; Pro removes it.`'));
ok('[A7] investor locked toast names Pro\'s removal', toastFn.includes('`This slot is locked until ${lockedUntil}. Pro removes the wait.`'));
ok('[A7/A9] the locked branch and the server-refusal path both use the shared toast', /if \(isSlotLocked\(slotIndex\)\) \{\s*\n\s*slotLockedToast\(slotIndex\);/.test(mainSrc) && (mainSrc.match(/slotLockedToast\(slot(Index)?\)/g) || []).length >= 2);

// ── the upgrade sentence is true under the law (cooldown read at evaluation time) ──
const tiersSrc = src('docs/src/js/tiers.js');
ok('[LAW] isSlotLocked reads the cooldown from the CURRENT tier (so an upgrade re-checks a live lock)', /function isSlotLocked\(index\) \{\s*const days = getSlotCooldownDays\(\);/.test(tiersSrc));
ok('[LAW] the server does the same (set_user_market: cooldown from current_tier() at the next change)', /v_cooldown := case v_tier when 'pro' then 0 when 'investor' then 14 else 30 end;/.test(src('supabase/migrations/0003_phase1b_market_intel_and_user_markets.sql')));
ok('[A7] both warnings carry the upgrade re-check sentence', (block.match(/Upgrading re-checks this lock under your new plan\./g) || []).length === 2);

// ── what the copy must NOT say ───────────────────────────────────────────────
ok('[A7] no vague "additional changes" quota wording', !/additional (market )?changes/i.test(block));
ok('[A7] the old copy is gone', !/Changing a Market Region locks that slot for/.test(mainSrc) && !/Upgrade to \$\{tierLabel\} for faster access/.test(mainSrc));
ok('[COMPLIANCE] the copy sells app features only — no funding / loan / rate / approval words', !/funding|loan|rate|approv|lender|priority/i.test(block) && !/funding|loan|rate|approv|lender|priority/i.test(toastFn.replace(/\/\/[^\n]*/g, '')));
ok('[A7] index.html default text states a wait, not a stale hard-coded 30 days', /<p id="market-confirm-text">Changing this Market Region starts a wait before this slot can change again\. Continue\?<\/p>/.test(html));
ok('[PRESERVATION] the Pro replacement confirmation is untouched', /Replace \$\{label\}\? Choosing another region will replace this market slot\./.test(mainSrc));

console.log(`\nmarketcopy: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
