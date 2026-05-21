// ─── STR / Rental analyzer ────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows } from './format.js';
import { RENTAL_PRESETS } from './markets.js';

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
  document.getElementById('v-tax').value     = p.tax;
  document.getElementById('v-maint').value   = p.maint;
  document.getElementById('v-furnish').value = p.furnish;
  document.getElementById('v-target').value  = p.target;
}

export function analyzeRental() {
  const addr    = document.getElementById('v-addr').value.trim();
  const price   = +document.getElementById('v-price').value || 0;
  const down    = (+document.getElementById('v-down').value || 20) / 100;
  const rent    = +document.getElementById('v-rent').value || 0;
  const occ     = (+document.getElementById('v-occ').value || 65) / 100;
  const mgmt    = (+document.getElementById('v-mgmt').value || 15) / 100;
  const pm      = (+document.getElementById('v-pm').value || 0) / 100;
  const tax     = +document.getElementById('v-tax').value || 0;
  const maint   = +document.getElementById('v-maint').value || 0;
  const furnish = +document.getElementById('v-furnish').value || 0;
  const tgtCoc  = +document.getElementById('v-target').value || 6;
  if (!price || !rent) { alert('Enter Purchase Price and Gross Annual Rent.'); return; }

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
    vsub = 'Clears your ' + tgtCoc + '% target. Verify occupancy data with AirDNA before closing.';
  } else if (coc >= tgtCoc * 0.75 && capRate >= 4.5) {
    verdict = 'Dig Deeper'; cls = 'warm';
    vsub = 'Returns are close. Verify local STR occupancy — a few more booked nights/month changes the math.';
  } else {
    verdict = 'Thin Margins'; cls = 'pass';
    vsub = 'Cash flow is too tight. Negotiate price down or find a property with higher revenue potential.';
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
    pm:     +document.getElementById('v-pm').value,
    tax, maint, furnish, tgtCoc,
    cashflow, coc, capRate, noi, debt, downAmt, grm,
    verdict, cls,
  };

  const r = document.getElementById('rental-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function resetRental() {
  document.getElementById('rental-results').style.display = 'none';
  document.getElementById('rental-notes').value = '';
  lastRentalResult = null;
}
