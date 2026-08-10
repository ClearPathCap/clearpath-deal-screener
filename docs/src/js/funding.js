// ─── CPC funding bridge — pre-fill URL builder + qualification box ────────────
// Implements the Deal Screener side of CPC_INTEGRATION_SPEC.md.

import { getActiveTier } from './tiers.js';
import { CPC_BROKER_MIN, qualifiesForCpcLtr, qualifiesForCpcBrrr, propertyBand, BAND_RULES } from './finance.js';

// DSCR (LTR) + BRRR funnel gates live in finance.js (pure/testable); re-export so
// the funnel keeps a single import surface (clearpath.js). propertyBand + BAND_RULES
// ride along for the multifamily handoff (units → band → band-specific LTV ceiling).
export { qualifiesForCpcLtr, qualifiesForCpcBrrr, CPC_BROKER_MIN, propertyBand, BAND_RULES };

const CPC_BASE = 'https://clearpathcapfunding.com/';

// deal: normalized field object; returns full pre-fill URL per CPC_INTEGRATION_SPEC contract.
// `ltv` and `dscr` added for the DSCR/BRRR income deals (CPC consumes them).
export function buildCpcUrl(deal) {
  const p = new URLSearchParams();
  p.set('src', 'dealscreener');
  p.set('tier', getActiveTier());            // starter | investor | pro
  const map = { pp:'pp', rehab:'rehab', arv:'arv', loan:'loan', ltv:'ltv', dscr:'dscr',
                addr:'addr', city:'city', state:'state', ptype:'ptype', purpose:'purpose', exit:'exit',
                units:'units', band:'band',
                // Economics carried so CPC displays the screener's operator-view math
                // instead of re-deriving a conflicting one. HOA is MONTHLY (CPC ×12).
                monthlyRent:'monthlyRent', annualTaxes:'annualTaxes',
                annualInsurance:'annualInsurance', monthlyHoa:'monthlyHoa',
                vacancyPct:'vacancyPct', pmPct:'pmPct', maintPct:'maintPct', capexPct:'capexPct',
                loanRate:'loanRate', amortYears:'amortYears', pointsPct:'pointsPct', closingPct:'closingPct',
                screenerNoi:'screenerNoi', screenerDscr:'screenerDscr',
                screenerCashFlowAnnual:'screenerCashFlowAnnual', screenerCashFlowMonthly:'screenerCashFlowMonthly',
                screenerCapRate:'screenerCapRate', screenerVerdict:'screenerVerdict' };
  for (const [k, param] of Object.entries(map)) {
    const v = deal[k];
    if (v !== undefined && v !== null && v !== '') p.set(param, String(v));
  }
  return CPC_BASE + '?' + p.toString() + '#submit';
}

// CPC flip/bridge box: loan ≤ 90% LTC AND ≤ 70% ARV AND ≥ the CPC brokering
// minimum ($100K+; no upper cap — the $5M cap was removed 2026-06-18). The
// minimum is a referral threshold, not an analysis limit: below it the deal is
// still fully sized and graded; only the Clear Path handoff is unavailable.
export function qualifiesForCpc({ loan, ltc, arv }) {
  if (!loan || loan < CPC_BROKER_MIN) return false;
  if (ltc !== undefined && ltc > 0.90) return false;
  if (arv && loan / arv > 0.70) return false;
  return true;
}
