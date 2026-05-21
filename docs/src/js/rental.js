// ─── STR / Rental analyzer ────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma } from './format.js';
import { RENTAL_PRESETS } from './markets.js';
import { maybeShowFundingButton } from './clearpath.js';

let lastRentalResult = null;

export function getLastRentalResult() { return lastRentalResult; }

export function setRentalPreset(type, el) {
  document.querySelectorAll('#page-rental .preset').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const p = RENTAL_PRESETS[type];
  if (!p) return; // 'custom' — user fills in manually
  document.getElementById('v-down').value    = p.down;
  document.getElementById('v-occ').value     = p.occ;
  document.getElementById('v-mgmt').value    = p.mgmt;
  document.getElementById('v-pm').value      = p.pm;
  document.getElementById('v-tax').value     = p.tax.toLocaleString();
  document.getElementById('v-maint').value   = p.maint.toLocaleString();
  document.getElementById('v-furnish').value = p.furnish.toLocaleString();
  document.getElementById('v-target').value  = p.target;
}

export function analyzeRental() {
  const addr    = document.getElementById('v-addr').value.trim();
  const price   = parseComma(document.getElementById('v-price').value);
  const down    = (+document.getElementById('v-down').value || 20) / 100;
  const rent    = parseComma(document.getElementById('v-rent').value);
  const occ     = (+document.getElementById('v-occ').value || 65) / 100;
  const mgmt    = (+document.getElementById('v-mgmt').value || 15) / 100;
  const selfManage = document.getElementById('self-manage-toggle')?.checked;
  const pm      = selfManage ? 0 : (+document.getElementById('v-pm').value || 0) / 100;
  const tax     = parseComma(document.getElementById('v-tax').value);
  const maint   = parseComma(document.getElementById('v-maint').value);
  const furnish = parseComma(document.getElementById('v-furnish').value);
  const tgtCoc  = +document.getElementById('v-target').value || 6;
  if (!price || !rent) { return; } // validation handled by wrapper in main.js

  const effRent    = rent * occ;
  const platformFee = effRent * mgmt;
  const pmFee      = effRent * pm;
  const totalExp   = platformFee + pmFee + tax + maint;
  const noi        = effRent - totalExp;
  const capRate    = (noi / price) * 100;
  const downAmt    = price * down + furnish;
  const loan       = price - (price * down);
  const rate       = 0.0675 / 12;
  const n          = 360;
  const mo         = loan > 0 ? loan * rate * Math.pow(1 + rate, n) / (Math.pow(1 + rate, n) - 1) : 0;
  const debt       = mo * 12;
  const cashflow   = noi - debt;
  const coc        = (cashflow / downAmt) * 100;
  const grm        = Math.round((price / rent) * 10) / 10;

  let verdict, vsub, cls;
  if (coc >= tgtCoc && capRate >= 6) {
    verdict = 'Strong STR Play'; cls = 'hot';
    vsub = 'Cash-on-cash return of ' + (Math.round(coc * 10) / 10) + '% clears your ' + tgtCoc + '% target. ' +
      'Cap Rate (' + (Math.round(capRate * 10) / 10) + '%) measures return as if you paid cash. Verify occupancy with AirDNA before closing.';
  } else if (coc >= tgtCoc * 0.75 && capRate >= 4.5) {
    verdict = 'Dig Deeper'; cls = 'warm';
    vsub = 'Cash-on-cash of ' + (Math.round(coc * 10) / 10) + '% is close to your ' + tgtCoc + '% target. ' +
      'A few more booked nights/month changes the math. Verify occupancy in AirDNA.';
  } else {
    verdict = 'Thin Margins'; cls = 'pass';
    vsub = 'Cash-on-cash of ' + (Math.round(coc * 10) / 10) + '% misses your ' + tgtCoc + '% target. ' +
      'Negotiate price down or find a property with higher revenue potential.';
  }

  document.getElementById('rental-verdict').className = 'verdict ' + cls;
  document.getElementById('rvtag').textContent   = cls === 'hot' ? 'Strong Signal' : cls === 'warm' ? 'Needs Review' : 'Not a Deal';
  document.getElementById('rvlabel').textContent = verdict;
  document.getElementById('rvsub').textContent   = vsub;

  document.getElementById('rental-metrics').innerHTML = buildMetrics([
    { label: 'Cash-on-Cash',     val: pct(coc),       cls: cClass(coc, tgtCoc, tgtCoc * 0.75) },
    { label: 'Cap Rate',         val: pct(capRate),   cls: cClass(capRate, 6, 4.5) },
    { label: 'Annual Cash Flow', val: fmt(cashflow),  cls: cClass(cashflow, 6000, 0) },
    { label: 'Gross Rent Mult',  val: grm + 'x',      cls: grm <= 10 ? 'good' : grm <= 15 ? 'warn' : 'bad' },
  ]);

  document.getElementById('rental-breakdown').innerHTML = buildRows([
    { l: 'Gross annual rent',                                          v: fmt(rent) },
    { l: 'Effective rent (' + Math.round(occ * 100) + '% occ.)',     v: fmt(effRent) },
    { l: 'Platform fees (Airbnb/VRBO)',                                v: '–' + fmt(platformFee) },
    { l: 'Property manager' + (pm > 0 ? ' (' + Math.round(pm * 100) + '%)' : ' (self)'), v: pm > 0 ? '–' + fmt(pmFee) : '$0' },
    { l: 'Taxes + insurance',                                         v: '–' + fmt(tax) },
    { l: 'Maintenance',                                               v: '–' + fmt(maint) },
    { l: 'Net operating income',                                      v: fmt(noi) },
    { l: 'Annual debt service (6.75%)',                               v: '–' + fmt(debt) },
    { l: 'Net cash flow', v: fmt(cashflow), tot: true, color: cashflow >= 0 ? 'var(--accent)' : 'var(--danger)' },
  ]);

  lastRentalResult = {
    type: 'rental', addr, price,
    down:   +document.getElementById('v-down').value,
    rent,
    occ:    +document.getElementById('v-occ').value,
    mgmt:   +document.getElementById('v-mgmt').value,
    pm:     selfManage ? 0 : +document.getElementById('v-pm').value,
    tax, maint, furnish, tgtCoc,
    cashflow, coc, capRate, noi, debt, downAmt, grm,
    verdict, cls,
    hot: cls === 'hot',
  };

  const r = document.getElementById('rental-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastRentalResult);
}

export function resetRental() {
  document.getElementById('rental-results').style.display = 'none';
  document.getElementById('rental-notes').value = '';
  document.getElementById('rental-funding-btn').innerHTML = '';
  lastRentalResult = null;
}
