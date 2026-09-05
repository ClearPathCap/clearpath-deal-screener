// ─── Long-Term Rental (LTR / DSCR) analyzer ───────────────────────────────────
// DOM glue over the shared, tested finance engine (finance.js). Monthly-lease,
// DSCR-led — the funnel into Clear Path's DSCR rental-loan product. Mirrors
// rental.js (STR) conventions: l-* field IDs, getLtrMarket regional fallback,
// lastLtrResult, maybeShowFundingButton reuse.

import { fmt, pct, cClass, buildMetrics, buildRows, parseNumOpt, renderInputIssues, inputIsIncomplete } from './format.js';
import { computeLtr, ltrVerdict, mosLabel, validateInputs, plausibilityWarnings, propertyBand, BAND_RULES } from './finance.js';
import { LTR_MARKETS, ALL_MARKETS } from './markets.js';
import { maybeShowFundingButton } from './clearpath.js';
import { buildCpcUrl } from './funding.js';
import { insuranceStatus, taxStatus, incomePresentation, INS_MISSING, INS_EXPLICIT_ZERO } from './insuranceReadiness.js';

// Regional rent/vacancy fallback when a slug has no city-level LTR row.
const LTR_REGIONAL_DEFAULTS = {
  'Southeast':     { rent2br: 1500, vacancyRate: 0.06, taxRate: 0.010 },
  'South Central': { rent2br: 1450, vacancyRate: 0.07, taxRate: 0.018 },
  'Midwest':       { rent2br: 1300, vacancyRate: 0.06, taxRate: 0.016 },
  'Mountain West': { rent2br: 1700, vacancyRate: 0.06, taxRate: 0.007 },
  'Pacific':       { rent2br: 2100, vacancyRate: 0.05, taxRate: 0.009 },
  'Northeast':     { rent2br: 1700, vacancyRate: 0.05, taxRate: 0.020 },
};
const LTR_NATIONAL_DEFAULT = LTR_REGIONAL_DEFAULTS['Southeast'];

export function getLtrMarket(slug) {
  if (LTR_MARKETS[slug]) return LTR_MARKETS[slug];
  const entry  = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  return LTR_REGIONAL_DEFAULTS[region] || LTR_NATIONAL_DEFAULT;
}

let lastLtrResult = null;
export function getLastLtrResult() { return lastLtrResult; }
// Saved-deal review: entering a review invalidates the last result so an
// "Update Saved Deal" without a fresh Analyze is refused (never a stale result).
export function clearLastLtrResult() { lastLtrResult = null; }

// Field readers — return undefined when blank so finance.js applies its defaults.
const elv = id => document.getElementById(id);
function numOpt(id) { const el = elv(id); if (!el) return undefined; if (inputIsIncomplete(el)) return NaN; return parseNumOpt(el.value); }
function moneyOpt(id) { return numOpt(id); }

export function setLtrPreset(slug, el) {
  if (el) el.classList.add('slot-active');
  const m = getLtrMarket(slug);
  const rentEl = elv('l-rent');
  const vacEl  = elv('l-vac');
  const taxEl  = elv('l-tax');
  // Prefill only when the field is empty or the user hasn't edited it this session.
  if (rentEl && m.rent2br && !rentEl.dataset.userEdited) rentEl.value = Math.round(m.rent2br).toLocaleString();
  if (vacEl && m.vacancyRate != null && !vacEl.dataset.userEdited) vacEl.value = Math.round(m.vacancyRate * 100);
  const price = moneyOpt('l-price');
  if (taxEl && !taxEl.dataset.userEdited && price && m.taxRate != null) {
    taxEl.value = Math.round(price * m.taxRate).toLocaleString();
  }
}

