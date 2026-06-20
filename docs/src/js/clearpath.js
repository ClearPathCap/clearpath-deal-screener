// ─── Clear Path Capital integration ──────────────────────────────────────────

import { getActiveTier } from './tiers.js';
import { getDeals } from './storage.js';
import { buildCpcUrl, qualifiesForCpc, qualifiesForCpcLtr, qualifiesForCpcBrrr, CPC_LOAN_MIN } from './funding.js';

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

// ─── Normalize an analyzer result into the CPC deal-param object ──────────────
// Numbers raw integers (no commas/$). Address passed whole — URLSearchParams encodes.
function buildDealParams(r) {
  const { city, state } = parseCityState(r.addr);
  if (r.type === 'flip') {
    const cost = (r.ask || 0) + (r.rep || 0);
    // Prefer the investor's actual requested loan, capped to the CPC box (90% of
    // cost, ≤70% of ARV). Fall back to the box max when no loan was entered.
    const maxBox = Math.round(Math.min(0.90 * cost, r.arv ? 0.70 * r.arv : Infinity));
    const loan = (r.loan && r.loan > 0) ? Math.min(Math.round(r.loan), maxBox) : maxBox;
    return {
      pp:      Math.round(r.ask || 0),
      rehab:   Math.round(r.rep || 0),
      arv:     Math.round(r.arv || 0),
      loan,
      ltc:     cost ? loan / cost : undefined,
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
      dscr:    r.dscr != null ? +r.dscr.toFixed(2) : undefined,
      ptype:   r.ptype || 'SFR',
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
      dscr:    r.dscr != null ? +r.dscr.toFixed(2) : undefined,
      ptype:   r.ptype || 'SFR',
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
function qualifiesForType(type, deal) {
  if (type === 'ltr') return qualifiesForCpcLtr(deal);
  if (type === 'brrr') return qualifiesForCpcBrrr(deal);
  return qualifiesForCpc(deal);
}

// ─── Tier-aware button config ─────────────────────────────────────────────────

function getTierConfig() {
  const tier = getActiveTier();
  if (tier === 'pro') return {
    label: 'Get Funding — Dedicated Broker',
    tag:   '[Pro — Dedicated Broker Requested]',
    toast: 'Form pre-filled on the Clear Path page — review and submit. Your dedicated broker will follow up directly. (Summary also copied as backup.)',
  };
  if (tier === 'investor') return {
    label: 'Get Funding — Priority Review',
    tag:   '[Investor — Priority Review]',
    toast: 'Form pre-filled on the Clear Path page — review and submit for priority review. (Summary also copied as backup.)',
  };
  return {
    label: 'Get Funding — Clear Path Capital',
    tag:   '[Starter Submission]',
    toast: 'Form pre-filled on the Clear Path page — review and submit. (Summary also copied as backup.)',
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
    'Generated by Deal Screener — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildRentalSummary(r, tag) {
  const lines = [
    'DEAL SCREENER SUMMARY — STR / Rental',
    r.addr ? 'Address: ' + r.addr : null,
    'Verdict: ' + r.verdict,
    tag,
    '---',
    'Purchase Price: $' + Math.round(r.price).toLocaleString(),
    'Potential Annual Revenue (100% occ.): $' + Math.round(r.rent).toLocaleString(),
    'Cash-on-Cash Return (est.): ' + (Math.round(r.coc * 10) / 10) + '%',
    'Cap Rate (est.): ' + (Math.round(r.capRate * 10) / 10) + '%',
    (r.dscr ? 'DSCR (est.): ' + r.dscr.toFixed(2) : null),
    'Annual Cash Flow (est.): $' + Math.round(r.cashflow).toLocaleString(),
    'Down Payment: ' + r.down + '%',
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. Actual terms set by the lender.',
    'Generated by Deal Screener — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildLtrSummary(r, tag) {
  const lines = [
    'DEAL SCREENER SUMMARY — Long-Term Rental (DSCR)',
    r.addr ? 'Address: ' + r.addr : null,
    'Verdict: ' + r.verdict,
    tag,
    '---',
    'Property Type: ' + (r.ptype || 'SFR'),
    'Purchase Price: $' + Math.round(r.price).toLocaleString(),
    'Monthly Rent: $' + Math.round(r.rent).toLocaleString() + '   (Annual Gross: $' + Math.round(r.rentYr).toLocaleString() + ')',
    'Vacancy: ' + r.vac + '%',
    'Net Operating Income (est.): $' + Math.round(r.NOI).toLocaleString(),
    'DSCR (est.): ' + (r.dscr != null ? r.dscr.toFixed(2) : 'n/a'),
    'Cap Rate (est.): ' + (Math.round(r.capRate * 10) / 10) + '%',
    'Monthly Cash Flow (est.): $' + Math.round(r.cashFlowMo).toLocaleString() + '   (Annual: $' + Math.round(r.cashFlowYr).toLocaleString() + ')',
    'Cash-on-Cash (est.): ' + (Math.round(r.coc * 10) / 10) + '%',
    'Down Payment: ' + r.down + '%   |   LTV (est.): ' + (Math.round(r.ltv * 10) / 10) + '%',
    'Estimated Loan Request: $' + Math.round(r.loan).toLocaleString(),
    'Assumed Rate / Amortization: ' + r.rate + '% / ' + r.amort + ' yr',
    'Property Taxes (annual): $' + Math.round(r.tax).toLocaleString() + '   Insurance (annual): $' + Math.round(r.ins).toLocaleString(),
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. DSCR and final terms are set by the lender. Clear Path Capital is a broker.',
    'Generated by Deal Screener — Clear Path Capital',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildBrrrSummary(r, tag) {
  const { city, state } = parseCityState(r.addr);
  const cs = [city, state].filter(Boolean).join(', ');
  const lines = [
    'DEAL SCREENER SUMMARY — BRRR (Bridge → DSCR Cash-Out Refi)',
    r.addr ? 'Address: ' + r.addr : null,
    cs ? 'City/State: ' + cs : null,
    'Verdict: ' + r.verdict,
    tag,
    '--- ACQUISITION (bridge / hard money) ---',
    'Property Type: ' + (r.ptype || 'SFR'),
    'Purchase Price: $' + Math.round(r.price).toLocaleString(),
    'Rehab (incl. contingency): $' + Math.round(r.rehabTotal).toLocaleString(),
    'ARV: $' + Math.round(r.arv).toLocaleString(),
    'All-in Cost Basis (est.): $' + Math.round(r.allInCost).toLocaleString(),
    'Cash Invested (est.): $' + Math.round(r.cashInvested).toLocaleString(),
    (r.acqLoan > 0 ? 'Acquisition Loan Requested (est.): $' + Math.round(r.acqLoan).toLocaleString() : null),
    '--- REFINANCE (DSCR cash-out takeout) ---',
    'Refi Loan @ ' + r.refiLtv + '% LTV (est.): $' + Math.round(r.refiLoan).toLocaleString(),
    'DSCR (est.): ' + (r.dscr != null ? r.dscr.toFixed(2) : 'n/a'),
    'Cash Out at Refi (est.): $' + Math.round(r.cashOut).toLocaleString(),
    'Capital Left In Deal (est.): $' + Math.round(r.capitalLeft).toLocaleString(),
    'Cash Recovered (est.): ' + (Math.round(r.cashRecoveredPct * 10) / 10) + '%',
    '--- HOLD ---',
    'Monthly Rent: $' + Math.round(r.rent).toLocaleString(),
    'NOI (est.): $' + Math.round(r.NOI).toLocaleString(),
    'Monthly Cash Flow (est.): $' + Math.round(r.cashFlowMo).toLocaleString(),
    'Cap Rate on cost (est.): ' + (Math.round(r.capRate * 10) / 10) + '%',
    '---',
    'Estimate only — not a loan offer, approval, or guarantee of terms. Two-stage financing (bridge + DSCR refinance); final terms set by the lender. Clear Path Capital is a broker.',
    'Generated by Deal Screener — Clear Path Capital',
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

// Item 6: true when the ONLY reason a deal fails its CPC box is loan < the $50K min.
function belowMinimumOnly(type, deal) {
  const { loan } = deal;
  if (!loan || loan >= CPC_LOAN_MIN) return false;   // must be genuinely under the minimum
  if (type === 'ltr' || type === 'brrr') {           // DSCR box: LTV ≤ 80%, DSCR ≥ 1.0
    if (deal.ltv !== undefined && deal.ltv > 0.80) return false;
    if (deal.dscr !== undefined && deal.dscr < 1.0) return false;
    return true;
  }
  if (deal.ltc !== undefined && deal.ltc > 0.90) return false;   // flip/bridge box
  if (deal.arv && loan / deal.arv > 0.70) return false;
  return true;
}

function fundingNote(msg) {
  return `<div class="funding-underbox">${msg}</div>`;
}

// Always returns a specific reason — never ''. Covers every way a hot/warm deal can
// miss the CPC box, so the funding area is never blank on a hot/warm verdict (B1).
function outsideBoxHTML(type, deal) {
  const { loan, ltv, dscr } = deal;

  if (!loan || loan <= 0) {
    return fundingNote("All-cash scenario — no financing requested, so there's nothing to submit. Add a loan amount to screen it against the Clear Path box.");
  }
  if (loan < CPC_LOAN_MIN) {
    return fundingNote(`This deal's loan (~$${Math.round(loan / 1000)}K) is below the $50K private-money minimum Clear Path brokers. Deals $50K+ get a funding option here.`);
  }
  if (type === 'ltr' || type === 'brrr') {
    if (ltv !== undefined && ltv > 0.80)
      return fundingNote(`Estimated LTV ${Math.round(ltv * 100)}% exceeds the 80% DSCR ceiling — raise the down payment toward 20%+ (or lower the refi LTV) to fit the box.`);
    if (dscr !== undefined && dscr < 1.0)
      return fundingNote(`DSCR ${(+dscr).toFixed(2)} is below 1.0 — rent doesn't cover the debt at this structure. Raise rent or lower the loan to fit the box.`);
  } else {
    if (deal.ltc !== undefined && deal.ltc > 0.90)
      return fundingNote(`Estimated LTC ${Math.round(deal.ltc * 100)}% exceeds the 90% loan-to-cost ceiling — lower the loan to fit the box.`);
    if (deal.arv && loan / deal.arv > 0.70)
      return fundingNote(`Estimated loan is over 70% of ARV — lower the loan to fit the box.`);
  }
  // Catch-all so a hot/warm verdict is NEVER blank.
  return fundingNote("This scenario sits just outside the Clear Path box as entered — adjust the loan, LTV, or DSCR and re-run, or contact Clear Path to review it.");
}

// Type-aware CTA label. LTR names the DSCR product, BRRR names BRRR.
function getFundingLabel(type, cfg, cls) {
  let base = cfg.label;
  if (type === 'ltr')       base = base.replace('Get Funding', 'Get DSCR Funding');
  else if (type === 'brrr') base = base.replace('Get Funding', 'Get BRRR Funding');
  if (cls === 'hot') return base;
  if (type === 'ltr')  return base.replace('Get DSCR Funding', 'Explore DSCR Options');
  if (type === 'brrr') return base.replace('Get BRRR Funding', 'Explore BRRR Financing');
  return base.replace('Get Funding', 'Explore Funding Options');  // flip/str warm
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
    // B1: a hot/warm deal outside the box gets a SPECIFIC reason, never a blank area.
    container.innerHTML = outsideBoxHTML(result.type, deal);
    return;
  }

  const cfg = getTierConfig();
  const btnLabel = getFundingLabel(result.type, cfg, result.cls);
  const summary = summaryFor(result.type, result, cfg.tag);

  container.innerHTML = `
    <button class="btn-get-funding" id="${id}-trigger">
      <img src="icons/clearpath-mark.png" class="funding-icon" alt="">
      ${btnLabel}
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
  // Same CPC qualification gate as the analyzer; mirror the under-$50K explainer
  const dp = buildDealParams(result);
  if (!qualifiesForType(result.type, dp)) return outsideBoxHTML(result.type, dp);
  const cfg = getTierConfig();
  const btnLabel = getFundingLabel(result.type, cfg, result.cls);
  return `<button class="btn-get-funding pipeline-funding-btn" onclick="event.stopPropagation();handlePipelineFundingClick(${deal.id})">
    <img src="icons/clearpath-mark.png" class="funding-icon" alt="">
    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${btnLabel}</span>
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
