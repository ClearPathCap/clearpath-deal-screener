// ─── Fix & Flip analyzer ──────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma, renderInputIssues, inputIsIncomplete, isMalformedCurrency } from './format.js';
import { FLIP_MARKETS, ALL_MARKETS } from './markets.js';
import { updateRepairRangesForMarket, repairEstimateSnapshot } from './repair.js';
import { maybeShowFundingButton } from './clearpath.js';
import { computeFlip, computeFlipStress, flipVerdict, mosLabel, validateInputs, flipProfitClass,
         flipNegotiationGuidance } from './finance.js';

// ─── Regional fallback defaults (Task 3) ──────────────────────────────────────
const FLIP_REGIONAL_DEFAULTS = {
  'Southeast':    { medianArv: 310000, arvRuleLow: 0.65, arvRuleHigh: 0.69, repairLow: 38, repairHigh: 82,  holdPctLow: 0.0055, holdPctHigh: 0.0082 },
  'South Central':{ medianArv: 285000, arvRuleLow: 0.65, arvRuleHigh: 0.69, repairLow: 38, repairHigh: 82,  holdPctLow: 0.0060, holdPctHigh: 0.0090 },
  'Midwest':      { medianArv: 240000, arvRuleLow: 0.67, arvRuleHigh: 0.71, repairLow: 33, repairHigh: 75,  holdPctLow: 0.0055, holdPctHigh: 0.0080 },
  'Mountain West':{ medianArv: 380000, arvRuleLow: 0.64, arvRuleHigh: 0.68, repairLow: 40, repairHigh: 88,  holdPctLow: 0.0058, holdPctHigh: 0.0088 },
  'Pacific':      { medianArv: 550000, arvRuleLow: 0.61, arvRuleHigh: 0.65, repairLow: 52, repairHigh: 115, holdPctLow: 0.0058, holdPctHigh: 0.0090 },
  'Northeast':    { medianArv: 310000, arvRuleLow: 0.64, arvRuleHigh: 0.68, repairLow: 42, repairHigh: 90,  holdPctLow: 0.0060, holdPctHigh: 0.0090 },
};
const FLIP_NATIONAL_DEFAULT = FLIP_REGIONAL_DEFAULTS['Southeast'];

// Exported (pre-push ruling): the Pipeline editor's legacy estimator adoption
// resolves a deal's saved market through THIS one canonical resolver — exact
// flip data, else regional fallback, else Southeast — never a second copy.
export function getFlipMarket(slug) {
  if (FLIP_MARKETS[slug]) return FLIP_MARKETS[slug];
  const entry  = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  return FLIP_REGIONAL_DEFAULTS[region] || FLIP_NATIONAL_DEFAULT;
}

// Derive monthly carry cost from market data
function flipCarry(m) {
  const r50 = v => Math.round(v / 50) * 50;
  const low  = r50(Math.max(900,  m.medianArv * (m.holdPctLow  || 0.006)));
  const high = r50(Math.max(1500, m.medianArv * (m.holdPctHigh || 0.009)));
  return Math.round((low + high) / 2 / 50) * 50;
}

let lastFlipResult = null;
// DF-P1 quick read provenance. `_presetText` is the exact text the last market
// preset produced for the hold cost and Min Profit Target: a field is labelled a
// market estimate only while it still holds that text (review M2 — a sticky
// "a preset ran once" flag mislabelled the HTML defaults after the market went
// away). `_adoptedTarget` is the target text "Use DealFit midpoint" wrote; it
// is dropped whenever the analyzer resets or a saved deal is reviewed.
let _presetText = { 'f-carry': null, 'f-target': null };
let _adoptedTarget = null;

export function getLastFlipResult() { return lastFlipResult; }
// Saved-deal review: entering a review invalidates the last result so an
// "Update Saved Deal" without a fresh Analyze is refused (never a stale result).
export function clearLastFlipResult() { lastFlipResult = null; _adoptedTarget = null; }

