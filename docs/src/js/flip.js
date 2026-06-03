// ─── Fix & Flip analyzer ──────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma } from './format.js';
import { FLIP_MARKETS, ALL_MARKETS } from './markets.js';
import { calcRepair } from './repair.js';
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
  const target = Math.max(25000, Math.round((m.medianArv || 300000) * 0.09 / 1000) * 1000);
  document.getElementById('f-hold').value   = 5;
  document.getElementById('f-carry').value  = carry.toLocaleString();
  document.getElementById('f-target').value = target.toLocaleString();
  calcRepair();
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

  const buyCost  = ask * cc1;
  const sellCost = arv * cc2;
  const holdCost = carry * hold;
  const totalIn  = ask + rep + buyCost + holdCost;
  const profit   = arv - totalIn - sellCost;
  const roi      = (profit / totalIn) * 100;
  const maxOffer = arv * (self ? 0.75 : 0.70) - rep;
  const ltv      = (ask / arv) * 100;

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
  } else {
    verdict = 'Counter at Max Offer — Walk Away'; cls = 'pass';
    vsub = "Numbers don't work at asking. Max you can pay: " + fmt(maxOffer) + ". Counter hard or walk — don't overpay.";
  }

  document.getElementById('flip-verdict').className = 'verdict ' + cls;
  document.getElementById('fvtag').textContent   = cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  document.getElementById('fvlabel').textContent = verdict;
  document.getElementById('fvsub').textContent   = vsub;

  document.getElementById('flip-metrics').innerHTML = buildMetrics([
    { label: 'Net Profit', val: fmt(profit),   cls: cClass(profit, target, target * 0.75) },
    { label: 'ROI',        val: pct(roi),       cls: cClass(roi, 20, 12) },
    { label: 'Max Offer',  val: fmt(maxOffer),  cls: 'neutral' },
    { label: 'LTV',        val: pct(ltv),       cls: cClass(80 - ltv, 15, 5) },
  ]);

  document.getElementById('flip-breakdown').innerHTML = buildRows([
    { l: 'Purchase price',                                    v: fmt(ask) },
    { l: 'Repair costs' + (self ? ' (self-perform)' : ''),   v: fmt(rep) },
    { l: 'Purchase costs (' + Math.round(cc1 * 100) + '%)',  v: fmt(buyCost) },
    { l: 'Carrying costs (' + hold + ' mo)',                  v: fmt(holdCost) },
    { l: 'Sale costs (' + Math.round(cc2 * 100) + '%)',       v: fmt(sellCost) },
    { l: 'Total all-in',                                      v: fmt(totalIn + sellCost) },
    { l: 'Net profit', v: fmt(profit), tot: true, color: profit >= 0 ? 'var(--accent)' : 'var(--danger)' },
  ]);

  lastFlipResult = {
    type: 'flip', addr, ask, arv, rep, hold,
    cc1: +document.getElementById('f-cc1').value,
    cc2: +document.getElementById('f-cc2').value,
    carry, target, sqft, self,
    profit, roi, ltv, maxOffer, buyCost, sellCost, holdCost, totalIn,
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
