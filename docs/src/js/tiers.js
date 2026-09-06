// ─── Tier & Market management ─────────────────────────────────────────────────

// ALL_MARKETS now comes from the full markets.js data file
import { ALL_MARKETS } from './markets.js';

// ─── Storage key mapping ──────────────────────────────────────────────────────

function slotStorageKey(index) {
  return index === 0 ? 'primaryMarket' : 'market_' + (index + 1);
}

// ─── Storage migrations ───────────────────────────────────────────────────────

// Run once at app start — must call before anything reads market data
export function migrateMarketStorage() {
  // Migrate old marketSlots[] array → primaryMarket key
  if (!localStorage.getItem('primaryMarket')) {
    const raw = localStorage.getItem('marketSlots');
    if (raw) {
      try {
        const slots = JSON.parse(raw);
        if (Array.isArray(slots) && slots[0]) {
          localStorage.setItem('primaryMarket', slots[0]);
          // Per spec: do NOT auto-populate market_2 — user adds it themselves
        }
      } catch {}
      localStorage.removeItem('marketSlots');
    }
  } else {
    // primaryMarket already exists — just clean up the old key if present
    localStorage.removeItem('marketSlots');
  }

  // Migrate old devTier → tier
  const devTier = localStorage.getItem('devTier');
  if (devTier && !localStorage.getItem('tier')) {
    localStorage.setItem('tier', devTier);
  }
  localStorage.removeItem('devTier');
}

// ─── Active tier ──────────────────────────────────────────────────────────────

export function getActiveTier() {
  return localStorage.getItem('tier') || 'starter';
}

// Wave 5 (SR-3 / plan v1.1 C-2): the tier-mutating Dev Mode is GONE from the
// production bundle. The dev flag, the URL param, the client "unlock code",
// and the dev tier panel all shipped to every visitor — public client
// material, not owner-only security — and together they suppressed entitlement
// sync and spoofed paid display state. Tier preview now happens through real
// synthetic accounts with comp grants, or local tooling outside docs/. The
// server entitlement sync runs unconditionally (auth.js).

// Caches the tier the SERVER reported (auth.js) for snappy UI. This is the ONLY
// sanctioned writer of the `tier` cache now — it is overwritten on every load
// from the server, so the cache can never persist a self-granted tier.
export function setCachedTier(tier) {
  if (!['starter', 'investor', 'pro'].includes(tier)) return;
  if (tier === 'starter') localStorage.removeItem('tier');
  else localStorage.setItem('tier', tier);
}

// ─── Tier redemption codes ────────────────────────────────────────────────────
// ALL codes are validated SERVER-SIDE in Supabase (auth.js → redeemServerCode →
// redeem_comp_code). Wave 5 removed the client-side unlock code entirely — no
// code is handled in the browser anymore (SR-3 / C-2).
export function redeemCode(raw) {
  const code = (raw || '').trim().toUpperCase();
  if (!code) return { ok: false, msg: 'Enter a code first.' };
  return { ok: false, deferToServer: true };
}

// ─── Market slot storage ──────────────────────────────────────────────────────

export function getMarketForSlot(index) {
  return localStorage.getItem(slotStorageKey(index)) || '';
}

export function setMarketSlot(index, id) {
  const key = slotStorageKey(index);
  if (id) localStorage.setItem(key, id);
  else localStorage.removeItem(key);
}

// Convenience accessors
export function getPrimaryMarket() { return getMarketForSlot(0); }
export function getMarket2()       { return getMarketForSlot(1); }

// UX wave: the market that is DRIVING analysis right now. main.js keeps its
// module-level _activeSlot mirrored into localStorage 'activeSlot', so reading
// the mirror here lets pipeline.js stamp a saved deal with the market it was
// underwritten against without reaching into main.js state. Falls back through
// the same guard renderMarketSlots applies: an empty/invalid active slot means
// slot 0; an empty slot 0 means no market ('').
export function getActiveMarketId() {
  const v = parseInt(localStorage.getItem('activeSlot'), 10);
  const slot = Number.isInteger(v) && v >= 0 && v < 6 ? v : 0;
  return getMarketForSlot(slot) || getMarketForSlot(0) || '';
}

// Returns a flat array of all set market IDs (for clearpath summary etc.)
export function getMarketSlots() {
  const result = [];
  for (let i = 0; i < 6; i++) {
    const m = getMarketForSlot(i);
    if (m) result.push(m);
  }
  return result;
}