export function setFlipPreset(slug, el) {
  if (el) el.classList.add('active');
  const m      = getFlipMarket(slug);
  const carry  = flipCarry(m);
  const target = Math.max(10000, Math.round((m.medianArv || 300000) * 0.09 / 1000) * 1000);
  _presetText = { 'f-carry': carry.toLocaleString(), 'f-target': target.toLocaleString() };

  // Saved-deal review / user-edited law (2026-09-05): a hold or carry the user
  // typed — or a reviewed saved deal prefilled — is never overwritten by the
  // market preset. Untouched fields keep following the market as before.
  const holdEl = document.getElementById('f-hold');
  if (holdEl && !holdEl.dataset.userEdited) holdEl.value = 5;
  const carryEl = document.getElementById('f-carry');
  if (carryEl && !carryEl.dataset.userEdited) carryEl.value = carry.toLocaleString();

  // Task 3: only auto-update target if user hasn't manually edited it this session
  const targetEl = document.getElementById('f-target');
  if (targetEl && !targetEl.dataset.userEdited) {
    targetEl.value = target.toLocaleString();
  }

  // Task 2: update repair scope card ranges for this market
  updateRepairRangesForMarket(m);

  const e = document.getElementById('f-carry');
  if (e) e.dispatchEvent(new Event('input'));
  refreshFlipSummaries();
}

