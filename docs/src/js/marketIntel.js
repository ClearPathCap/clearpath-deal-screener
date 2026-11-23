// ─── Premium market intel (tier-gated, server-side) ───────────────────────────
// The analyst notes, regulatory notes/risk, sources, confidence, and STR-viability
// depth are no longer in the client bundle — they're fetched here from the
// get_market_intel() function, which returns rows ONLY for an investor/pro
// entitlement (and the Pro-only prose/sources only for pro). So editing
// localStorage.tier can't reveal them; the data simply isn't on the client.

import { supabase } from './supabaseClient.js';
import { isSignedIn } from './auth.js';
import { noteServerResult } from './connectivity.js';

// fetchMarketIntel(slugs) → Map(market_id → {
//   rehab_note, str_viability, str_rev_low, str_rev_high,
//   benchmark_note, regulatory_note, regulatory_risk, confidence, source_url }).
// Empty Map when signed out, no slugs, or on error → no premium depth renders.
// Mobile Phase 0: on a failed fetch the Map carries `unavailable = true` so the
// guide can say the details could not load (never cached, never shown stale).
export async function fetchMarketIntel(slugs) {
  const out = new Map();
  if (!isSignedIn() || !slugs || !slugs.length) return out;
  try {
    const { data, error, status } = await supabase.rpc('get_market_intel', { p_market_ids: slugs });
    noteServerResult('market-intel', { ok: !error, error, status });
    if (error) { console.warn('Market intel fetch failed:', error); out.unavailable = true; return out; }
    (data || []).forEach(row => out.set(row.market_id, row));
  } catch (e) {
    console.warn('Market intel fetch failed:', e);
    noteServerResult('market-intel', { error: e });
    out.unavailable = true;
  }
  return out;
}