// Called after first-launch primary selection
export function completePrimarySelection(marketId) {
  localStorage.setItem('primaryMarket', marketId);
  localStorage.setItem('hasSelectedMarkets', '1');
  localStorage.setItem('marketSelectedDate', new Date().toISOString());
}

export function hasSelectedMarkets() {
  return !!localStorage.getItem('hasSelectedMarkets');
}

// ─── Slot cooldown (per-slot change lock) ────────────────────────────────────

export function getSlotCooldownDays() {
  const tier = getActiveTier();
  if (tier === 'pro') return 0;
  if (tier === 'investor') return 14;
  return 30; // starter
}

function getSlotChangeDates() {
  try {
    const raw = localStorage.getItem('slotChangeDates');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

// Record that slot[index] was intentionally changed (not initial first-add)
export function recordSlotChange(index) {
  const dates = getSlotChangeDates();
  dates[index] = new Date().toISOString();
  localStorage.setItem('slotChangeDates', JSON.stringify(dates));
}

// ─── Wave A · A9 (owner/GPT ruling 2026-09-06): server-authoritative lock state ──
// The server's `changed_at` (get_user_markets) and `lockedUntil` (set_user_market,
// on success and on refusal) are mirrored into the SAME local clock the client
// already evaluates, so (a) a lock incurred on another device is visible here,
// (b) a same-market re-pick — a server no-op — never starts a local cooldown,
// and (c) an upgrade still re-evaluates the lock under the new tier exactly as
// the server does (the cooldown is read from the current tier at check time).
export function recordSlotChangeAt(index, iso) {
  const dates = getSlotChangeDates();
  const t = iso ? new Date(iso) : null;
  if (t && !Number.isNaN(t.getTime())) dates[index] = t.toISOString();
  else delete dates[index];
  localStorage.setItem('slotChangeDates', JSON.stringify(dates));
}
export function clearSlotChange(index) { recordSlotChangeAt(index, null); }
// A server `lockedUntil` → the equivalent `changed_at` under the CURRENT tier's
// cooldown, so the local clock and the server agree on the same instant.
export function applyServerLock(index, lockedUntilIso) {
  const days = getSlotCooldownDays();
  if (!lockedUntilIso || days === 0) return;
  const until = new Date(lockedUntilIso);
  if (Number.isNaN(until.getTime())) return;
  recordSlotChangeAt(index, new Date(until.getTime() - days * 24 * 60 * 60 * 1000).toISOString());
}

// True if the slot is still within its cooldown window
export function isSlotLocked(index) {
  const days = getSlotCooldownDays();
  if (days === 0) return false;
  const dates = getSlotChangeDates();
  const changedAt = dates[index];
  if (!changedAt) return false;
  const diffDays = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays < days;
}

// Date the lock expires for a given slot
export function slotLockedUntilDate(index) {
  const dates = getSlotChangeDates();
  const changedAt = dates[index];
  if (!changedAt) return null;
  const days = getSlotCooldownDays();
  const next = new Date(new Date(changedAt).getTime() + days * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Date the slot will lock until if a change is made NOW
export function slotWillLockUntilDate() {
  const days = getSlotCooldownDays();
  const next = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Unlock logic ─────────────────────────────────────────────────────────────

// Number of unlocked market slots for the current tier
export function getUnlockedSlotCount() {
  const tier = getActiveTier();
  if (tier === 'pro') return 6;
  if (tier === 'investor') return 4;
  return 2; // starter
}

export function isMarketUnlocked(id) {
  const tier = getActiveTier();
  if (tier === 'pro') return true;
  return getMarketSlots().includes(id);
}

// ─── Convenience lookups ──────────────────────────────────────────────────────

// Returns "Charlotte, NC" format (used in toasts and full-name displays)
export function getMarketLabel(id) {
  const market = ALL_MARKETS.find(m => m.id === id);
  if (!market) return id;
  // market.name is "Charlotte NC" — convert to "Charlotte, NC"
  const cleanName = market.name.replace(/\s*⚠.*$/, '').trim(); // strip warning emoji if present
  const parts = cleanName.split(' ');
  const stateCode = parts.pop();
  return parts.join(' ') + ', ' + stateCode;
}