export function analyzeFlip() {
  const addr   = document.getElementById('f-addr').value.trim();
  const ask    = parseComma(document.getElementById('f-ask').value);
  const arv    = parseComma(document.getElementById('f-arv').value);
  const rep    = parseComma(document.getElementById('f-rep').value);
  const hold   = +document.getElementById('f-hold').value || 5;
  const cc1    = (+document.getElementById('f-cc1').value || 2) / 100;
  const cc2    = (+document.getElementById('f-cc2').value || 5) / 100;
  const carry  = parseComma(document.getElementById('f-carry').value) || 900;
  const target = parseComma(document.getElementById('f-target').value) || 40000;
  const sqft   = +document.getElementById('sqft').value || 0;
  const self   = document.getElementById('self-reno').checked;
  // Wave A · A4: optional property facts (handoff only). Blank stays unknown — no
  // default is ever assumed, stored or serialized; the flip math ignores both.
  const ptypeEl = document.getElementById('f-ptype');
  const ptype   = ptypeEl && ptypeEl.value ? String(ptypeEl.value).trim() : null;
  const unitsEl = document.getElementById('f-units');
  const units   = unitsEl && unitsEl.value !== '' && unitsEl.value != null ? +unitsEl.value : null;
  if (!ask || !arv) { return; } // validation handled by wrapper in main.js

  // Financing model (opt-in, estimates only). Blank loan = all-cash view: numbers
  // are unchanged and the metric is honestly labeled "Price / ARV" (the old code
  // mislabeled price-to-ARV as LTV). Enter a loan and we model true LTV/LTC,
  // interest-only carry + points, and leveraged cash-on-cash ROI.
  const loanRaw = (document.getElementById('f-loan')?.value || '').trim();
  const rate    = (+document.getElementById('f-rate')?.value   || 10) / 100;
  const points  = (+document.getElementById('f-points')?.value ||  3) / 100;
  const loan     = loanRaw === '' ? 0 : (parseComma(loanRaw) || 0);
  const financed = loan > 0;

  // B2: validate pre-compute — out-of-range inputs abort (no compute, no HOT, no funnel).
  // flip reads cc/rate/points as fractions, so multiply back to whole numbers for the check.
  // Numeric-input integrity: a half-typed number field blocks instead of a default.
  const incomplete = (id) => inputIsIncomplete(document.getElementById(id));
  const vErr = validateInputs('flip', {
    ask, rep, loan, price: ask,
    cc1: incomplete('f-cc1') ? NaN : cc1 * 100, cc2: incomplete('f-cc2') ? NaN : cc2 * 100,
    rate: incomplete('f-rate') ? NaN : rate * 100, points: incomplete('f-points') ? NaN : points * 100,
    hold: incomplete('f-hold') ? NaN : hold, sqft: incomplete('sqft') ? NaN : sqft,
    ...(units == null && !incomplete('f-units') ? {} : { units: incomplete('f-units') ? NaN : units }),   // A4: validated only when supplied
  });
  if (renderInputIssues('flip', vErr.errors, vErr.warnings)) {
    document.getElementById('flip-results').style.display = 'none';
    const fb = document.getElementById('flip-funding-btn'); if (fb) fb.innerHTML = '';
    return;
  }

  // UX wave: the base math is the canonical engine in finance.js — the same
  // function the stress test and the Pipeline editor run — so nothing here can
  // drift from a recomputed saved deal.
  const { buyCost, sellCost, holdCost, loanInt, loanFees, finCost,
          cashIn, totalIn, profit, roi, maxOffer, ltvVal, ltvLabel, ltc } =
    computeFlip({ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self });
  const ratePct  = (rate * 100).toFixed(2).replace(/\.?0+$/, '');
  const pointsPct = (points * 100).toFixed(2).replace(/\.?0+$/, '');

  // Verdict & Risk Framework: HOT needs a dollar floor (≥ max($50K, target)), an
  // ROI bar (≥15%), AND to survive a stress test (ARV −5%, rehab +10%, +1 month).
  const { stressedProfit, marginOfSafety } = computeFlipStress({
    ask, arv, rep, cc1, cc2, carry, hold, financed, loan, rate, points, target,
  });
  // Design wave: derived negotiation guidance around the same canonical
  // engine — powers the dynamic counter verdict, the guidance block by the
  // Min Profit Target, and the what-if detail. Educational; never overrides
  // the user's own target.
  const nego = flipNegotiationGuidance({ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self, target });
  const { cls, verdict, vsub } = flipVerdict({
    profit, roi, target, maxOffer, marginOfSafety, stressedProfit, self, ask, nego,
  });
  const mos = mosLabel(marginOfSafety);
  refreshFlipGuide(nego, target);

  document.getElementById('flip-verdict').className = 'verdict ' + cls;
  document.getElementById('fvtag').textContent   = cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  document.getElementById('fvlabel').textContent = verdict;
  document.getElementById('fvsub').textContent   = vsub + (cls === 'hot' && marginOfSafety === 'tight' ? ' Strong signal, thin cushion.' : '');

  // Track D → design wave: the verdict is explorable — a NON-MUTATING
  // negotiation plan (counter, walk-away, both scenarios). Offered whenever a
  // positive purchase price exists under the acquisition rule; the modal
  // itself explains the no-workable-price cases honestly.
  const whatifBtn = document.getElementById('fv-whatif');
  if (whatifBtn) {
    if (maxOffer > 0) {
      whatifBtn.style.display = '';
      whatifBtn.textContent = (nego && !nego.noWorkablePrice && nego.counter !== null && ask > nego.walkAway)
        ? 'Plan it: counter ' + fmt(nego.counter) + ' · walk above ' + fmt(nego.walkAway) + ' →'
        : 'Open your negotiation plan →';
    } else {
      whatifBtn.style.display = 'none';
    }
  }

  document.getElementById('flip-metrics').innerHTML = buildMetrics([
    // Track C: profit signal scales with the user's own Min Profit Target —
    // display law only, verdict math untouched.
    { label: 'Net Profit', val: fmt(profit),   cls: flipProfitClass(profit, target) },
    { label: '<span class="pro-only">ROI</span><span class="beginner-only">Cash-on-Cash ROI</span>', val: pct(roi), cls: cClass(roi, 15, 10) },
    { label: 'Margin of Safety', val: mos.label, cls: mos.cls },
    { label: 'Max Offer',  val: fmt(Math.max(0, maxOffer)),  cls: 'neutral' },
    { label: ltvLabel,     val: pct(ltvVal),    cls: financed ? cClass(75 - ltvVal, 15, 5) : 'neutral' },
  ]);

  document.getElementById('flip-breakdown').innerHTML = buildRows([
    { l: 'Purchase price',                                    v: fmt(ask) },
    { l: 'Repair costs' + (self ? ' (self-perform)' : ''),   v: fmt(rep) },
    { l: 'Buying costs (' + Math.round(cc1 * 100) + '%)',    v: fmt(buyCost) },
    { l: 'Carrying costs (' + hold + ' mo, non-loan)',        v: fmt(holdCost) },
    ...(financed ? [
      { l: 'Loan interest (' + hold + ' mo @ ' + ratePct + '%)', v: fmt(loanInt) },
      { l: 'Points (' + pointsPct + '%)',                       v: fmt(loanFees) },
    ] : []),
    { l: 'Selling costs (' + Math.round(cc2 * 100) + '%)',    v: fmt(sellCost) },
    ...(financed ? [{ l: 'LTC (loan ÷ cost)', v: (Math.round(ltc * 10) / 10) + '%' }] : []),
    // D-1 UX wave finding 7: this figure EXCLUDES selling costs (it is the cash
    // you are into the project before resale), while the Pipeline's total adds
    // selling costs back. The old labels ('Total cash (all-cash)' vs 'Total
    // all-in') read as a contradiction on the same deal; both are now named by
    // what they actually are. Formulas untouched.
    { l: financed ? 'Cash invested (before resale)' : 'Cash required before resale', v: fmt(cashIn) },
    { l: 'Net profit', v: fmt(profit), tot: true, color: 'var(--' + ({ good: 'accent', warn: 'warn', bad: 'danger' })[flipProfitClass(profit, target)] + ')' },
    { l: 'Stress-test profit (ARV −5%, rehab +10%, +1mo)', v: fmt(stressedProfit), color: stressedProfit >= 0 ? 'var(--accent)' : 'var(--danger)' },
  ]);

  // Pipeline-edit corrective (defect 1): serialize the repair PROVENANCE the
  // analyzer has always tracked in DOM state. 'estimator' iff the value on
  // screen is still the estimator's autofill (same law as select-on-focus).
  // The snapshot rides along whenever sqft allows one — for estimator-owned
  // deals it powers the editor's governed self↔hired swap; for manual deals it
  // powers an explicit "use estimator midpoint" without recomputation drift.
  const repFieldEl = document.getElementById('f-rep');
  const repOwnedByEstimator = !!(repFieldEl && repFieldEl.dataset.autoFilled === '1'
                                 && !repFieldEl.dataset.userEdited);

  lastFlipResult = {
    type: 'flip', addr, ask, arv, rep, hold,
    ptype, units,                 // A4: null when the user left them unknown (never SFR / 1)
    city: (document.getElementById('f-city')?.value || '').trim() || null,     // A1: structured, user-editable
    state: (document.getElementById('f-state')?.value || '').trim() || null,
    cc1: +document.getElementById('f-cc1').value,
    cc2: +document.getElementById('f-cc2').value,
    carry, target, sqft, self,
    repSource: repOwnedByEstimator ? 'estimator' : 'manual',
    repEstimate: repairEstimateSnapshot(sqft),
    loan, rate, points, financed, finCost, loanInt, loanFees, cashIn, ltc,
    profit, roi, ltv: ltvVal, ltvLabel, maxOffer, buyCost, sellCost, holdCost, totalIn,
    marginOfSafety, stressedProfit,
    verdict, cls,
    hot: cls === 'hot',
  };

  // DF-P1: preliminary quick read — the exact values this run used, each with
  // its source. Display only; nothing here feeds the verdict or the record.
  const fieldRaw = (id) => { const x = document.getElementById(id); return x ? String(x.value ?? '') : ''; };
  const fieldDefault = (id) => { const x = document.getElementById(id); return x && x.defaultValue != null ? String(x.defaultValue) : ''; };
  const flag = (id, k) => { const x = document.getElementById(id); return !!(x && x.dataset && x.dataset[k]); };
  const FL_IDS = ['f-hold', 'f-cc1', 'f-cc2', 'f-carry', 'f-target', 'f-rate', 'f-points'];
  renderFlipFirstLook(flipFirstLookModel({
    used: { hold, cc1: cc1 * 100, cc2: cc2 * 100, carry, target, rate: rate * 100, points: points * 100, loan, rep, self, financed },
    raw: Object.fromEntries(FL_IDS.map(id => [id, fieldRaw(id)])),
    defaults: Object.fromEntries(FL_IDS.map(id => [id, fieldDefault(id)])),
    userEdited: Object.fromEntries(FL_IDS.map(id => [id, flag(id, 'userEdited')])),
    // A saved-deal review prefill marks fields userEdited (to protect them from
    // presets) AND reviewPrefill; a real keystroke clears reviewPrefill.
    prefilled: Object.fromEntries(FL_IDS.concat(['f-loan', 'self-reno']).map(id => [id, flag(id, 'reviewPrefill')])),
    presetText: _presetText,
    adoptedTarget: _adoptedTarget,
    repSource: lastFlipResult.repSource,
    cls,
    addr, state: lastFlipResult.state, ptype,
  }));
  refreshFlipSummaries();

  const r = document.getElementById('flip-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastFlipResult);
}

// ─── DF-P1 mobile quick read ─────────────────────────────────────────────────
// Pure: which inputs behind a flip result were the user's own, and which were
// assumed. `used` holds the values analyzeFlip actually computed with (whole
// percents); `raw` the field text. A blank or zero field that the analyzer's
// fallback replaced is reported as the DealFit default it became — never as
// the user's entry. Changes no number and no verdict.
const FL_SRC = { entry: 'Your entry', adopted: 'DealFit suggestion you adopted', saved: 'From your saved deal', market: 'Market estimate', default: 'DealFit default', estimate: 'Planning estimate' };
// Not counted as assumptions: the user's own entry or adopted choice, and a
// saved deal's value (its origin is unknown — the lead asks the user to confirm it).
const FL_NOT_ASSUMED = new Set(['entry', 'adopted', 'saved']);
export function flipFirstLookModel({ used, raw = {}, defaults = {}, userEdited = {}, prefilled = {}, presetText = {}, adoptedTarget = null, repSource, cls, addr, state, ptype }) {
  const pctTxt = (v) => (Math.round(v * 100) / 100) + '%';
  const sourceOf = (id, { marketDriven = false } = {}) => {
    const r = String(raw[id] ?? '').trim();
    if (r === '' || !(parseComma(r) > 0)) return 'default';       // the analyzer's `||` fallback stood in
    if (id === 'f-target' && adoptedTarget != null && r === String(adoptedTarget)) return 'adopted';
    if (prefilled[id]) return 'saved';                              // review prefill: never claimed as typed
    if (userEdited[id]) return 'entry';
    if (marketDriven && presetText[id] != null && r === String(presetText[id])) return 'market';
    return r === String(defaults[id] ?? '') ? 'default' : 'entry';
  };
  const items = [];
  const add = (key, label, value, src) => items.push({ key, label, value, src, source: FL_SRC[src], assumed: !FL_NOT_ASSUMED.has(src) });
  if (repSource === 'estimator') add('rep', 'Repair budget', fmt(used.rep), 'estimate');
  add('target', 'Min Profit Target', fmt(used.target), sourceOf('f-target', { marketDriven: true }));
  add('hold', 'Hold period', used.hold + ' mo', sourceOf('f-hold'));
  add('carry', 'Monthly hold cost (excl. loan)', fmt(used.carry) + '/mo', sourceOf('f-carry', { marketDriven: true }));
  add('cc1', 'Buying costs', pctTxt(used.cc1), sourceOf('f-cc1'));
  add('cc2', 'Selling costs', pctTxt(used.cc2), sourceOf('f-cc2'));
  // Independent review L2: a saved deal's loan and self-renovating toggle read
  // "From your saved deal", like every other prefilled value. L3 (law §5): every
  // loan figure carries "(est.)".
  if (used.financed) {
    add('loan', 'Loan amount', fmt(used.loan) + ' (est.)', prefilled['f-loan'] ? 'saved' : 'entry');
    add('rate', 'Loan rate (interest-only)', pctTxt(used.rate) + ' (est.)', sourceOf('f-rate'));
    add('points', 'Points', pctTxt(used.points) + ' (est.)', sourceOf('f-points'));
  } else {
    add('fin', 'Financing', 'All cash — no loan cost', 'default');
  }
  if (used.self) add('self', 'Self-renovating labor', 'Yes — Max Offer uses 75% of ARV', prefilled['self-reno'] ? 'saved' : 'entry');
  const assumed = items.filter(i => i.assumed).length;
  const saved = items.filter(i => i.src === 'saved').length;
  const entries = items.filter(i => i.src === 'entry' || i.src === 'adopted').length;
  const parts = [];
  if (cls === 'hot' && assumed > 0) parts.push('This strong signal relies partly on assumed inputs — confirm them before relying on it.');
  // Re-verification N2: with no assumption, the lead names where the listed
  // values came from — the user's entries, the saved deal, or both — and never
  // calls a saved-deal value the user's own entry.
  const noneAssumed = saved === 0 ? 'Every input listed below is your own entry.'
    : entries > 0 ? 'No input listed below is assumed: each is either your own entry or a value from your saved deal.'
    : 'No input listed below is assumed: each comes from your saved deal.';
  parts.push(assumed > 0
    ? 'Preliminary: built from your numbers plus ' + assumed + ' assumed input' + (assumed === 1 ? '' : 's') + ' (marked below). Replace any assumption with your own figure and analyze again.'
    : noneAssumed + ' The result is still an estimate — verify ARV with comps and repairs with bids.');
  if (saved > 0) parts.push(saved + ' value' + (saved === 1 ? ' comes' : 's come') + ' from your saved deal — confirm ' + (saved === 1 ? 'it still applies' : 'they still apply') + '.');
  if (cls === 'pass') parts.push('Nothing required is missing: this verdict reflects the economics of the numbers shown, not missing information.');
  const missing = [];
  if (!String(addr || '').trim()) missing.push('property address');
  if (!String(state || '').trim()) missing.push('state');
  if (!String(ptype || '').trim()) missing.push('property type');
  const missingText = missing.length
    ? 'Not yet provided (does not change these numbers): ' + missing.join(', ') + '. You can add them under Property details; they travel with a saved deal and a funding hand-off.'
    : '';
  return { items, assumed, lead: parts.join(' '), missingText };
}

function renderFlipFirstLook(model) {
  const box = document.getElementById('flip-firstlook');
  if (!box) return;
  const lead = document.getElementById('fl-lead');
  if (lead) lead.textContent = model.lead;
  const list = document.getElementById('fl-list');
  if (list) list.innerHTML = model.items.map(i =>
    '<li><span class="fl-k">' + escapeText(i.label) + '<span class="fl-src' + (i.assumed ? ' assumed' : '') + '">' + escapeText(i.source) + '</span></span>' +
    '<span class="fl-v">' + escapeText(i.value) + '</span></li>').join('');
  const miss = document.getElementById('fl-missing');
  if (miss) miss.textContent = model.missingText;
  box.style.display = '';
}
function escapeText(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Pure: the one-line summary each collapsed section shows, from field text.
// Mirrors the analyzer's own fallbacks so a collapsed line never shows a value
// the analysis would not use.
export function flipSectionSummaries(v) {
  const num = (s, d) => { const n = parseComma(String(s ?? '')); return n > 0 ? n : d; };
  // Independent review L1: a half-typed number field (`validity.badInput`, e.g.
  // "5e") reads as '' in the DOM; the summary must say it needs a number, never
  // show the fallback Analyze would refuse to use.
  const bad = v.badInput || {};
  const sqft = bad.sqft ? 0 : num(v.sqft, 0);
  // A malformed dollar entry blocks Analyze, so the summary must not present
  // a parse of it ("12a" → $12) as a valid amount (browser check finding 1).
  const loanBad = isMalformedCurrency(String(v.loan ?? ''));
  const carryBad = isMalformedCurrency(String(v.carry ?? ''));
  const loan = loanBad || String(v.loan ?? '').trim() === '' ? 0 : (parseComma(v.loan) || 0);
  const street = String(v.addr || '').split(',')[0].trim();
  const st = String(v.state || '').trim().toUpperCase();
  const part = (key, d, txt, badTxt) => bad[key] ? badTxt : txt(num(v[key], d));
  return {
    repair: (v.self ? 'Self-renovating labor' : 'Hired labor')
      + (bad.sqft ? ' · square footage needs a number'
        : sqft ? ' · ' + sqft.toLocaleString('en-US') + ' sf' + (v.tier ? ' · ' + v.tier + ' estimate' : '') : ''),
    fin: loanBad ? 'Loan amount needs a valid dollar amount'
      : loan > 0
      ? fmt(loan) + ' loan · ' + part('rate', 10, n => n + '%', 'rate needs a number') + ' · '
        + part('points', 3, n => n + ' pts', 'points need a number') + ' (est.)'
      : 'All-cash view — no loan cost modeled',
    costs: part('hold', 5, n => n + ' mo hold', 'hold needs a number') + ' · '
      + (carryBad ? 'monthly cost needs a valid amount' : fmt(num(v.carry, 900)) + '/mo')
      + ' · ' + part('cc1', 2, n => 'buy ' + n + '%', 'buy % needs a number')
      + ' · ' + part('cc2', 5, n => 'sell ' + n + '%', 'sell % needs a number'),
    prop: street ? street + (st ? ', ' + st : '') : 'Address not entered',
  };
}

export function refreshFlipSummaries() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  const val = (id) => { const x = document.getElementById(id); return x ? x.value : ''; };
  const badIn = (id) => inputIsIncomplete(document.getElementById(id));
  const s = flipSectionSummaries({
    badInput: { sqft: badIn('sqft'), rate: badIn('f-rate'), points: badIn('f-points'), hold: badIn('f-hold'), cc1: badIn('f-cc1'), cc2: badIn('f-cc2') },
    self: !!document.getElementById('self-reno')?.checked, sqft: val('sqft'),
    loan: val('f-loan'), rate: val('f-rate'), points: val('f-points'),
    hold: val('f-hold'), carry: val('f-carry'), cc1: val('f-cc1'), cc2: val('f-cc2'),
    addr: val('f-addr'), state: val('f-state'),
    tier: (document.querySelector && document.querySelector('#page-flip .repair-tiers .tier.active .tier-name')?.textContent) || '',
  });
  for (const [k, text] of Object.entries(s)) {
    const x = document.getElementById('flip-sum-' + k);
    if (x) x.textContent = text;
  }
}

// The route from the quick read to the complete analysis: open every
// collapsed section and bring the first one into view.
export function openFlipDetails() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  const sections = [...document.querySelectorAll('#page-flip details.more-section')];
  sections.forEach(d => { d.open = true; });
  const first = sections[0];
  if (first) {
    const reduced = typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof first.scrollIntoView === 'function') first.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    const sum = first.querySelector && first.querySelector('summary');
    if (sum && typeof sum.focus === 'function') { try { sum.focus({ preventScroll: true }); } catch { sum.focus(); } }
  }
}

