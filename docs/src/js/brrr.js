// ─── BRRR analyzer (Bridge acquisition → DSCR cash-out refi) ──────────────────
// Two-phase: flip-style acquisition + LTR-style DSCR hold, joined by a cash-out
// refinance. Reuses the SAME tested income engine as LTR (finance.js → computeBrrr
// → incomeBlock). Reads both FLIP_MARKETS (ARV/carry) and LTR_MARKETS (rent) for
// prefills. Mirrors ltr.js/rental.js conventions: b-* IDs, lastBrrrResult.

import { fmt, pct, cClass, buildMetrics, buildRows, parseNumOpt, renderInputIssues } from './format.js';
import { computeBrrr, brrrVerdict, mosLabel, validateInputs, plausibilityWarnings, propertyBand, BAND_RULES } from './finance.js';
import { FLIP_MARKETS, LTR_MARKETS, BRRR_ASSUMPTIONS, ALL_MARKETS } from './markets.js';
import { maybeShowFundingButton } from './clearpath.js';
import { buildCpcUrl } from './funding.js';
import { insuranceStatus, taxStatus, incomePresentation } from './insuranceReadiness.js';

const elv = id => document.getElementById(id);
function numOpt(id) { const el = elv(id); return el ? parseNumOpt(el.value) : undefined; }

function getBrrrMarket(slug) {
  const entry  = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  return {
    flip: FLIP_MARKETS[slug] || null,
    ltr:  LTR_MARKETS[slug]  || null,
    region,
  };
}

let lastBrrrResult = null;
export function getLastBrrrResult() { return lastBrrrResult; }

export function setBrrrPreset(slug, el) {
  if (el) el.classList.add('slot-active');
  const m = getBrrrMarket(slug);
  const arvEl  = elv('b-arv');
  const rentEl = elv('b-rent');
  const carryEl = elv('b-carry');
  const taxEl  = elv('b-tax');
  if (arvEl && m.flip?.medianArv && !arvEl.dataset.userEdited) arvEl.value = Math.round(m.flip.medianArv).toLocaleString();
  if (rentEl && m.ltr?.rent2br && !rentEl.dataset.userEdited) rentEl.value = Math.round(m.ltr.rent2br).toLocaleString();
  if (carryEl && m.flip?.monthlyHoldLow && !carryEl.dataset.userEdited) carryEl.value = Math.round(m.flip.monthlyHoldLow).toLocaleString();
  const arv = numOpt('b-arv');
  if (taxEl && !taxEl.dataset.userEdited && arv && m.ltr?.taxRate != null) {
    taxEl.value = Math.round(arv * m.ltr.taxRate).toLocaleString();
  }
}

