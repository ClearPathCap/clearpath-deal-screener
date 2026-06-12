// ─── CPC funding bridge — pre-fill URL builder + qualification box ────────────
// Implements the Deal Screener side of CPC_INTEGRATION_SPEC.md.

import { getActiveTier } from './tiers.js';

const CPC_BASE = 'https://clearpathcapfunding.com/';

// deal: normalized field object; returns full pre-fill URL per CPC_INTEGRATION_SPEC contract
export function buildCpcUrl(deal) {
  const p = new URLSearchParams();
  p.set('src', 'dealscreener');
  p.set('tier', getActiveTier());            // starter | investor | pro
  const map = { pp:'pp', rehab:'rehab', arv:'arv', loan:'loan', addr:'addr',
                city:'city', state:'state', ptype:'ptype', purpose:'purpose', exit:'exit' };
  for (const [k, param] of Object.entries(map)) {
    const v = deal[k];
    if (v !== undefined && v !== null && v !== '') p.set(param, String(v));
  }
  return CPC_BASE + '?' + p.toString() + '#submit';
}

// CPC published box: loan ≤ 90% LTC AND ≤ 70% ARV AND $150K–$5M
export function qualifiesForCpc({ loan, ltc, arv }) {
  if (!loan || loan < 150000 || loan > 5000000) return false;
  if (ltc !== undefined && ltc > 0.90) return false;
  if (arv && loan / arv > 0.70) return false;
  return true;
}
