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

// Lane-3 review N1 — per-slot provenance, bound to the value itself: {m: marketId, u: userId}.
// A value PULLED from an account (or written to it) is that account's server data, not a
// local-only pick, so it is never pushed into a DIFFERENT account (A → sign-out → B pulls
// B's slots → sign-out → A must not receive B's). If the slot later changes on this device
// (a signed-out pick), the record no longer matches the value and it counts as local again.
// Lane-4 L4-3: a record that EXISTS but is unreadable or malformed fails CLOSED (the value
// is treated as another account's — kept on the device, never pushed). Only a record that
// is absent (a legacy device, or a pick never written to any account) counts as local.
const FROM_PREFIX = 'marketSlotFrom_';
const CORRUPT = Object.freeze({ corrupt: true });
const readFrom = (slot) => {
  let raw;
  try { raw = localStorage.getItem(FROM_PREFIX + slot); } catch { return CORRUPT; }
  if (raw == null) return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && typeof o.m === 'string' && typeof o.u === 'string' && o.m && o.u ? o : CORRUPT;
  } catch { return CORRUPT; }
};
const writeFrom = (slot, m, u) => { if (!u || !m) return; try { localStorage.setItem(FROM_PREFIX + slot, JSON.stringify({ m, u })); } catch { /* best effort */ } };
const fromOtherAccount = (slot, localId, uid) => {
  const f = readFrom(slot);
  if (f === CORRUPT) return true;
  return !!(f && f.m === localId && uid && f.u !== uid);
};
const sameAccount = (uid) => isSignedIn() && getUserId() === uid;
const removeFrom = (slot) => { try { localStorage.removeItem(FROM_PREFIX + slot); } catch { /* best effort */ } };
const currentUid = () => (isSignedIn() ? getUserId() : '');

// E2 (lane-4 finding; owner decision 2026-11-23): account isolation for what the device SHOWS.
// A slot whose value is an account's server data (its provenance record matches the value)
// is shown only while THAT account is signed in. On sign-out, an account switch (this tab,
// another tab, an expired session) or boot as someone else, such a slot is cleared with its
// record and its change date. Nothing is lost: it is server-held, and that account's next
// sign-in pulls it back. Unattributed local-only picks (no record, or a record for an older
// value) are NEVER cleared. An unreadable record fails closed (cleared), as in L4-3.
// Synchronous and network-free, so it also runs offline and before any stale response lands.
export function purgeForeignMarketSlots(keepUid = currentUid()) {
  let purged = 0;
  for (let slot = 0; slot < 6; slot++) {
    // Lane-5 R3: a storage exception (quota, blocked storage) on one slot never aborts the
    // others or the caller; the value is cleared first, so a failure can only leave a date.
    try {
      const f = readFrom(slot);
      if (!f) continue;
      const value = getMarketForSlot(slot);
      if (f === CORRUPT || (f.m === value && f.u !== keepUid)) {
        if (value) { setMarketSlot(slot, ''); purged++; }
        try { clearSlotChange(slot); } catch { /* best effort */ }
        removeFrom(slot);
      } else if (f.m !== value) {
        removeFrom(slot);   // the record describes an older value: the current one is a local pick
      }
    } catch { /* best effort — the next purge retries */ }
  }
  return purged;
}