export function resetFlip() {
  { const fl = document.getElementById('flip-firstlook'); if (fl) fl.style.display = 'none'; }
  // DF-P1 (browser check finding 3): the suggested-profit box describes the
  // last analysis; after a reset it would describe a deal no longer on the
  // form and push the primary Analyze below the first phone screen.
  { const g = document.getElementById('flip-guide'); if (g) g.style.display = 'none'; _lastGuide = null; }
  _adoptedTarget = null;
  document.getElementById('flip-results').style.display = 'none';
  document.getElementById('flip-notes').value = '';
  document.getElementById('flip-funding-btn').innerHTML = '';
  lastFlipResult = null;
}

// ─── Design wave · DealFit profit guidance block (by the Min Profit Target) ──
// EDUCATIONAL only: shows DealFit's suggested project-profit range for this
// project's size, rehab exposure, hold and owner labor — in the SAME unit as
// the user's target. It never overrides the target; the user can voluntarily
// adopt the midpoint, which simply sets the field and re-runs the canonical
// analysis. Hidden until a valid analysis produces guidance (§G4).
let _lastGuide = null;

function guideBasisLine(g) {
  const arvK = g.arv >= 1000 ? '$' + Math.round(g.arv / 1000) + 'K' : fmt(g.arv);
  return 'Based on: ' + arvK + ' ARV · ' + Math.round(g.rehabRatio * 100) + '% rehab intensity · '
    + g.hold + '-month hold' + (g.laborAllowance > 0 ? ' · self-renovating' : '');
}