export function analyzeLtr() {
  const price = moneyOpt('l-price');
  const rent  = moneyOpt('l-rent');
  const units = numOpt('l-units');
  const band  = propertyBand(units);

  // Rent label reflects the band (small-multifamily rent is total across all units).
  const rentLabel = elv('l-rent-label');
  if (rentLabel) rentLabel.textContent = band === '5-8' ? 'Total gross monthly rent (all units)' : 'Monthly Rent';
  const notice = elv('l-band-notice');
  if (notice) { notice.style.display = 'none'; notice.innerHTML = ''; notice.className = 'band-notice'; }

  // 9+ units = commercial: a referral, not a calculator. Skip analysis entirely.
  if (band === '9plus') {
    showLtrManualReview(units, { price, addr: elv('l-addr')?.value.trim() || '', ptype: elv('l-ptype')?.value || 'Multifamily' });
    return;
  }

  if (!price || !rent) return; // validation handled by wrapper in main.js

  const selfManage = elv('l-self-manage-toggle')?.checked;
  const input = {
    addr:  elv('l-addr')?.value.trim() || '',
    price,
    rentMo: rent,
    units,
    down:   numOpt('l-down'),
    vac:    numOpt('l-vac'),
    tax:    moneyOpt('l-tax'),
    ins:    moneyOpt('l-ins'),
    hoa:    moneyOpt('l-hoa'),
    util:   moneyOpt('l-util'),    // owner-paid utilities (annual $)
    maint:  numOpt('l-maint'),
    pm:     numOpt('l-pm'),
    selfManage,
    capex:  numOpt('l-capex'),
    rate:   numOpt('l-rate'),
    amort:  numOpt('l-amort'),
    points: numOpt('l-points'),
    cc:     numOpt('l-cc'),
    target: numOpt('l-target'),
    // Handoff sends "Multifamily" for 5+ units so it lands on CPC's "Multifamily"
    // option (CPC has no "5–8 Unit"). Display stays the "5–8 Unit" label for the user.
    ptype:  (units >= 5) ? 'Multifamily' : (elv('l-ptype')?.value || 'SFR'),
  };

  // B2: validate pre-compute — out-of-range inputs abort (no compute, no HOT, no funnel).
  const { errors, warnings } = validateInputs('ltr', input);
  if (renderInputIssues('ltr', errors, warnings)) {
    const r = elv('ltr-results'); if (r) r.style.display = 'none';
    const btn = elv('ltr-funding-btn'); if (btn) btn.innerHTML = '';
    return;
  }

  const m = computeLtr(input);
  // Post-compute soft warnings (DSCR/cap plausibility) appended to the same box.
  renderInputIssues('ltr', [], warnings.concat(plausibilityWarnings(m)));
  const { cls, verdict, vsub } = ltrVerdict(m);
  const dscrText = m.dscr === null ? 'n/a' : m.dscr.toFixed(2);
  const rateDisp = (input.rate == null ? 7.25 : input.rate) + '%';
  const pm = selfManage ? 0 : (input.pm == null ? BAND_RULES[band].pm : input.pm);
  const vacPct = input.vac == null ? BAND_RULES[band].vac : input.vac;
  const maintPct = input.maint == null ? BAND_RULES[band].maint : input.maint;
  const capexPct = input.capex == null ? BAND_RULES[band].capex : input.capex;

  // Phase A three-state insurance model ('missing' | 'explicit_zero' | 'valid'):
  // both unresolved states are NOT lender-ready and present Pending, with distinct
  // borrower-facing language. Shared decisions live in insuranceReadiness.js.
  // F-5 widens the gate to property taxes: blank taxes pend (unknown, not $0);
  // an explicit $0 tax entry computes normally per the ruled spec.
  const insStatus = insuranceStatus(input.ins);
  const tStat = taxStatus(input.tax);
  const insP = incomePresentation(tStat, insStatus); // null when income-ready → normal verdict

  elv('ltr-verdict').className = 'verdict ' + (insP ? 'warm' : cls);
  elv('lvtag').textContent   = insP ? insP.tag : cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  elv('lvlabel').textContent = insP ? insP.label : verdict;
  elv('lvsub').textContent   = insP
    ? insP.sub
    : vsub + (cls === 'hot' && m.marginOfSafety === 'tight' ? ' Strong signal, thin cushion.' : '');

  // Parity corrective: the verdict is explorable — DealFit Guidance explains
  // which of this verdict's own bars pass or fail and what moves them
  // (non-mutating modal). Hidden while income is pending, since the verdict
  // itself is pending then.
  const whatif = elv('lv-whatif');
  if (whatif) {
    whatif.style.display = insP ? 'none' : '';
    whatif.textContent = cls === 'hot' ? 'See the bars this deal clears →' : 'See what to dig into →';
  }

  const mos = mosLabel(m.marginOfSafety);
  elv('ltr-metrics').innerHTML = buildMetrics([
    { label: 'DSCR',             val: insP ? insP.pendingText : dscrText, cls: insP ? 'warn' : m.dscr === null ? 'good' : m.dscr >= 1.25 ? 'good' : m.dscr >= 1.0 ? 'warn' : 'bad' },
    { label: 'Cash-on-Cash',     val: insP ? insP.pendingText : pct(m.coc),         cls: insP ? 'warn' : cClass(m.coc, m.target, m.target * 0.6) },
    { label: 'Cap Rate',         val: insP ? insP.pendingText : pct(m.capRate),     cls: insP ? 'warn' : cClass(m.capRate, 6, 4.5) },
    { label: 'Monthly Cash Flow',val: insP ? insP.pendingText : fmt(m.cashFlowMo),  cls: insP ? 'warn' : cClass(m.cashFlowMo, 200, 0) },
    { label: 'Margin of Safety', val: insP ? insP.pendingText : mos.label,          cls: insP ? 'warn' : mos.cls },
  ]);

  const onePctPass = m.onePctRule >= 1.0;
  const rows = [
    { l: 'Gross scheduled rent (annual)',                                        v: fmt(m.rentYr) },
    { l: 'Effective gross income (' + vacPct + '% vacancy)',                     v: fmt(m.EGI) },
    { l: 'Property management' + (pm > 0 ? ' (' + pm + '%)' : ' (self)'),        v: pm > 0 ? '–' + fmt(m.EGI * (pm / 100)) : '$0' },
    { l: 'Maintenance reserve (' + maintPct + '%)', v: '–' + fmt(m.rentYr * (maintPct / 100)) },
    { l: 'Property taxes' + (tStat === INS_MISSING ? ' (not entered)' : ''),     v: tStat === INS_MISSING ? '— pending' : '–' + fmt(input.tax || 0) },
    { l: 'Insurance' + (insStatus === INS_MISSING ? ' (not entered)' : insStatus === INS_EXPLICIT_ZERO ? ' (entered $0 — confirm)' : ''), v: insStatus === INS_MISSING ? '— pending' : '–' + fmt(input.ins || 0) },
    ...((input.hoa || 0) > 0 ? [{ l: 'HOA', v: '–' + fmt((input.hoa || 0) * 12) }] : []),
    ...((input.util || 0) > 0 ? [{ l: 'Owner-paid utilities', v: '–' + fmt(input.util) }] : []),
    { l: 'Net operating income',                                                 v: insP ? insP.pendingText : fmt(m.NOI) },
    { l: 'Annual debt service (' + rateDisp + ')',                               v: '–' + fmt(m.debtYr) },
    { l: 'CapEx reserve (' + capexPct + '%, below NOI)', v: '–' + fmt(m.capexRes) },
    { l: 'Net cash flow (annual)', v: insP ? insP.pendingText : fmt(m.cashFlowYr), tot: true, color: insP ? '' : (m.cashFlowYr >= 0 ? 'var(--accent)' : 'var(--danger)') },
    { l: 'Net cash flow (monthly)',                                             v: insP ? insP.pendingText : fmt(m.cashFlowMo) },
    { l: 'DSCR (NOI ÷ debt service)',                                           v: insP ? insP.pendingText : dscrText },
    { l: 'Cap rate (NOI ÷ price)',                                              v: insP ? insP.pendingText : pct(m.capRate) },
    { l: '1% rule (rent ÷ price)',                                              v: m.onePctRule.toFixed(2) + '% ' + (onePctPass ? '· pass' : '· watch') },
    { l: 'Gross rent multiplier',                                              v: (Math.round(m.grm * 10) / 10) + 'x' },
    { l: 'Cash to close (down + points + closing)',                            v: fmt(m.cashToClose) },
    { l: 'Margin of safety (stress: rent −5%, vacancy +3pts, rate +0.5%)',     v: insP ? insP.pendingText : mos.label },
  ];
  elv('ltr-breakdown').innerHTML = buildRows(rows);

  lastLtrResult = {
    type: 'ltr', addr: input.addr, price: m.price,
    units: units || null, band,
    down: input.down == null ? BAND_RULES[band].down : input.down,
    rent, vac: vacPct, tax: input.tax || 0, taxStatus: tStat, ins: input.ins || 0, insStatus, hoa: input.hoa || 0, util: input.util || 0,
    maint: maintPct, pm, capex: capexPct,
    rate: input.rate == null ? 7.25 : input.rate, amort: input.amort == null ? 30 : input.amort,
    points: input.points == null ? 1 : input.points, cc: input.cc == null ? 2 : input.cc,
    ptype: input.ptype, target: m.target,
    rentYr: m.rentYr, EGI: m.EGI, NOI: m.NOI, capRate: m.capRate, loan: m.loan,
    debtYr: m.debtYr, capexRes: m.capexRes, cashFlowYr: m.cashFlowYr, cashFlowMo: m.cashFlowMo,
    dscr: m.dscr, downAmt: m.downAmt, cashToClose: m.cashToClose, coc: m.coc,
    onePctRule: m.onePctRule, grm: m.grm, ltv: m.ltv, marginOfSafety: m.marginOfSafety,
    verdict, cls, hot: cls === 'hot',
  };

  const r = elv('ltr-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastLtrResult);

  // Small-multifamily info banner (5–8): rent is all-units, and one vacant unit is a
  // meaningful vacancy hit. Non-blocking — the full analysis still renders above it.
  if (band === '5-8' && notice) {
    const vacOneUnit = units > 0 ? (Math.round((100 / units) * 10) / 10) : null;
    notice.style.display = 'block';
    notice.className = 'band-notice band-notice-info';
    notice.innerHTML =
      '<strong>Small multifamily (' + units + ' units).</strong> Rent above is total gross across all units. '
      + (vacOneUnit != null ? 'One vacant unit in a ' + units + '-unit building ≈ ' + vacOneUnit + '% vacancy — ' : '')
      + 'verify rent roll, leases, and stabilized occupancy.';
  }
}

// 9+ units → commercial-review referral (not a calculator). Routes the scenario to
// Clear Path with band=9plus so it lands in manual/commercial review, never rejected.
function showLtrManualReview(units, info) {
  const r = elv('ltr-results'); if (r) r.style.display = 'none';
  const fb = elv('ltr-funding-btn'); if (fb) fb.innerHTML = '';
  const notice = elv('l-band-notice');
  if (!notice) return;
  notice.style.display = 'block';
  notice.className = 'band-notice band-notice-warn';
  notice.innerHTML =
    '<div class="band-notice-title">9+ unit multifamily — commercial review</div>'
    + '<div class="band-notice-body">A ' + (units || '9+') + '-unit building is financed as a commercial multifamily deal, not a standard DSCR loan. DealFit doesn\'t auto-screen it — submit through Clear Path Capital and we\'ll route it to the right lender.</div>'
    + '<button class="btn-get-funding" id="l-manual-review-btn" type="button"><span class="funding-btn-label">Submit for Review</span></button>';
  const btn = elv('l-manual-review-btn');
  if (btn) btn.addEventListener('click', () => {
    const deal = {
      pp: info.price ? Math.round(info.price) : undefined,
      addr: info.addr || undefined,
      units: units || undefined, band: '9plus',
      ptype: 'Multifamily', purpose: 'dscr', exit: 'hold', // always MF for 9+ handoff
    };
    window.open(buildCpcUrl(deal), '_blank', 'noopener');
    if (window.showToast) window.showToast('Opening Clear Path for commercial multifamily review.');
  });
}

export function resetLtr() {
  const r = elv('ltr-results');
  if (r) r.style.display = 'none';
  const notes = elv('ltr-notes'); if (notes) notes.value = '';
  const btn = elv('ltr-funding-btn'); if (btn) btn.innerHTML = '';
  const notice = elv('l-band-notice'); if (notice) { notice.style.display = 'none'; notice.innerHTML = ''; }
  lastLtrResult = null;
}