// Hydrate on sign-in / session restore. Returns a summary for tests/telemetry;
// callers re-render on 'synced'. `push: false` (a connectivity reconnect, a token
// refresh, the SDK's tab-visible SIGNED_IN for the same user) pulls server slots only
// and never writes — local-only slots stay local until the next boot / genuine
// sign-in pushes them (independent reviews F1, F7). A push also needs the slots to
// belong to this account (OWNER_KEY) and the account not to change mid-sync.
export async function hydrateMarketsOnAuth({ push = true } = {}) {
  // E2: before any await — another account's server-held slots are never shown here, even
  // when the read below fails, is offline, or returns stale.
  let purged = purgeForeignMarketSlots(currentUid());
  if (!isSignedIn()) return { status: 'signed-out', pulled: 0, pushed: 0, purged };
  const uid = getUserId();
  const owner = readOwner();
  const mayPush = push && (!owner || !uid || owner === uid);
  let rows;
  try {
    const { data, error, status } = await supabase.rpc('get_user_markets');
    noteServerResult('market-sync', { ok: !error, error, status });
    if (error) return { status: 'error', pulled: 0, pushed: 0, purged };
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    noteServerResult('market-sync', { error: e });
    return { status: 'error', pulled: 0, pushed: 0, purged };
  }
  // The account changed while the read was in flight: these rows belong to the previous
  // account — apply nothing, push nothing (the new account's own notify syncs it).
  if (!sameAccount(uid)) return { status: 'stale', pulled: 0, pushed: 0, purged };

  // Lane-4 L4-2: the owner is recorded BEFORE the first push await, so an account that
  // signs in while this push is in flight is already a non-owner and cannot push the same
  // local picks a second time.
  if (mayPush && uid && !owner) writeOwner(uid);

  const serverBySlot = new Map(rows.map(r => [r.slot_index, r]));
  let pulled = 0, pushed = 0;

  for (let slot = 0; slot < 6; slot++) {
    // Lane-4 L4-2: re-checked at the top of EVERY slot (a push below awaits): once the
    // account has changed, nothing more of this account's rows is applied or pushed.
    if (!sameAccount(uid)) return { status: 'stale', pulled, pushed, purged };
    const row      = serverBySlot.get(slot);
    const serverId = (row && row.market_id) || '';
    const localId  = getMarketForSlot(slot);
    if (serverId) {
      if (serverId !== localId) { setMarketSlot(slot, serverId); pulled++; }
      writeFrom(slot, serverId, uid);   // N1: this value is this account's server data
      // Wave A · A9: the server's cooldown clock wins for a server-held slot — a
      // lock from another device shows here; a clock the server does not hold
      // (changed_at null) clears a stale device-local one.
      if (row.changed_at) recordSlotChangeAt(slot, row.changed_at); else clearSlotChange(slot);
    } else if (localId && mayPush && !fromOtherAccount(slot, localId, uid)) {
      // Local-only slot — push up. A refusal (slot cap on this tier, cooldown)
      // leaves the local value exactly where it was. A value pulled from ANOTHER
      // account is never pushed here (N1); it stays on the device, untouched.
      try {
        const { data, error } = await supabase.rpc('set_user_market', { p_slot: slot, p_market: localId });
        // The write went to `uid`'s account (the token captured at the call), so the
        // provenance names `uid` even if the account changed during the await.
        if (!error && data && data.ok) { pushed++; writeFrom(slot, localId, uid); }
      } catch { /* keep local — sync is best-effort, never destructive */ }
      // E2: the account changed during that push, so the value just became `uid`'s server
      // data while someone else is current: stop showing it here.
      if (!sameAccount(uid)) { purged += purgeForeignMarketSlots(currentUid()); return { status: 'stale', pulled, pushed, purged }; }
    }
  }
  return { status: 'synced', pulled, pushed, purged };
}

// Server-first slot write for signed-in users. Signed out resolves ok:true so
// the caller's local commit path is identical in both modes.
// Lane-4 L4-1: the account is captured BEFORE the request. If it changed while the request
// was in flight (another tab signed out and in), the write belongs to the PREVIOUS account
// (which now holds it server-side): no provenance is written and the caller is told not ok,
// so the value is never committed on this device under the new account (no mislabel, no
// later cross-account push).
export async function pushMarketChange(slot, marketId) {
  if (!isSignedIn()) return { ok: true, local: true };
  const uid = getUserId();
  try {
    const { data, error, status } = await supabase.rpc('set_user_market', { p_slot: slot, p_market: marketId });
    noteServerResult('market-sync', { ok: !error, error, status });
    if (!sameAccount(uid)) return { ok: false, accountChanged: true, msg: 'Your account changed while saving — that change was not applied here.' };
    if (error) return { ok: false, msg: 'Couldn\'t reach the server — try again.' };
    if (data && data.ok === true) writeFrom(slot, marketId, uid);   // N1: now this account's server data
    return data && typeof data.ok === 'boolean' ? data : { ok: false, msg: 'Unexpected server reply.' };
  } catch (e) {
    noteServerResult('market-sync', { error: e });
    return { ok: false, msg: 'Couldn\'t reach the server — try again.' };
  }
}