export function analyzeBrrr() {
  const price = numOpt('b-price');
  const rehab = numOpt('b-rehab');
  const arv   = numOpt('b-arv');
  const rent  = numOpt('b-rent');
  const units = numOpt('b-units');
  const band  = propertyBand(units);

  // Rent label reflects the band (small-multifamily rent is total across all units).
  const rentLabel = elv('b-rent-label');
  if (rentLabel) rentLabel.textContent = band === '5-8' ? 'Total gross monthly rent (all units)' : 'Monthly Rent';
  const notice = elv('b-band-notice');
  if (notice) { notice.style.display = 'none'; notice.innerHTML = ''; notice.className = 'band-notice'; }

  // 9+ units = commercial: a referral, not a calculator. Skip analysis entirely.
  if (band === '9plus') {
    showBrrrManualReview(units, { price, addr: elv('b-addr')?.value.trim() || '', ptype: elv('b-ptype')?.value || 'Multifamily' });
    return;
  }

  if (!price || !rehab || !arv || !rent) return; // validation handled in main.js

  const selfManage = elv('b-self-manage-toggle')?.checked;
  const input = {
    addr: elv('b-addr')?.value.trim() || '',
    price, rehab, arv, rent,
    units,
    contingency: numOpt('b-contingency'),
    cc:    numOpt('b-cc'),
    hold:  numOpt('b-hold'),
    carry: numOpt('b-carry'),
    acqLoan:   numOpt('b-acqloan'),
    acqRate:   numOpt('b-acqrate'),
    acqPoints: numOpt('b-acqpoints'),
    refiLtv:   numOpt('b-refiltv'),
    refiRate:  numOpt('b-refirate'),
    refiAmort: numOpt('b-refiamort'),
    reficost:  numOpt('b-reficost'),
    season:    numOpt('b-season'),
    vac:   numOpt('b-vac'),
    tax:   numOpt('b-tax'),
    ins:   numOpt('b-ins'),
    hoa:   numOpt('b-hoa'),
    maint: numOpt('b-maint'),
    pm:    numOpt('b-pm'),
    selfManage,
    capex: numOpt('b-capex'),
    targetDscr: numOpt('b-targetdscr'),
    // Handoff sends "Multifamily" for 5+ units so it lands on CPC's "Multifamily"
    // option (CPC has no "5–8 Unit"). Display stays the "5–8 Unit" label for the user.
    ptype: (units >= 5) ? 'Multifamily' : (elv('b-ptype')?.value || 'SFR'),
  };

  // B2: validate pre-compute — out-of-range inputs abort (no compute, no HOT, no funnel).
  const { errors, warnings } = validateInputs('brrr', input);
  if (renderInputIssues('brrr', errors, warnings)) {
    const r = elv('brrr-results'); if (r) r.style.display = 'none';
    const btn = elv('brrr-funding-btn'); if (btn) btn.innerHTML = '';
    return;
  }

  const m = computeBrrr(input);
  renderInputIssues('brrr', [], warnings.concat(plausibilityWarnings(m)));
  const { cls, verdict, vsub } = brrrVerdict(m);
  const dscrText = m.dscr === null ? 'n/a' : m.dscr.toFixed(2);
  const cocText  = m.postRefiCoC === Infinity ? '∞ (capital fully recovered)' : pct(m.postRefiCoC);
  const refiRate = (input.refiRate == null ? 7.0 : input.refiRate) + '%';
  const refiLtvPct = input.refiLtv == null ? 75 : input.refiLtv;
  const cont = input.contingency == null ? 15 : input.contingency;
  const capexPct = input.capex == null ? BAND_RULES[band].capex : input.capex;

  // Seasoning warning chip (non-blocking).
  const seasonWarn = (input.season != null && input.season < (BRRR_ASSUMPTIONS.seasoningMonthsLow || 6));

  // Phase A three-state insurance model ('missing' | 'explicit_zero' | 'valid'):
  // both unresolved states are NOT lender-ready and present Pending, with distinct
  // borrower-facing language. Shared decisions live in insuranceReadiness.js.
  // F-5 widens the gate to property taxes: blank taxes pend (unknown, not $0);
  // an explicit $0 tax entry computes normally per the ruled spec.
  const insStatus = insuranceStatus(input.ins);
  const tStat = taxStatus(input.tax);
  const insP = incomePresentation(tStat, insStatus); // null when income-ready → normal verdict

  elv('brrr-verdict').className = 'verdict ' + (insP ? 'warm' : cls);
  elv('bvtag').textContent   = insP ? insP.tag : cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  elv('bvlabel').textContent = insP ? insP.label : verdict;
  elv('bvsub').textContent   = insP
    ? insP.sub
    : vsub + (cls === 'hot' && m.marginOfSafety === 'tight' ? ' Strong signal, thin cushion.' : '') + (seasonWarn ? '  ⚠ Most DSCR cash-out needs 6mo title seasoning.' : '');

  const capInvested = m.cashInvested || 1;
  const mos = mosLabel(m.marginOfSafety);
  elv('brrr-metrics').innerHTML = buildMetrics([
    { label: 'DSCR (post-refi)',    val: insP ? insP.pendingText : dscrText, cls: insP ? 'warn' : m.dscr === null ? 'good' : m.dscr >= 1.25 ? 'good' : m.dscr >= 1.0 ? 'warn' : 'bad' },
    { label: 'Capital Left In Deal',val: fmt(m.capitalLeft),      cls: m.capitalLeft <= 0.25 * capInvested ? 'good' : m.capitalLeft <= 0.5 * capInvested ? 'warn' : 'bad' },
    { label: 'Cash Recovered',      val: pct(m.cashRecoveredPct), cls: cClass(m.cashRecoveredPct, 75, 40) },
    { label: 'Monthly Cash Flow',   val: insP ? insP.pendingText : fmt(m.cashFlowMo),       cls: insP ? 'warn' : cClass(m.cashFlowMo, 150, 0) },
    { label: 'Margin of Safety',    val: insP ? insP.pendingText : mos.label,               cls: insP ? 'warn' : mos.cls },
  ]);

  const rows = [
    { l: '— Acquisition —', v: '', tot: true },
    { l: 'Purchase price',                          v: fmt(m.price) },
    { l: 'Rehab + contingency (' + cont + '%)',     v: '–' + fmt(m.rehabTotal) },
    { l: 'Purchase costs (' + (input.cc == null ? 2 : input.cc) + '%)', v: '–' + fmt(m.purchCosts) },
    { l: 'Holding costs (' + (input.hold == null ? 6 : input.hold) + ' mo)', v: '–' + fmt(m.carryTotal) },
    ...(m.acqLoan > 0 ? [{ l: 'Bridge interest + points', v: '–' + fmt(m.acqInterest + m.acqFees) }] : []),
    { l: 'All-in cost basis', v: fmt(m.allInCost), tot: true },
    { l: 'Cash invested (all-in − bridge loan)',    v: fmt(m.cashInvested) },
    { l: '— Refinance —', v: '', tot: true },
    { l: 'ARV',                                     v: fmt(m.arv) },
    { l: 'New loan @ ' + refiLtvPct + '% LTV',      v: fmt(m.refiLoan) },
    { l: 'Refi costs (' + (input.reficost == null ? 3 : input.reficost) + '%)', v: '–' + fmt(m.refiCosts) },
    ...(m.acqPayoff > 0 ? [{ l: 'Bridge payoff', v: '–' + fmt(m.acqPayoff) }] : []),
    { l: 'Cash out at refi',                        v: fmt(m.cashOut) },
    { l: 'Capital left in deal', v: fmt(m.capitalLeft), tot: true, color: m.capitalLeft <= 0 ? 'var(--accent)' : 'var(--danger)' },
    { l: 'Cash recovered',                          v: pct(m.cashRecoveredPct) },
    { l: 'Equity created (ARV − all-in)',           v: fmt(m.equityCreated) },
    { l: '— Hold (post-refi) —', v: '', tot: true },
    { l: 'Net operating income',                    v: insP ? insP.pendingText : fmt(m.NOI) },
    { l: 'Annual debt service (refi, ' + refiRate + ')', v: '–' + fmt(m.refiDebtYr) },
    { l: 'CapEx reserve (' + capexPct + '%, below NOI)', v: '–' + fmt(m.capexRes) },
    { l: 'Net cash flow (annual)', v: insP ? insP.pendingText : fmt(m.cashFlowYr), tot: true, color: insP ? '' : (m.cashFlowYr >= 0 ? 'var(--accent)' : 'var(--danger)') },
    { l: 'DSCR (NOI ÷ refi debt)',                  v: insP ? insP.pendingText : dscrText },
    { l: 'Cap rate (NOI ÷ all-in)',                 v: insP ? insP.pendingText : pct(m.capRate) },
    { l: 'Post-refi cash-on-cash',                  v: insP ? insP.pendingText : cocText },
    { l: 'Margin of safety (stress: ARV −5%, rent −5%)', v: insP ? insP.pendingText : mos.label },
  ];
  elv('brrr-breakdown').innerHTML = buildRows(rows);

  lastBrrrResult = {
    type: 'brrr', addr: input.addr,
    units: units || null, band,
    price: m.price, rehab, arv: m.arv,
    contingency: cont, cc: input.cc == null ? 2 : input.cc, hold: input.hold == null ? 6 : input.hold,
    carry: input.carry == null ? 600 : input.carry, acqLoan: m.acqLoan,
    acqRate: input.acqRate == null ? 10 : input.acqRate, acqPoints: input.acqPoints == null ? 2 : input.acqPoints,
    refiLtv: refiLtvPct, refiRate: input.refiRate == null ? 7.0 : input.refiRate, refiAmort: input.refiAmort == null ? 30 : input.refiAmort,
    reficost: input.reficost == null ? 3 : input.reficost, season: input.season == null ? 6 : input.season,
    rent, vac: input.vac == null ? BAND_RULES[band].vac : input.vac, tax: input.tax || 0, taxStatus: tStat, ins: input.ins || 0, insStatus, hoa: input.hoa || 0,
    maint: input.maint == null ? BAND_RULES[band].maint : input.maint, pm: selfManage ? 0 : (input.pm == null ? BAND_RULES[band].pm : input.pm),
    capex: capexPct, ptype: input.ptype,
    rehabTotal: m.rehabTotal, allInCost: m.allInCost, cashInvested: m.cashInvested,
    refiLoan: m.refiLoan, refiCosts: m.refiCosts, cashOut: m.cashOut, capitalLeft: m.capitalLeft,
    cashRecoveredPct: m.cashRecoveredPct, equityCreated: m.equityCreated,
    NOI: m.NOI, refiDebtYr: m.refiDebtYr, capexRes: m.capexRes, cashFlowYr: m.cashFlowYr, cashFlowMo: m.cashFlowMo,
    dscr: m.dscr, capRate: m.capRate, postRefiCoC: m.postRefiCoC, ltv: m.refiLTVactual / 100,
    marginOfSafety: m.marginOfSafety,
    verdict, cls, hot: cls === 'hot',
  };

  const r = elv('brrr-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastBrrrResult);

  // Small-multifamily info banner (5–8): rent is all-units; one vacant unit is a
  // meaningful vacancy hit on the post-refi hold. Non-blocking.
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
function showBrrrManualReview(units, info) {
  const r = elv('brrr-results'); if (r) r.style.display = 'none';
  const fb = elv('brrr-funding-btn'); if (fb) fb.innerHTML = '';
  const notice = elv('b-band-notice');
  if (!notice) return;
  notice.style.display = 'block';
  notice.className = 'band-notice band-notice-warn';
  notice.innerHTML =
    '<div class="band-notice-title">9+ unit multifamily — commercial review</div>'
    + '<div class="band-notice-body">A ' + (units || '9+') + '-unit building is financed as a commercial multifamily deal, not a standard BRRRR/DSCR loan. DealFit doesn\'t auto-screen it — submit through Clear Path Capital and we\'ll route it to the right lender.</div>'
    + '<button class="btn-get-funding" id="b-manual-review-btn" type="button"><span class="funding-btn-label">Submit for Review</span></button>';
  const btn = elv('b-manual-review-btn');
  if (btn) btn.addEventListener('click', () => {
    const deal = {
      pp: info.price ? Math.round(info.price) : undefined,
      addr: info.addr || undefined,
      units: units || undefined, band: '9plus',
      ptype: 'Multifamily', purpose: 'brrr', exit: 'brrr', // always MF for 9+ handoff
    };
    window.open(buildCpcUrl(deal), '_blank', 'noopener');
    if (window.showToast) window.showToast('Opening Clear Path for commercial multifamily review.');
  });
}

export function resetBrrr() {
  const r = elv('brrr-results');
  if (r) r.style.display = 'none';
  const notes = elv('brrr-notes'); if (notes) notes.value = '';
  const btn = elv('brrr-funding-btn'); if (btn) btn.innerHTML = '';
  const notice = elv('b-band-notice'); if (notice) { notice.style.display = 'none'; notice.innerHTML = ''; }
  lastBrrrResult = null;
}
