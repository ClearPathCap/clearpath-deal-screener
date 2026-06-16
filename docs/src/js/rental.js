// ─── STR / Rental analyzer ────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma } from './format.js';
import { STR_MARKETS, ALL_MARKETS } from './markets.js';
import { maybeShowFundingButton } from './clearpath.js';

// ─── Regional STR fallback defaults (Task 3) ──────────────────────────────────
const STR_REGIONAL_DEFAULTS = {
  'Southeast':    { revLow: 28000, revHigh: 48000, occLow: 0.42, occHigh: 0.60, adrLow: 220, adrHigh: 360 },
  'South Central':{ revLow: 26000, revHigh: 46000, occLow: 0.40, occHigh: 0.58, adrLow: 200, adrHigh: 340 },
  'Midwest':      { revLow: 22000, revHigh: 38000, occLow: 0.35, occHigh: 0.52, adrLow: 180, adrHigh: 300 },
  'Mountain West':{ revLow: 38000, revHigh: 68000, occLow: 0.46, occHigh: 0.64, adrLow: 280, adrHigh: 460 },
  'Pacific':      { revLow: 42000, revHigh: 78000, occLow: 0.46, occHigh: 0.64, adrLow: 310, adrHigh: 510 },
  'Northeast':    { revLow: 32000, revHigh: 58000, occLow: 0.38, occHigh: 0.55, adrLow: 260, adrHigh: 420 },
};
const STR_NATIONAL_DEFAULT = STR_REGIONAL_DEFAULTS['Southeast'];

// True when we have city-level STR data (directly or via a "-str" sibling slug)
export function hasCityStrData(slug) {
  return !!(STR_MARKETS[slug] || STR_MARKETS[slug + '-str']);
}

function getStrMarket(slug) {
  if (STR_MARKETS[slug]) return STR_MARKETS[slug];
  if (STR_MARKETS[slug + '-str']) return STR_MARKETS[slug + '-str']; // city data under a -str sibling
  const entry  = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  return STR_REGIONAL_DEFAULTS[region] || STR_NATIONAL_DEFAULT;
}

let lastRentalResult = null;

export function getLastRentalResult() { return lastRentalResult; }

export function setRentalPreset(slug, el) {
  if (el) el.classList.add('slot-active');
  const m = getStrMarket(slug);
  // Set occupancy from market data (midpoint of low/high range)
  const occ = Math.round(((m.occLow || 0.55) + (m.occHigh || 0.65)) / 2 * 100);
  document.getElementById('v-occ').value = occ;
  // Keep other fields at their current values if already set, or use defaults
  const down = document.getElementById('v-down');
  if (!down.value || +down.value === 0) down.value = 20;
  const mgmt = document.getElementById('v-mgmt');
  if (!mgmt.value || +mgmt.value === 0) mgmt.value = 3;
}