function updateGuideSoftState() {
  const soft = document.getElementById('fg-soft');
  if (!soft || !_lastGuide) return;
  const t = parseComma(document.getElementById('f-target')?.value || '') || 0;
  soft.style.display = (t > 0 && t < _lastGuide.low) ? '' : 'none';
}

function refreshFlipGuide(nego) {
  const box = document.getElementById('flip-guide');
  if (!box) return;
  const g = nego && nego.guidance;
  if (!g) { box.style.display = 'none'; _lastGuide = null; return; }
  _lastGuide = g;
  box.style.display = '';
  document.getElementById('fg-range').textContent = fmt(g.low) + '–' + fmt(g.high) + ' (est.)';
  const labor = document.getElementById('fg-labor');
  if (labor) {
    labor.style.display = g.laborAllowance > 0 ? '' : 'none';
    if (g.laborAllowance > 0) labor.textContent =
      'Includes about ' + fmt(Math.round(g.laborAllowance)) + ' of owner-labor allowance (est.)';
  }
  const basis = document.getElementById('fg-basis');
  if (basis) basis.textContent = guideBasisLine(g);
  const adopt = document.getElementById('fg-adopt');
  if (adopt) adopt.textContent = 'Use DealFit midpoint: ' + fmt(g.mid);
  updateGuideSoftState();
}

// Voluntary adoption (§E): the midpoint becomes the user's new Min Profit
// Target and the normal canonical recalculation follows. Nothing else changes.
export function adoptDealFitTarget() {
  if (!_lastGuide) return;
  const t = document.getElementById('f-target');
  if (!t) return;
  t.value = _lastGuide.mid.toLocaleString();
  _adoptedTarget = t.value;          // DF-P1: the quick read names this the user's adopted DealFit suggestion
  analyzeFlip();
}

if (typeof document !== 'undefined' && document.getElementById) {
  const t = document.getElementById('f-target');
  if (t && t.addEventListener) t.addEventListener('input', updateGuideSoftState);
  const a = document.getElementById('fg-adopt');
  if (a && a.addEventListener) a.addEventListener('click', adoptDealFitTarget);
  // DF-P1: keep each collapsed section's summary line current as the user edits.
  const page = document.getElementById('page-flip');
  if (page && page.addEventListener) {
    page.addEventListener('input', refreshFlipSummaries);
    page.addEventListener('change', refreshFlipSummaries);
    page.addEventListener('click', refreshFlipSummaries);   // repair-tier cards change on click only
  }
  refreshFlipSummaries();
}
