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
//          one-time migration path for existing users with local markets) — only
//          at boot or a genuine sign-in, and only to the account that owns this
//          device's slots (F7: never on a token refresh, tab-visible or reconnect);
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
import { isSignedIn, getUserId } from './auth.js';
import { getMarketForSlot, setMarketSlot, recordSlotChangeAt, clearSlotChange } from './tiers.js';
import { noteServerResult } from './connectivity.js';

// Lane-2 review F7 — whose local slots may be pushed. The first account that pushes
// from this device becomes the slots' owner; a DIFFERENT account signed in later on the
// same device pulls its own slots but never receives the earlier account's local-only
// picks (they stay local, untouched). No owner yet = legacy/signed-out picks: pushed
// once to the first account, exactly as before.
const OWNER_KEY = 'marketSlotsOwner';
const readOwner = () => { try { return localStorage.getItem(OWNER_KEY) || ''; } catch { return ''; } };
const writeOwner = (id) => { try { localStorage.setItem(OWNER_KEY, id); } catch { /* best effort */ } };

// Hydrate on sign-in / session restore. Returns a summary for tests/telemetry;
// callers re-render on 'synced'. `push: false` (a connectivity reconnect, a token
// refresh, the SDK's tab-visible SIGNED_IN for the same user) pulls server slots only
// and never writes — local-only slots stay local until the next boot / genuine
// sign-in pushes them (independent reviews F1, F7). A push also needs the slots to
// belong to this account (OWNER_KEY) and the account not to change mid-sync.
export async function hydrateMarketsOnAuth({ push = true } = {}) {
  if (!isSignedIn()) return { status: 'signed-out', pulled: 0, pushed: 0 };
  const uid = getUserId();
  const owner = readOwner();
  const mayPush = push && (!owner || !uid || owner === uid);
  let rows;
  try {
    const { data, error, status } = await supabase.rpc('get_user_markets');
    noteServerResult('market-sync', { ok: !error, error, status });
    if (error) return { status: 'error', pulled: 0, pushed: 0 };
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    noteServerResult('market-sync', { error: e });
    return { status: 'error', pulled: 0, pushed: 0 };
  }
  // The account changed while the read was in flight: these rows belong to the previous
  // account — apply nothing, push nothing (the new account's own notify syncs it).
  if (!isSignedIn() || getUserId() !== uid) return { status: 'stale', pulled: 0, pushed: 0 };

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
    } else if (localId && mayPush) {
      // Local-only slot — push up. A refusal (slot cap on this tier, cooldown)
      // leaves the local value exactly where it was.
      if (!isSignedIn() || getUserId() !== uid) break;   // account changed mid-sync: stop writing
      try {
        const { data, error } = await supabase.rpc('set_user_market', { p_slot: slot, p_market: localId });
        if (!error && data && data.ok) pushed++;
      } catch { /* keep local — sync is best-effort, never destructive */ }
    }
  }
  if (mayPush && uid && !owner && getUserId() === uid) writeOwner(uid);
  return { status: 'synced', pulled, pushed };
}

// Server-first slot write for signed-in users. Signed out resolves ok:true so
// the caller's local commit path is identical in both modes.
export async function pushMarketChange(slot, marketId) {
  if (!isSignedIn()) return { ok: true, local: true };
  try {
    const { data, error, status } = await supabase.rpc('set_user_market', { p_slot: slot, p_market: marketId });
    noteServerResult('market-sync', { ok: !error, error, status });
    if (error) return { ok: false, msg: 'Couldn\'t reach the server — try again.' };
    return data && typeof data.ok === 'boolean' ? data : { ok: false, msg: 'Unexpected server reply.' };
  } catch (e) {
    noteServerResult('market-sync', { error: e });
    return { ok: false, msg: 'Couldn\'t reach the server — try again.' };
  }
}