export function analyzeRental() {
  const addr    = document.getElementById('v-addr').value.trim();
  const price   = parseComma(document.getElementById('v-price').value);
  const down    = (+document.getElementById('v-down').value || 20) / 100;
  const rent    = parseComma(document.getElementById('v-rent').value);
  const occ     = (+document.getElementById('v-occ').value || 65) / 100;
  const mgmt    = (+document.getElementById('v-mgmt').value || 3) / 100;
  const selfManage = document.getElementById('self-manage-toggle')?.checked;
  const pm      = selfManage ? 0 : (+document.getElementById('v-pm').value || 8) / 100;
  const tax     = parseComma(document.getElementById('v-tax').value);
  const maint   = parseComma(document.getElementById('v-maint').value);
  const furnish = parseComma(document.getElementById('v-furnish').value);
  const tgtCoc  = +document.getElementById('v-target').value || 6;
  // Item 14: editable interest rate field — default 6.75%
  const interestRate = (+document.getElementById('v-interest-rate')?.value || 6.75) / 100;
  if (!price || !rent) { return; } // validation handled by wrapper in main.js

  const effRent     = rent * occ;
  const platformFee = effRent * mgmt;
  const pmFee       = effRent * pm;
  const totalExp    = platformFee + pmFee + tax + maint;
  const noi         = effRent - totalExp;
  const capRate     = (noi / price) * 100;
  const downAmt     = price * down + furnish;
  const loan        = price - (price * down);
  const monthlyRate = interestRate / 12;
  const n           = 360;
  const mo          = loan > 0 ? loan * monthlyRate * Math.pow(1 + monthlyRate, n) / (Math.pow(1 + monthlyRate, n) - 1) : 0;
  const debt        = mo * 12;
  const cashflow    = noi - debt;
  const dscr        = debt > 0 ? noi / debt : 0;   // the metric a rental lender underwrites to
  const coc         = (cashflow / downAmt) * 100;
  const grm         = Math.round((price / rent) * 10) / 10;
  const rateDisplay = (interestRate * 100).toFixed(2).replace(/\.?0+$/, '') + '%';

  let verdict, vsub, cls;
  if (coc >= tgtCoc && capRate >= 6) {
    verdict = 'Strong STR Play'; cls = 'hot';
    vsub = 'Cash-on-cash return of ' + (Math.round(coc * 10) / 10) + '% clears your ' + tgtCoc + '% target. ' +
      'Cap Rate (' + (Math.round(capRate * 10) / 10) + '%) measures return as if you paid cash. Verify occupancy with AirDNA before closing.';
  } else if (coc >= tgtCoc * 0.75 && capRate >= 4.5) {
    verdict = 'Dig Deeper & Negotiate'; cls = 'warm';
    vsub = 'Cash-on-cash of ' + (Math.round(coc * 10) / 10) + '% is close to your ' + tgtCoc + '% target. ' +
      'A few more booked nights/month changes the math. Verify occupancy in AirDNA and negotiate on price.';
  } else {
    verdict = 'Thin Margins — Walk Away'; cls = 'pass';
    vsub = 'Cash-on-cash of ' + (Math.round(coc * 10) / 10) + '% misses your ' + tgtCoc + '% target. ' +
      'Negotiate price down significantly or find a property with stronger revenue potential.';
  }

  // DSCR bridge: a warm cash-on-cash deal that still clears lender DSCR is fundable.
  if (cls === 'warm' && dscr >= 1.25) {
    vsub += ' Lender-fundable: DSCR ' + dscr.toFixed(2) + ' clears typical 1.20–1.25 underwriting even though cash-on-cash trails your target — a finance-and-hold candidate.';
  }

  document.getElementById('rental-verdict').className = 'verdict ' + cls;
  document.getElementById('rvtag').textContent   = cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  document.getElementById('rvlabel').textContent = verdict;
  document.getElementById('rvsub').textContent   = vsub;

  document.getElementById('rental-metrics').innerHTML = buildMetrics([
    { label: 'Cash-on-Cash',     val: pct(coc),       cls: cClass(coc, tgtCoc, tgtCoc * 0.75) },
    { label: 'Cap Rate',         val: pct(capRate),   cls: cClass(capRate, 6, 4.5) },
    { label: 'Annual Cash Flow', val: fmt(cashflow),  cls: cClass(cashflow, 6000, 0) },
    { label: 'DSCR',             val: (debt > 0 ? dscr.toFixed(2) : 'n/a'), cls: dscr >= 1.25 ? 'good' : dscr >= 1.0 ? 'warn' : 'bad' },
  ]);

  const breakdownRows = [
    { l: 'Potential revenue (100% occ.)',                                   v: fmt(rent) },
    { l: 'Effective revenue (' + Math.round(occ * 100) + '% occ.)',        v: fmt(effRent) },
    { l: 'Platform fees (Airbnb/VRBO)',                                     v: '–' + fmt(platformFee) },
    { l: 'Property manager' + (pm > 0 ? ' (' + Math.round(pm * 100) + '%)' : ' (self)'), v: pm > 0 ? '–' + fmt(pmFee) : '$0' },
    { l: 'Taxes + insurance',                                              v: '–' + fmt(tax) },
    { l: 'Maintenance',                                                    v: '–' + fmt(maint) },
    ...(furnish > 0 ? [{ l: 'Furnishing / setup (one-time)',               v: '–' + fmt(furnish) }] : []),
    { l: 'Net operating income',                                           v: fmt(noi) },
    { l: 'Annual debt service (' + rateDisplay + ')',                      v: '–' + fmt(debt) },
    { l: 'Net cash flow', v: fmt(cashflow), tot: true, color: cashflow >= 0 ? 'var(--accent)' : 'var(--danger)' },
    { l: 'DSCR (NOI ÷ debt service)',                                      v: (debt > 0 ? dscr.toFixed(2) : 'n/a') },
    { l: 'Gross rent multiplier (price ÷ rent)',                           v: grm + 'x' },
  ];
  document.getElementById('rental-breakdown').innerHTML = buildRows(breakdownRows);

  lastRentalResult = {
    type: 'rental', addr, price,
    down:         +document.getElementById('v-down').value,
    rent,
    occ:          +document.getElementById('v-occ').value,
    mgmt:         +document.getElementById('v-mgmt').value,
    pm:           selfManage ? 0 : +document.getElementById('v-pm').value,
    tax, maint, furnish, tgtCoc, interestRate,
    cashflow, coc, capRate, noi, debt, downAmt, grm, dscr,
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
