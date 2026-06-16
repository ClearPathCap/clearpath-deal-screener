// ─── Fix & Flip analyzer ──────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma } from './format.js';
import { FLIP_MARKETS, ALL_MARKETS } from './markets.js';
import { updateRepairRangesForMarket } from './repair.js';
import { maybeShowFundingButton } from './clearpath.js';

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

  const cost     = ask + rep;
  const buyCost  = ask * cc1;
  const sellCost = arv * cc2;
  const holdCost = carry * hold;                              // non-loan holding only
  const loanInt  = financed ? loan * (rate / 12) * hold : 0;  // interest-only carry
  const loanFees = financed ? loan * points : 0;              // origination + broker points
  const finCost  = loanInt + loanFees;

  const cashIn   = financed ? (cost - loan) + buyCost + holdCost + finCost
                            : cost + buyCost + holdCost;       // investment basis
  const totalIn  = cost + buyCost + holdCost + finCost;        // all-in (excl. sale costs)
  const profit   = arv - sellCost - cost - buyCost - holdCost - finCost;
  const roi      = cashIn > 0 ? (profit / cashIn) * 100 : 0;   // leveraged when financed
  const maxOffer = arv * (self ? 0.75 : 0.70) - rep;
  const ltvVal   = financed ? (loan / arv) * 100 : (ask / arv) * 100;
  const ltvLabel = financed ? 'LTV' : 'Price / ARV';
  const ltc      = financed && cost > 0 ? (loan / cost) * 100 : 0;
  const ratePct  = (rate * 100).toFixed(2).replace(/\.?0+$/, '');
  const pointsPct = (points * 100).toFixed(2).replace(/\.?0+$/, '');

  let verdict, vsub, cls;
  if (profit >= target && roi >= 20) {
    verdict = 'Strong Flip Play'; cls = 'hot';
    vsub = 'Hits your profit target and ROI. ' + (self
      ? 'Self-performing gives you maximum margin here.'
      : 'Consider self-performing to push profit even higher.')
      + ' Verify your ARV with comps before committing.';
  } else if (profit >= target * 0.75 && roi >= 12) {
    verdict = 'Dig Deeper & Negotiate'; cls = 'warm';
    vsub = 'Close to your target. Counter at ' + fmt(maxOffer) + ' max offer' + (self
      ? ' — your labor advantage could close the gap.'
      : '.') + ' Numbers are workable if you negotiate price or reduce scope.';
  } else if (profit >= 2.5 * target) {
    // Item 5: large absolute profit floors the verdict at warm even when ROI is below bar
    verdict = 'Dig Deeper & Negotiate'; cls = 'warm';
    vsub = 'ROI is below your usual bar, but absolute profit is large — decide if capital efficiency or dollar profit matters more on this one.';
  } else if (maxOffer <= 0) {
    verdict = 'Counter at Max Offer — Walk Away'; cls = 'pass';
    vsub = "Repairs exceed the " + (self ? '75' : '70') + "% ARV ceiling — there's no purchase price that hits your target on this one. Walk away.";
  } else {
    verdict = 'Counter at Max Offer — Walk Away'; cls = 'pass';
    vsub = "Numbers don't work at asking. Max you can pay: " + fmt(maxOffer) + ". Counter hard or walk — don't overpay.";
  }

  document.getElementById('flip-verdict').className = 'verdict ' + cls;
  document.getElementById('fvtag').textContent   = cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  document.getElementById('fvlabel').textContent = verdict;
  document.getElementById('fvsub').textContent   = vsub;

  document.getElementById('flip-metrics').innerHTML = buildMetrics([
    { label: 'Net Profit', val: fmt(profit),   cls: cls === 'hot' ? 'good' : cls === 'warm' ? 'warn' : 'bad' },
    { label: 'ROI',        val: pct(roi),       cls: cClass(roi, 20, 12) },
    { label: 'Max Offer',  val: fmt(Math.max(0, maxOffer)),  cls: 'neutral' },
    { label: ltvLabel,     val: pct(ltvVal),    cls: financed ? cClass(75 - ltvVal, 15, 5) : 'neutral' },
  ]);

  document.getElementById('flip-breakdown').innerHTML = buildRows([
    { l: 'Purchase price',                                    v: fmt(ask) },
    { l: 'Repair costs' + (self ? ' (self-perform)' : ''),   v: fmt(rep) },
    { l: 'Purchase costs (' + Math.round(cc1 * 100) + '%)',  v: fmt(buyCost) },
    { l: 'Carrying costs (' + hold + ' mo, non-loan)',        v: fmt(holdCost) },
    ...(financed ? [
      { l: 'Loan interest (' + hold + ' mo @ ' + ratePct + '%)', v: fmt(loanInt) },
      { l: 'Points (' + pointsPct + '%)',                       v: fmt(loanFees) },
    ] : []),
    { l: 'Sale costs (' + Math.round(cc2 * 100) + '%)',       v: fmt(sellCost) },
    ...(financed ? [{ l: 'LTC (loan ÷ cost)', v: (Math.round(ltc * 10) / 10) + '%' }] : []),
    { l: financed ? 'Cash invested' : 'Total cash (all-cash)', v: fmt(cashIn) },
    { l: 'Net profit', v: fmt(profit), tot: true, color: profit >= 0 ? 'var(--accent)' : 'var(--danger)' },
  ]);

  lastFlipResult = {
    type: 'flip', addr, ask, arv, rep, hold,
    cc1: +document.getElementById('f-cc1').value,
    cc2: +document.getElementById('f-cc2').value,
    carry, target, sqft, self,
    loan, rate, points, financed, finCost, loanInt, loanFees, cashIn, ltc,
    profit, roi, ltv: ltvVal, ltvLabel, maxOffer, buyCost, sellCost, holdCost, totalIn,
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
