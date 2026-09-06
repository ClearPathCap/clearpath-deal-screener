// ─── STR / Rental analyzer ────────────────────────────────────────────────────

import { fmt, pct, cClass, buildMetrics, buildRows, parseComma, parseNumOpt, renderInputIssues, inputIsIncomplete } from './format.js';
import { STR_MARKETS, ALL_MARKETS } from './markets.js';
import { maybeShowFundingButton } from './clearpath.js';
import { validateInputs, plausibilityWarnings } from './finance.js';
import { computeStr } from './strFinance.js';
import { taxStatus, strExpensePresentation } from './insuranceReadiness.js';

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
// Saved-deal review: entering a review invalidates the last result so an
// "Update Saved Deal" without a fresh Analyze is refused (never a stale result).
export function clearLastRentalResult() { lastRentalResult = null; }

export function setRentalPreset(slug, el) {
  if (el) el.classList.add('slot-active');
  const m = getStrMarket(slug);
  // Set occupancy from market data (midpoint of low/high range)
  const occ = Math.round(((m.occLow || 0.55) + (m.occHigh || 0.65)) / 2 * 100);
  const occEl = document.getElementById('v-occ');
  if (occEl && !occEl.dataset.userEdited) occEl.value = occ;   // user-edited law (2026-09-05)
  // Keep other fields at their current values if already set, or use defaults
  const down = document.getElementById('v-down');
  if (!down.dataset.userEdited && (!down.value || +down.value === 0)) down.value = 20;   // user-edited law
  const mgmt = document.getElementById('v-mgmt');
  if (!mgmt.dataset.userEdited && (!mgmt.value || +mgmt.value === 0)) mgmt.value = 3;    // user-edited law
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
  const taxRaw  = parseNumOpt(document.getElementById('v-tax').value); // F-6: blank ≠ 0
  const tax     = taxRaw ?? 0;
  const maint   = parseComma(document.getElementById('v-maint').value);
  const furnish = parseComma(document.getElementById('v-furnish').value);
  const util    = parseComma(document.getElementById('v-util')?.value || '0') || 0;   // owner-paid utilities (annual $)
  const hoa     = parseComma(document.getElementById('v-hoa')?.value || '0') || 0;    // HOA (monthly $) — Wave A · A2; $0 default = confirmed no HOA
  const tgtCoc  = +document.getElementById('v-target').value || 6;
  // Item 14: editable interest rate field — default 6.75%
  const interestRate = (+document.getElementById('v-interest-rate')?.value || 6.75) / 100;
  if (!price || !rent) { return; } // empty-required handled by main.js wrapper

  // B2 (STR): validate pre-compute — out-of-range inputs abort (no compute, no "Strong
  // STR", no funnel). STR % fields are whole numbers, so read the RAW values (pre /100).
  // Numeric-input integrity: a half-typed number reads as NaN → blocking error.
  const numRaw = (id) => { const e = document.getElementById(id); return inputIsIncomplete(e) ? NaN : +(e ? e.value : 0); };
  const strRaw = {
    price,
    revenue: rent,
    down:  numRaw('v-down'),
    occ:   numRaw('v-occ'),
    mgmt:  numRaw('v-mgmt'),
    pm:    selfManage ? 0 : numRaw('v-pm'),
    rate:  numRaw('v-interest-rate'),
    tgtCoc: numRaw('v-target'),
    tax: taxRaw, maint, furnish, hoa,
  };
  const { errors: strErrors } = validateInputs('str', strRaw);
  if (renderInputIssues('rental', strErrors, [])) {
    document.getElementById('rental-results').style.display = 'none';
    const fb = document.getElementById('rental-funding-btn'); if (fb) fb.innerHTML = '';
    return;
  }

  // F-6: the combined "Taxes + insurance" field follows the blank-is-unknown rule.
  // One field cannot distinguish missing taxes from missing insurance, so a blank
  // pends as ONE combined expense state (no meaning silently picked); an explicit
  // $0 computes as a real value. Math + verdict live in strFinance.js (pure,
  // unit-tested) — extracted verbatim, zero behavior change.
  const tStat = taxStatus(taxRaw);
  const strP = strExpensePresentation(tStat); // non-null → Pending overlay

  const { effRent, platformFee, pmFee, noi, capRate, downAmt, loan, debt, cashflow, dscr, coc, grm, verdict, vsub, cls } =
    computeStr({ price, rent, down, occ, mgmt, pm, tax, maint, furnish, tgtCoc, interestRate, util, hoa });
  const rateDisplay = (interestRate * 100).toFixed(2).replace(/\.?0+$/, '') + '%';

  document.getElementById('rental-verdict').className = 'verdict ' + (strP ? 'warm' : cls);
  document.getElementById('rvtag').textContent   = strP ? strP.tag : cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  document.getElementById('rvlabel').textContent = strP ? strP.label : verdict;
  document.getElementById('rvsub').textContent   = strP ? strP.sub : vsub;

  document.getElementById('rental-metrics').innerHTML = buildMetrics([
    { label: 'Cash-on-Cash',     val: strP ? strP.pendingText : pct(coc),       cls: strP ? 'warn' : cClass(coc, tgtCoc, tgtCoc * 0.75) },
    { label: 'Cap Rate',         val: strP ? strP.pendingText : pct(capRate),   cls: strP ? 'warn' : cClass(capRate, 6, 4.5) },
    { label: 'Annual Cash Flow', val: strP ? strP.pendingText : fmt(cashflow),  cls: strP ? 'warn' : cClass(cashflow, 6000, 0) },
    { label: 'DSCR',             val: strP ? strP.pendingText : (debt > 0 ? dscr.toFixed(2) : 'n/a'), cls: strP ? 'warn' : dscr >= 1.25 ? 'good' : dscr >= 1.0 ? 'warn' : 'bad' },
  ]);

  const breakdownRows = [
    { l: 'Potential revenue (100% occ.)',                                   v: fmt(rent) },
    { l: 'Effective revenue (' + Math.round(occ * 100) + '% occ.)',        v: fmt(effRent) },
    { l: 'Platform fees (Airbnb/VRBO)',                                     v: '–' + fmt(platformFee) },
    { l: 'Property manager' + (pm > 0 ? ' (' + Math.round(pm * 100) + '%)' : ' (self)'), v: pm > 0 ? '–' + fmt(pmFee) : '$0' },
    { l: 'Taxes + insurance' + (strP ? ' (not entered)' : ''),             v: strP ? '— pending' : '–' + fmt(tax) },
    { l: 'Maintenance',                                                    v: '–' + fmt(maint) },
    ...(util > 0 ? [{ l: 'Owner-paid utilities', v: '–' + fmt(util) }] : []),
    ...(hoa > 0 ? [{ l: 'HOA (' + fmt(hoa) + '/mo)', v: '–' + fmt(hoa * 12) }] : []),   // Wave A · A2: annualized once, shown when positive (LTR law)
    { l: 'Net operating income',                                           v: strP ? strP.pendingText : fmt(noi) },
    { l: 'Annual debt service (' + rateDisplay + ')',                      v: '–' + fmt(debt) },
    { l: 'Net cash flow (annual)', v: strP ? strP.pendingText : fmt(cashflow), tot: true, color: strP ? '' : (cashflow >= 0 ? 'var(--accent)' : 'var(--danger)') },
    { l: 'Net cash flow (monthly)',                                        v: strP ? strP.pendingText : fmt(cashflow / 12) },
    { l: 'DSCR (NOI ÷ debt service)',                                      v: strP ? strP.pendingText : (debt > 0 ? dscr.toFixed(2) : 'n/a') },
    { l: 'Gross rent multiplier (price ÷ rent)',                           v: grm + 'x' },
    ...(furnish > 0 ? [{ l: 'Furnishing / setup (one-time cash — not in NOI)', v: '–' + fmt(furnish) }] : []),
  ];
  document.getElementById('rental-breakdown').innerHTML = buildRows(breakdownRows);

  lastRentalResult = {
    type: 'rental', addr, price,
    down:         +document.getElementById('v-down').value,
    rent,
    occ:          +document.getElementById('v-occ').value,
    mgmt:         +document.getElementById('v-mgmt').value,
    pm:           selfManage ? 0 : +document.getElementById('v-pm').value,
    tax, taxStatus: tStat, maint, furnish, util, hoa, tgtCoc, interestRate,
    cashflow, coc, capRate, noi, debt, downAmt, grm, dscr,
    verdict, cls,
    hot: cls === 'hot',
  };

  const r = document.getElementById('rental-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastRentalResult);

  // Post-compute soft warnings (non-blocking): DSCR/cap plausibility + a rent-to-price
  // sanity check, appended to the same inline box.
  const strWarn = plausibilityWarnings(lastRentalResult);
  const monthlyEquiv = rent / 12; // potential monthly-equivalent revenue
  if (price > 0 && monthlyEquiv > 0) {
    const ratio = (monthlyEquiv / price) * 100;
    if (ratio > 3)   strWarn.push({ field: 'rent', label: 'Revenue', message: 'looks high for the price — double-check this number.' });
    if (ratio < 0.3) strWarn.push({ field: 'rent', label: 'Revenue', message: 'looks low for the price — double-check this number.' });
  }
  renderInputIssues('rental', [], strWarn);
}

export function resetRental() {
  document.getElementById('rental-results').style.display = 'none';
  document.getElementById('rental-notes').value = '';
  document.getElementById('rental-funding-btn').innerHTML = '';
  lastRentalResult = null;
}
