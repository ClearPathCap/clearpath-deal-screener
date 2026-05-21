// ─── Fix & Flip analyzer ──────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows } from './format.js';
import { FLIP_PRESETS } from './markets.js';
import { calcRepair } from './repair.js';

let lastFlipResult = null;

export function getLastFlipResult() { return lastFlipResult; }

export function setFlipPreset(type, el) {
  document.querySelectorAll('#page-flip .preset').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const p = FLIP_PRESETS[type] || FLIP_PRESETS.regional;
  document.getElementById('f-hold').value   = p.hold;
  document.getElementById('f-carry').value  = p.carry;
  document.getElementById('f-target').value = p.target;
  calcRepair();
}

export function analyzeFlip() {
  const addr   = document.getElementById('f-addr').value.trim();
  const ask    = +document.getElementById('f-ask').value || 0;
  const arv    = +document.getElementById('f-arv').value || 0;
  const rep    = +document.getElementById('f-rep').value || 0;
  const hold   = +document.getElementById('f-hold').value || 5;
  const cc1    = (+document.getElementById('f-cc1').value || 2) / 100;
  const cc2    = (+document.getElementById('f-cc2').value || 6) / 100;
  const carry  = +document.getElementById('f-carry').value || 900;
  const target = +document.getElementById('f-target').value || 40000;
  const sqft   = +document.getElementById('sqft').value || 0;
  const self   = document.getElementById('self-reno').checked;
  if (!ask || !arv) { alert('Enter at least Asking Price and ARV.'); return; }

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
    verdict = 'Hot Deal'; cls = 'hot';
    vsub = 'Hits your profit target and ROI. ' + (self
      ? 'Self-performing gives you maximum margin here.'
      : 'Consider self-performing to push profit even higher.');
  } else if (profit >= target * 0.75 && roi >= 12) {
    verdict = 'Negotiate Hard'; cls = 'warm';
    vsub = 'Close to your target. Counter at ' + fmt(maxOffer) + ' max offer' + (self
      ? ' — your labor advantage could close the gap.'
      : '.');
  } else {
    verdict = 'Pass on This One'; cls = 'pass';
    vsub = "Numbers don't work at asking. Max you can pay: " + fmt(maxOffer) + '. Walk away or counter hard.';
  }

  document.getElementById('flip-verdict').className = 'verdict ' + cls;
  document.getElementById('fvtag').textContent   = cls === 'hot' ? 'Strong Signal' : cls === 'warm' ? 'Needs Negotiation' : 'Not a Deal';
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
    { l: 'Buy closing (' + Math.round(cc1 * 100) + '%)',     v: fmt(buyCost) },
    { l: 'Carrying costs (' + hold + ' mo)',                  v: fmt(holdCost) },
    { l: 'Sell closing (' + Math.round(cc2 * 100) + '%)',    v: fmt(sellCost) },
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
  };

  const r = document.getElementById('flip-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function resetFlip() {
  document.getElementById('flip-results').style.display = 'none';
  document.getElementById('flip-notes').value = '';
  lastFlipResult = null;
}
