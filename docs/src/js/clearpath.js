// ─── Clear Path Capital integration ──────────────────────────────────────────

import { getActiveTier } from './tiers.js';
import { getDeals } from './storage.js';
import { buildCpcUrl, qualifiesForCpc, qualifiesForCpcLtr, qualifiesForCpcBrrr, CPC_BROKER_MIN, propertyBand, BAND_RULES } from './funding.js';
import { resultInsuranceStatus, insuranceReady, insuranceSummaryWarning, insurancePresentation, resultTaxStatus, taxReady, incomePresentation, incomeDependentHandoff, taxSummaryWarning, strExpensePresentation, strExpenseSummaryWarning, INS_MISSING, INS_EXPLICIT_ZERO } from './insuranceReadiness.js';

const BTN_IDS = { flip: 'flip-funding-btn', rental: 'rental-funding-btn', ltr: 'ltr-funding-btn', brrr: 'brrr-funding-btn' };

// ─── Parse "City ST" off the end of a freeform address (item 11a) ────────────
// e.g. "412 Oak St, Charlotte NC 28202" → { city: 'Charlotte', state: 'NC' }
// Tolerates a trailing ZIP and only accepts a real US state code (so street
// suffixes like "St"/"Dr"/"Rd" don't get mistaken for a state).
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
function parseCityState(addr) {
  if (!addr) return {};
  const m = addr.trim().match(/([A-Za-z .'-]+?)[ ,]+([A-Za-z]{2})(?:[ ,]+\d{5}(?:-\d{4})?)?$/);
  if (!m) return {};
  const state = m[2].toUpperCase();
  if (!US_STATES.has(state)) return {};   // reject "St"/"Dr"/"Rd"… — only real states
  return { city: m[1].trim(), state };
}

// ─── Carry the screener's economics into the CPC handoff (LTR/BRRR income deals) ──
// so CPC DISPLAYS the operator-view math rather than re-deriving a conflicting one.
// r already holds everything (lastLtrResult/lastBrrrResult) — pass through, no recompute.
// HOA is MONTHLY here; CPC's field is annual and converts ×12 on receipt.
function econHandoff(r) {
  const n = (v, round) => (v == null ? undefined : (round ? Math.round(v) : v));
  // Phase A: unresolved insurance ('missing' OR 'explicit_zero') omits the insurance
  // value AND every insurance-dependent screener metric (NOI, DSCR, cash flow, cap
  // rate, verdict) — one shared decision (insuranceReadiness.js), so BOTH unresolved
  // states produce the IDENTICAL omission set. With screenerDscr absent, CPC's
  // existing missing-data guard (gated on screenerDscr > 0, page.tsx) fires and shows
  // "Pending — incomplete". Raw rent/taxes/HOA and the % assumptions still travel
  // (not insurance-contaminated); src/tier attribution is in buildCpcUrl, untouched.
  // F-5: the tax gate joins the insurance gate — blank taxes omit annualTaxes AND
  // the same screener-metric set (a blank field never ships a fabricated $0).
  const incomeFields = incomeDependentHandoff(r);
  return {
    monthlyRent: n(r.rent, true),
    annualTaxes: incomeFields.annualTaxes,
    annualInsurance: incomeFields.annualInsurance,
    monthlyHoa: n(r.hoa, true),
    vacancyPct: n(r.vac),
    pmPct: n(r.pm),
    maintPct: n(r.maint),
    capexPct: n(r.capex),
    screenerNoi: incomeFields.screenerNoi,
    screenerDscr: incomeFields.screenerDscr,
    screenerCashFlowAnnual: incomeFields.screenerCashFlowAnnual,
    screenerCashFlowMonthly: incomeFields.screenerCashFlowMonthly,
    screenerCapRate: incomeFields.screenerCapRate,
    screenerVerdict: incomeFields.screenerVerdict,
  };
}

// ─── Normalize an analyzer result into the CPC deal-param object ──────────────
// Numbers raw integers (no commas/$). Address passed whole — URLSearchParams encodes.
function buildDealParams(r) {
  const { city, state } = parseCityState(r.addr);
  if (r.type === 'flip') {
    const cost = (r.ask || 0) + (r.rep || 0);
    // F-10 (A-Aron ruled — subtraction, not addition): the handoff carries the
    // user's RAW requested loan, uncapped. CPC recomputes LTC/LTV from raw inputs
    // and adopts no DS result (Run 4 proved the derived keys absent from the
    // contract by design); CPC's own ratified behavior preserves an oversized
    // request while its Estimated Max Loan governs sizing. A BLANK loan stays the
    // semantic fact "no user-requested loan supplied": the loan key is OMITTED
    // from the URL (CPC's prefill skips falsy param values and sizingLoan falls
    // back to CPC's own estimated max) — never a fabricated maxBox or 0. The ltc
    // field below has never been a serialized key (buildCpcUrl's map carries ltv,
    // not ltc) — it is gate input only. Box ELIGIBILITY is still judged at the
    // box-eligible size via the gate-only fields below, so the on-screen funding
    // area is unchanged; gateLoan/gateLtc are likewise never serialized. Net
    // contract delta: entered-loan handoffs keep the banked 11-key shape exactly;
    // blank-loan handoffs drop exactly one key (loan).
    const maxBox = Math.round(Math.min(0.90 * cost, r.arv ? 0.70 * r.arv : Infinity));
    const rawLoan = (r.loan && r.loan > 0) ? Math.round(r.loan) : undefined;
    const gateLoan = rawLoan !== undefined ? Math.min(rawLoan, maxBox) : maxBox;
    return {
      pp:      Math.round(r.ask || 0),
      rehab:   Math.round(r.rep || 0),
      arv:     Math.round(r.arv || 0),
      loan:    rawLoan,
      ltc:     rawLoan !== undefined && cost ? rawLoan / cost : undefined,
      gateLoan,
      gateLtc: cost ? gateLoan / cost : undefined,
      addr:    r.addr || undefined,
      city, state,
      purpose: 'flip',
      exit:    'sale',
    };
  }
  if (r.type === 'ltr') {
    // DSCR / Long-Term Rental — LTV-priced (not LTC). SPEC_LTR §6b.
    const downPct = (r.down || 20) / 100;
    const loan = Math.round((r.price || 0) * (1 - downPct));
    return {
      pp:      Math.round(r.price || 0),
      loan,
      ltv:     r.price ? loan / r.price : undefined,
      dscr:    incomeDependentHandoff(r).dscr,  // Phase A + F-5: unresolved insurance OR blank taxes omit the base dscr (mirrors econHandoff's screenerDscr gate)
      ptype:   r.ptype || 'SFR',
      units:   r.units || undefined,
      band:    r.band || propertyBand(r.units),
      ...econHandoff(r),
      loanRate: r.rate, amortYears: r.amort, pointsPct: r.points, closingPct: r.cc,
      addr:    r.addr || undefined,
      city, state,
      purpose: 'dscr',                 // → CPC "DSCR / Rental Hold"
      exit:    'hold',                 // → CPC "Rental Hold"
    };
  }
  if (r.type === 'brrr') {
    // BRRR — lead with the refi takeout (the bigger CPC product). SPEC_BRRR §6.
    return {
      pp:      Math.round(r.price || 0),
      rehab:   Math.round(r.rehabTotal || 0),
      arv:     Math.round(r.arv || 0),
      loan:    Math.round(r.refiLoan || 0),     // DSCR cash-out takeout
      ltv:     r.arv ? (r.refiLoan || 0) / r.arv : undefined,
      dscr:    incomeDependentHandoff(r).dscr,  // Phase A + F-5: unresolved insurance OR blank taxes omit the base dscr (mirrors econHandoff's screenerDscr gate)
      ptype:   r.ptype || 'SFR',
      units:   r.units || undefined,
      band:    r.band || propertyBand(r.units),
      ...econHandoff(r),
      loanRate: r.refiRate, amortYears: r.refiAmort, closingPct: r.reficost,
      addr:    r.addr || undefined,
      city, state,
      purpose: 'brrr',                 // → CPC "DSCR / Rental Hold"
      exit:    'brrr',                 // → CPC "BRRRR"
    };
  }
  // Rental — STR is the active rental product
  const downPct = (r.down || 20) / 100;
  const loan = Math.round((r.price || 0) * (1 - downPct));
  return {
    pp:      Math.round(r.price || 0),
    loan,
    ltc:     r.price ? loan / r.price : undefined,
    addr:    r.addr || undefined,
    city, state,
    purpose: 'str',
    exit:    'hold',
  };
}

// Route to the right CPC box by deal type (flip/str = LTC box; ltr/brrr = DSCR box).
// F-10: flip eligibility is judged at the box-eligible size (gate-only fields) so
// the on-screen funding area is unchanged; only the transmitted URL carries raw.
function qualifiesForType(type, deal) {
  if (type === 'ltr') return qualifiesForCpcLtr(deal);
  if (type === 'brrr') return qualifiesForCpcBrrr(deal);
  return qualifiesForCpc({
    loan: deal.gateLoan !== undefined ? deal.gateLoan : deal.loan,
    ltc:  deal.gateLtc  !== undefined ? deal.gateLtc  : deal.ltc,
    arv:  deal.arv,
  });
}

// ─── Tier-aware button config ─────────────────────────────────────────────────

function getTierConfig() {
  // B6b — neutral funding CTA across ALL tiers: the user-facing label/toast make
  // no tier-conditioned claims about loan treatment (the old paid-benefit button
  // copy was removed then; the Wave 5 tier/funding-law suite now pins the whole
  // app). The tier still flows internally for tracking — via the per-tier tag
  // (clipboard summary) and the `tier` query param in buildCpcUrl (→ HubSpot).
  const tier = getActiveTier();
  const tagByTier = { pro: '[Pro Submission]', investor: '[Investor Submission]' };
  return {
    // CTA simplification (owner decision 2026-09-05): the button label no longer
    // carries a "— Clear Path Capital" suffix or the CPC mark — see getFundingLabel.
    tag:   tagByTier[tier] || '[Starter Submission]',
    toast: 'Form pre-filled on the Clear Path page — review and submit. Summary also copied as backup.',
  };
}

// ─── Summary builders ─────────────────────────────────────────────────────────

function buildFlipSummary(r, tag) {
  const lines = [
    'DEAL SCREENER SUMMARY — Fix & Flip',
    r.addr ? 'Address: ' + r.addr : null,
    'Verdict: ' + r.verdict,
    tag,
    '---',
    'Purchase Price: $' + Math.round(r.ask).toLocaleString(),
    'After Repair Value (ARV): $' + Math.round(r.arv).toLocaleString(),
    'Rehab / Repair Costs: $' + Math.round(r.rep).toLocaleString(),
    'Net Projected Profit (est.): $' + Math.round(r.profit).toLocaleString(),
    'Projected ROI (est.): ' + (Math.round(r.roi * 10) / 10) + '%',
    (r.financed ? 'Estimated Loan Request: $' + Math.round(r.loan).toLocaleString() : null),
    (r.ltvLabel || 'Price / ARV') + ': ' + (Math.round((r.ltv || 0) * 10) / 10) + '%',
    (r.financed && r.ltc ? 'LTC: ' + (Math.round(r.ltc * 10) / 10) + '%' : null),
    'Hold Period: ' + r.hold + ' months',
    r.self ? 'Self-performing renovation: Yes' : null,
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. Actual terms set by the lender.',
    'Generated by DealFit — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildRentalSummary(r, tag) {
  // F-6 (verification round): the clipboard summary is decision data that travels
  // with the funding click — it pends with the analyzer when the combined
  // taxes+insurance field is blank, exactly as the LTR/BRRR summaries do. No
  // confident verdict or finite expense-dependent figure on a manufactured $0.
  const tStat = resultTaxStatus(r);
  const strP = strExpensePresentation(tStat);
  const expOk = !strP;
  const lines = [
    'DEAL SCREENER SUMMARY — STR / Rental',
    r.addr ? 'Address: ' + r.addr : null,
    'Verdict: ' + (expOk ? r.verdict : strP.label),
    tag,
    strExpenseSummaryWarning(tStat),
    '---',
    'Purchase Price: $' + Math.round(r.price).toLocaleString(),
    'Potential Annual Revenue (100% occ.): $' + Math.round(r.rent).toLocaleString(),
    'Cash-on-Cash Return (est.): ' + (expOk ? (Math.round(r.coc * 10) / 10) + '%' : 'Pending'),
    'Cap Rate (est.): ' + (expOk ? (Math.round(r.capRate * 10) / 10) + '%' : 'Pending'),
    (expOk ? (r.dscr ? 'DSCR (est.): ' + r.dscr.toFixed(2) : null) : 'DSCR (est.): Pending'),
    'Annual Cash Flow (est.): ' + (expOk ? '$' + Math.round(r.cashflow).toLocaleString() : 'Pending'),
    'Down Payment: ' + r.down + '%',
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. Actual terms set by the lender.',
    'Generated by DealFit — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildLtrSummary(r, tag) {
  const insStatus = resultInsuranceStatus(r);
  const tStat = resultTaxStatus(r);
  const insOk = insuranceReady(insStatus) && taxReady(tStat); // F-5: taxes join the gate
  const lines = [
    'DEAL SCREENER SUMMARY — Long-Term Rental (DSCR)',
    r.addr ? 'Address: ' + r.addr : null,
    'Verdict: ' + (insOk ? r.verdict : incomePresentation(tStat, insStatus).label),
    tag,
    taxSummaryWarning(tStat),
    insuranceSummaryWarning(insStatus),
    '---',
    'Property Type: ' + (r.ptype || 'SFR'),
    (r.band === '5-8'
      ? 'Units: ' + (r.units || '5–8') + '   |   Financing Band: Small Multifamily DSCR (5–8 units)'
      : (r.units && r.units > 1 ? 'Units: ' + r.units : null)),
    'Purchase Price: $' + Math.round(r.price).toLocaleString(),
    'Monthly Rent: $' + Math.round(r.rent).toLocaleString() + '   (Annual Gross: $' + Math.round(r.rentYr).toLocaleString() + ')',
    'Vacancy: ' + r.vac + '%',
    'Net Operating Income (est.): ' + (insOk ? '$' + Math.round(r.NOI).toLocaleString() : 'Pending'),
    'DSCR (est.): ' + (insOk ? (r.dscr != null ? r.dscr.toFixed(2) : 'n/a') : 'Pending'),
    'Cap Rate (est.): ' + (insOk ? (Math.round(r.capRate * 10) / 10) + '%' : 'Pending'),
    'Monthly Cash Flow (est.): ' + (insOk ? '$' + Math.round(r.cashFlowMo).toLocaleString() + '   (Annual: $' + Math.round(r.cashFlowYr).toLocaleString() + ')' : 'Pending'),
    'Cash-on-Cash (est.): ' + (insOk ? (Math.round(r.coc * 10) / 10) + '%' : 'Pending'),
    'Down Payment: ' + r.down + '%   |   LTV (est.): ' + (Math.round(r.ltv * 10) / 10) + '%',
    'Estimated Loan Request: $' + Math.round(r.loan).toLocaleString(),
    'Assumed Rate / Amortization: ' + r.rate + '% / ' + r.amort + ' yr',
    'Property Taxes (annual): ' + (tStat === INS_MISSING ? 'Pending' : '$' + Math.round(r.tax).toLocaleString()) + '   Insurance (annual): ' + (insStatus === INS_MISSING ? 'Pending' : insStatus === INS_EXPLICIT_ZERO ? '$0 — confirm' : '$' + Math.round(r.ins).toLocaleString()),
    (r.util > 0 ? 'Owner-Paid Utilities (annual): $' + Math.round(r.util).toLocaleString() : null),
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. DSCR and final terms are set by the lender. Clear Path Capital is a broker.',
    'Generated by DealFit — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildBrrrSummary(r, tag) {
  const { city, state } = parseCityState(r.addr);
  const cs = [city, state].filter(Boolean).join(', ');
  const insStatus = resultInsuranceStatus(r);
  const tStat = resultTaxStatus(r);
  const insOk = insuranceReady(insStatus) && taxReady(tStat); // F-5: taxes join the gate
  const lines = [
    'DEAL SCREENER SUMMARY — BRRRR (Bridge → DSCR Cash-Out Refi)',
    r.addr ? 'Address: ' + r.addr : null,
    cs ? 'City/State: ' + cs : null,
    'Verdict: ' + (insOk ? r.verdict : incomePresentation(tStat, insStatus).label),
    tag,
    taxSummaryWarning(tStat),
    insuranceSummaryWarning(insStatus),
    '--- ACQUISITION (bridge / hard money) ---',
    'Property Type: ' + (r.ptype || 'SFR'),
    (r.band === '5-8'
      ? 'Units: ' + (r.units || '5–8') + '   |   Financing Band: Small Multifamily DSCR (5–8 units)'
      : (r.units && r.units > 1 ? 'Units: ' + r.units : null)),
    'Purchase Price: $' + Math.round(r.price).toLocaleString(),
    'Rehab (incl. contingency): $' + Math.round(r.rehabTotal).toLocaleString(),
    'ARV: $' + Math.round(r.arv).toLocaleString(),
    'All-in Cost Basis (est.): $' + Math.round(r.allInCost).toLocaleString(),
    'Cash Invested (est.): $' + Math.round(r.cashInvested).toLocaleString(),
    (r.acqLoan > 0 ? 'Acquisition Loan Requested (est.): $' + Math.round(r.acqLoan).toLocaleString() : null),
    '--- REFINANCE (DSCR cash-out takeout) ---',
    'Refi Loan @ ' + r.refiLtv + '% LTV (est.): $' + Math.round(r.refiLoan).toLocaleString(),
    'DSCR (est.): ' + (insOk ? (r.dscr != null ? r.dscr.toFixed(2) : 'n/a') : 'Pending'),
    'Cash Out at Refi (est.): $' + Math.round(r.cashOut).toLocaleString(),
    'Capital Left In Deal (est.): $' + Math.round(r.capitalLeft).toLocaleString(),
    'Cash Recovered (est.): ' + (Math.round(r.cashRecoveredPct * 10) / 10) + '%',
    '--- HOLD ---',
    'Monthly Rent: $' + Math.round(r.rent).toLocaleString(),
    (r.util > 0 ? 'Owner-Paid Utilities (annual): $' + Math.round(r.util).toLocaleString() : null),
    'NOI (est.): ' + (insOk ? '$' + Math.round(r.NOI).toLocaleString() : 'Pending'),
    'Monthly Cash Flow (est.): ' + (insOk ? '$' + Math.round(r.cashFlowMo).toLocaleString() : 'Pending'),
    'Cap Rate on cost (est.): ' + (insOk ? (Math.round(r.capRate * 10) / 10) + '%' : 'Pending'),
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. Two-stage financing (bridge + DSCR refinance); final terms set by the lender. Clear Path Capital is a broker.',
    'Generated by DealFit — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function summaryFor(type, r, tag) {
  if (type === 'flip') return buildFlipSummary(r, tag);
  if (type === 'ltr')  return buildLtrSummary(r, tag);
  if (type === 'brrr') return buildBrrrSummary(r, tag);
  return buildRentalSummary(r, tag);
}

// ─── Determine if button should show and what copy to use ────────────────────
// Item 2: funding only on hot/warm verdicts — walk-away never shows a button
function shouldShowFunding(result) {
  return result.cls === 'hot' || result.cls === 'warm';
}

// Item 6: true when the ONLY reason a deal misses its CPC box is loan < the CPC
// brokering minimum. This case gets the inactive Get Funding button with the
// referral-floor caption (the deal is fully analyzed; only the handoff is
// unavailable), while every other miss keeps its specific outsideBoxHTML reason.
function belowMinimumOnly(type, deal) {
  const band = deal.band || '1-4';
  if (band === '9plus') return false;                  // 9+ is a manual-review case, not below-min
  // F-10: judge at the box-eligible size (gate fields; LTR/BRRR carry none and
  // fall through to their derived loan unchanged).
  const loan = deal.gateLoan !== undefined ? deal.gateLoan : deal.loan;
  if (!loan || loan >= CPC_BROKER_MIN) return false;   // must be genuinely under the minimum
  if (type === 'ltr' || type === 'brrr') {           // DSCR box: band LTV ceiling, DSCR ≥ 1.0
    const maxLtv = (BAND_RULES[band] || BAND_RULES['1-4']).maxLtv;
    if (deal.ltv !== undefined && deal.ltv > maxLtv) return false;
    if (deal.dscr !== undefined && deal.dscr < 1.0) return false;
    return true;
  }
  const ltc = deal.gateLtc !== undefined ? deal.gateLtc : deal.ltc;
  if (ltc !== undefined && ltc > 0.90) return false;   // flip/bridge box
  if (deal.arv && loan / deal.arv > 0.70) return false;
  return true;
}

function fundingNote(msg) {
  return `<div class="funding-underbox">${msg}</div>`;
}

// Always returns a specific reason — never ''. Covers every way a hot/warm deal can
// miss the CPC box, so the funding area is never blank on a hot/warm verdict (B1).
function outsideBoxHTML(type, deal) {
  const { ltv, dscr } = deal;
  // F-10: reasons are judged at the box-eligible size, same as the gate.
  const loan = deal.gateLoan !== undefined ? deal.gateLoan : deal.loan;
  const band = deal.band || '1-4';

  // 9+ units = commercial: never auto-rejected — routed to manual CPC review.
  if (band === '9plus') {
    return fundingNote("9+ unit multifamily is reviewed as a commercial deal, not auto-screened here. Submit through Clear Path Capital and we'll route it to the right lender.");
  }
  if (!loan || loan <= 0) {
    return fundingNote("All-cash scenario — no financing requested, so there's nothing to submit. Add a loan amount to screen it against the Clear Path box.");
  }
  if (type === 'ltr' || type === 'brrr') {
    const maxLtv = (BAND_RULES[band] || BAND_RULES['1-4']).maxLtv;
    if (ltv !== undefined && ltv > maxLtv)
      return fundingNote(`Estimated LTV ${Math.round(ltv * 100)}% exceeds the ${Math.round(maxLtv * 100)}% ${band === '5-8' ? 'small-multifamily ' : ''}DSCR ceiling — raise the down payment (or lower the refi LTV) to fit the box.`);
    if (dscr !== undefined && dscr < 1.0)
      return fundingNote(`DSCR ${(+dscr).toFixed(2)} is below 1.0 — rent doesn't cover the debt at this structure. Raise rent or lower the loan to fit the box.`);
  } else {
    const ltcEff = deal.gateLtc !== undefined ? deal.gateLtc : deal.ltc;
    if (ltcEff !== undefined && ltcEff > 0.90)
      return fundingNote(`Estimated LTC ${Math.round(ltcEff * 100)}% exceeds the 90% loan-to-cost ceiling — lower the loan to fit the box.`);
    if (deal.arv && loan / deal.arv > 0.70)
      return fundingNote(`Estimated loan is over 70% of ARV — lower the loan to fit the box.`);
  }
  // Below-minimum: reached only when a fit reason above did not already apply
  // (the pure below-min case renders the inactive button instead — see
  // renderBelowMinFundingHTML). Kept as a defensive branch so a combined miss
  // still explains itself if the fit checks ever pass it through.
  if (loan < CPC_BROKER_MIN) {
    return fundingNote(`Clear Path Capital brokers private-money loans from $100K, and this deal's estimated loan (~$${Math.round(loan / 1000)}K) is below that minimum — the analysis above still applies.`);
  }
  // Catch-all so a hot/warm verdict is NEVER blank.
  return fundingNote("This scenario sits just outside the Clear Path box as entered — adjust the loan, LTV, or DSCR and re-run, or contact Clear Path to review it.");
}

// ─── Below-brokering-minimum treatment: inactive button + referral caption ────
// The screener analyzes and grades every deal regardless of size; CPC's $100K
// minimum is a referral threshold. Below it the Get Funding button renders
// INACTIVE with a short caption saying why — CPC is not declining the deal and
// no approval or terms are implied; the handoff is simply not available at this
// loan size.
function renderBelowMinFundingHTML(type, cfg, cls, deal) {
  const btnLabel = getFundingLabel(type, cls, deal.band);
  // F-10: the caption names the box-eligible (estimated) loan — with a blank loan
  // field there is no raw request to name, exactly as before this fix.
  const k = Math.round(((deal.gateLoan !== undefined ? deal.gateLoan : deal.loan) || 0) / 1000);
  return `
    <button class="btn-get-funding" disabled aria-disabled="true" title="Clear Path Capital brokers loans from $100K">
      <span class="funding-btn-label">${btnLabel}</span>
    </button>
    <div style="font-size:11px;color:#9aa4b2;margin-top:6px;line-height:1.45">Clear Path Capital brokers private-money loans from $100K. This deal's estimated loan (~$${k}K) is below that minimum, so the Clear Path handoff isn't available for it — the analysis above is unaffected.</div>`;
}

// Type-aware CTA label — ONE short, deal-specific phrase per analyzer (owner
// decision 2026-09-05): no CPC mark, no "— Clear Path Capital" suffix, no
// hot/warm wording split. The only variant kept is a real financing-product
// distinction: 5–8 units route to the Small Multifamily DSCR product. Routing,
// handoff payloads, and qualification gates are untouched — this is label copy.
// `cls` stays in the signature so callers keep one call shape.
export function getFundingLabel(type, cls, band) {
  const sm = band === '5-8';
  // 5–8 units: the handoff already types these as "Multifamily"; the shorter
  // product word keeps the label on one line at 390px in the Syne face
  // ("Explore Small Multifamily DSCR" measured 342px against 322px available).
  if (type === 'ltr')    return sm ? 'Explore Multifamily DSCR' : 'Explore DSCR Options';
  if (type === 'brrr')   return sm ? 'Explore Multifamily BRRRR' : 'Explore BRRRR Funding';   // governed user-visible spelling: BRRRR
  if (type === 'rental') return 'Explore STR Funding';
  return 'Explore Fix & Flip Funding';
}

// ─── Analyzer tab funding button ──────────────────────────────────────────────

export function maybeShowFundingButton(result) {
  const id = BTN_IDS[result.type];
  if (!id) return;
  const container = document.getElementById(id);
  if (!container) return;

  // Item 2: only hot/warm verdicts ever show funding — walk-away stays neutral
  if (!shouldShowFunding(result)) {
    container.innerHTML = '';
    return;
  }

  const deal = buildDealParams(result);
  if (!qualifiesForType(result.type, deal)) {
    // Below the CPC brokering minimum and otherwise in the box: inactive button
    // + referral-floor caption. Every other miss keeps its specific reason —
    // B1: a hot/warm deal outside the box never gets a blank area.
    if (belowMinimumOnly(result.type, deal)) {
      const cfg = getTierConfig();
      container.innerHTML = renderBelowMinFundingHTML(result.type, cfg, result.cls, deal);
      return;
    }
    container.innerHTML = outsideBoxHTML(result.type, deal);
    return;
  }

  const cfg = getTierConfig();
  const btnLabel = getFundingLabel(result.type, result.cls, deal.band);
  const summary = summaryFor(result.type, result, cfg.tag);

  container.innerHTML = `
    <button class="btn-get-funding" id="${id}-trigger">
      <span class="funding-btn-label">${btnLabel}</span>
    </button>
    <div style="font-size:11px;color:#9aa4b2;margin-top:6px;line-height:1.45">Estimate only — not a loan offer, approval, or guarantee of terms. Clear Path Capital is a broker; final terms come from the lender.</div>`;

  document.getElementById(id + '-trigger').addEventListener('click', () => {
    navigator.clipboard.writeText(summary).catch(() => {});  // clipboard fallback stays
    window.open(buildCpcUrl(deal), '_blank', 'noopener');
    if (window.showToast) window.showToast(cfg.toast);
  });
}

// ─── Pipeline deal funding button ─────────────────────────────────────────────

export function getPipelineFundingButtonHTML(deal) {
  // Show for positive-return deals (not just hot) — Task 10
  const result = deal.data || deal;
  if (!shouldShowFunding(result)) return '';
  // Same CPC qualification gate as the analyzer; mirror the below-minimum
  // inactive-button treatment and the specific outside-box reasons.
  const dp = buildDealParams(result);
  if (!qualifiesForType(result.type, dp)) {
    if (belowMinimumOnly(result.type, dp)) {
      const cfg = getTierConfig();
      return renderBelowMinFundingHTML(result.type, cfg, result.cls, dp);
    }
    return outsideBoxHTML(result.type, dp);
  }
  const btnLabel = getFundingLabel(result.type, result.cls, dp.band);
  // Parity corrective (mobile CTA overflow): the label wraps instead of
  // ellipsizing — the old inline nowrap span clipped long labels mid-word on
  // phones. Styling lives on .funding-btn-label.
  return `<button class="btn-get-funding pipeline-funding-btn" onclick="event.stopPropagation();handlePipelineFundingClick(${deal.id})">
    <span class="funding-btn-label">${btnLabel}</span>
  </button>`;
}

// Exposed as global in main.js — handles click from pipeline card
export function handlePipelineFundingClick(id) {
  const deals = getDeals();
  const deal = deals.find(d => d.id === id);
  if (!deal) return;
  const cfg = getTierConfig();
  const summary = summaryFor(deal.type, deal.data, cfg.tag);
  navigator.clipboard.writeText(summary).catch(() => {});  // clipboard fallback stays
  window.open(buildCpcUrl(buildDealParams(deal.data)), '_blank', 'noopener');
  if (window.showToast) window.showToast(cfg.toast);
}
