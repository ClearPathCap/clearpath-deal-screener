// ─── Account-backed market sync (UX wave finding 3) ──────────────────────────
// PROVEN DEFECT: a region picked on the laptop never appeared on the iPhone
// under the same signed-in Pro account — market slots were localStorage-only.
// The server side has existed since migration 0003 (user_markets table +
// get_user_markets / set_user_market RPCs, tier caps and cooldowns enforced
// server-side) with zero client call sites. This module is the client wiring —
// no second persistence architecture, no schema change.
//
// LAW (explicit precedence, so first sign-in can never silently destroy data):
//   1. Signed OUT — pure local behavior, exactly as before. No RPC ever fires.
//   2. On sign-in hydration:
//        - server row for a slot  → server wins that slot (pull down);
//        - local-only slot        → pushed UP to the server (this is also the
//          one-time migration path for existing users with local markets);
//        - push refused (tier cap / cooldown) → the local value STAYS local —
//          visible on this device, never destroyed, tried again next sign-in;
//        - RPC error → change nothing anywhere (fail-safe, never fail-deed).
//   3. A signed-in slot change goes to the SERVER FIRST; only ok:true commits
//      locally, so the server's cooldown/cap answer is the authority and the
//      devices can't fork.
//   4. The ACTIVE slot stays device-local by design: which region you're
//      looking at is per-device UI state; convergence comes from the existing
//      render guard (active slot empty → slot 0), which is also what keeps the
//      M-1 empty-market reset correct after a sync changes slot contents.
//
// Saved deals are NOT touched by any of this: each deal carries the market it
// was underwritten against (stamped at save time in pipeline.js).

import { supabase } from './supabaseClient.js';
import { isSignedIn } from './auth.js';
import { getMarketForSlot, setMarketSlot, recordSlotChangeAt, clearSlotChange } from './tiers.js';

// Hydrate on sign-in / session restore. Returns a summary for tests/telemetry;
// callers re-render on 'synced'.
export async function hydrateMarketsOnAuth() {
  if (!isSignedIn()) return { status: 'signed-out', pulled: 0, pushed: 0 };
  let rows;
  try {
    const { data, error } = await supabase.rpc('get_user_markets');
    if (error) return { status: 'error', pulled: 0, pushed: 0 };
    rows = Array.isArray(data) ? data : [];
  } catch {
    return { status: 'error', pulled: 0, pushed: 0 };
  }

  const serverBySlot = new Map(rows.map(r => [r.slot_index, r]));
  let pulled = 0, pushed = 0;

  for (let slot = 0; slot < 6; slot++) {
    const row      = serverBySlot.get(slot);
    const serverId = (row && row.market_id) || '';
    const localId  = getMarketForSlot(slot);
    if (serverId) {
      if (serverId !== localId) { setMarketSlot(slot, serverId); pulled++; }
      // Wave A · A9: the server's cooldown clock wins for a server-held slot — a
      // lock from another device shows here; a clock the server does not hold
      // (changed_at null) clears a stale device-local one.
      if (row.changed_at) recordSlotChangeAt(slot, row.changed_at); else clearSlotChange(slot);
    } else if (localId) {
      // Local-only slot — push up. A refusal (slot cap on this tier, cooldown)
      // leaves the local value exactly where it was.
      try {
        const { data, error } = await supabase.rpc('set_user_market', { p_slot: slot, p_market: localId });
        if (!error && data && data.ok) pushed++;
      } catch { /* keep local — sync is best-effort, never destructive */ }
    }
  }
  return { status: 'synced', pulled, pushed };
}

// Server-first slot write for signed-in users. Signed out resolves ok:true so
// the caller's local commit path is identical in both modes.
export async function pushMarketChange(slot, marketId) {
  if (!isSignedIn()) return { ok: true, local: true };
  try {
    const { data, error } = await supabase.rpc('set_user_market', { p_slot: slot, p_market: marketId });
    if (error) return { ok: false, msg: 'Couldn\'t reach the server — try again.' };
    return data && typeof data.ok === 'boolean' ? data : { ok: false, msg: 'Unexpected server reply.' };
  } catch {
    return { ok: false, msg: 'Couldn\'t reach the server — try again.' };
  }
}
