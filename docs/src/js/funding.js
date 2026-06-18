// ─── CPC funding bridge — pre-fill URL builder + qualification box ────────────
// Implements the Deal Screener side of CPC_INTEGRATION_SPEC.md.

import { getActiveTier } from './tiers.js';
import { CPC_LOAN_MIN, CPC_LOAN_MAX, qualifiesForCpcLtr, qualifiesForCpcBrrr } from './finance.js';

// DSCR (LTR) + BRRR funnel gates live in finance.js (pure/testable); re-export so
// the funnel keeps a single import surface (clearpath.js).
export { qualifiesForCpcLtr, qualifiesForCpcBrrr, CPC_LOAN_MIN, CPC_LOAN_MAX };

const CPC_BASE = 'https://clearpathcapfunding.com/';

// deal: normalized field object; returns full pre-fill URL per CPC_INTEGRATION_SPEC contract.
// `ltv` and `dscr` added for the DSCR/BRRR income deals (CPC consumes them).
export function buildCpcUrl(deal) {
  const p = new URLSearchParams();
  p.set('src', 'dealscreener');
  p.set('tier', getActiveTier());            // starter | investor | pro
  const map = { pp:'pp', rehab:'rehab', arv:'arv', loan:'loan', ltv:'ltv', dscr:'dscr',
                addr:'addr', city:'city', state:'state', ptype:'ptype', purpose:'purpose', exit:'exit' };
  for (const [k, param] of Object.entries(map)) {
    const v = deal[k];
    if (v !== undefined && v !== null && v !== '') p.set(param, String(v));
  }
  return CPC_BASE + '?' + p.toString() + '#submit';
}

// CPC flip/bridge box: loan ≤ 90% LTC AND ≤ 70% ARV AND $50K–$5M (min lowered 6/18).
export function qualifiesForCpc({ loan, ltc, arv }) {
  if (!loan || loan < CPC_LOAN_MIN || loan > CPC_LOAN_MAX) return false;
  if (ltc !== undefined && ltc > 0.90) return false;
  if (arv && loan / arv > 0.70) return false;
  return true;
}
