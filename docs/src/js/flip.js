// ─── Fix & Flip analyzer ──────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma, renderInputIssues } from './format.js';
import { FLIP_MARKETS, ALL_MARKETS } from './markets.js';
import { updateRepairRangesForMarket } from './repair.js';
import { maybeShowFundingButton } from './clearpath.js';
import { computeFlip, computeFlipStress, flipVerdict, mosLabel, validateInputs } from './finance.js';

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

function getFlipMarket(slug) {
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

export function getLastFlipResult() { return lastFlipResult; }

export function setFlipPreset(slug, el) {
  if (el) el.classList.add('active');
  const m      = getFlipMarket(slug);
  const carry  = flipCarry(m);
  const target = Math.max(10000, Math.round((m.medianArv || 300000) * 0.09 / 1000) * 1000);

  document.getElementById('f-hold').value  = 5;
  document.getElementById('f-carry').value = carry.toLocaleString();

  // Task 3: only auto-update target if user hasn't manually edited it this session
  const targetEl = document.getElementById('f-target');
  if (targetEl && !targetEl.dataset.userEdited) {
    targetEl.value = target.toLocaleString();
  }

  // Task 2: update repair scope card ranges for this market
  updateRepairRangesForMarket(m);

  const e = document.getElementById('f-carry');
  if (e) e.dispatchEvent(new Event('input'));
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
  const vErr = validateInputs('flip', {
    ask, rep, loan, price: ask,
    cc1: cc1 * 100, cc2: cc2 * 100, rate: rate * 100, points: points * 100,
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
  const { cls, verdict, vsub } = flipVerdict({
    profit, roi, target, maxOffer, marginOfSafety, stressedProfit, self,
  });
  const mos = mosLabel(marginOfSafety);

  document.getElementById('flip-verdict').className = 'verdict ' + cls;
  document.getElementById('fvtag').textContent   = cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  document.getElementById('fvlabel').textContent = verdict;
  document.getElementById('fvsub').textContent   = vsub + (cls === 'hot' && marginOfSafety === 'tight' ? ' Strong signal, thin cushion.' : '');

  document.getElementById('flip-metrics').innerHTML = buildMetrics([
    { label: 'Net Profit', val: fmt(profit),   cls: cls === 'hot' ? 'good' : cls === 'warm' ? 'warn' : 'bad' },
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
    { l: 'Net profit', v: fmt(profit), tot: true, color: profit >= 0 ? 'var(--accent)' : 'var(--danger)' },
    { l: 'Stress-test profit (ARV −5%, rehab +10%, +1mo)', v: fmt(stressedProfit), color: stressedProfit >= 0 ? 'var(--accent)' : 'var(--danger)' },
  ]);

  lastFlipResult = {
    type: 'flip', addr, ask, arv, rep, hold,
    cc1: +document.getElementById('f-cc1').value,
    cc2: +document.getElementById('f-cc2').value,
    carry, target, sqft, self,
    loan, rate, points, financed, finCost, loanInt, loanFees, cashIn, ltc,
    profit, roi, ltv: ltvVal, ltvLabel, maxOffer, buyCost, sellCost, holdCost, totalIn,
    marginOfSafety, stressedProfit,
    verdict, cls,
    hot: cls === 'hot',
  };

  const r = document.getElementById('flip-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastFlipResult);
}

export function resetFlip() {
  document.getElementById('flip-results').style.display = 'none';
  document.getElementById('flip-notes').value = '';
  document.getElementById('flip-funding-btn').innerHTML = '';
  lastFlipResult = null;
}
