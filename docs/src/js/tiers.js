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

export function isDevMode() {
  return !!localStorage.getItem('tier');
}

// Writes tier to storage; does NOT reload — caller must update UI
export function setDevTier(tier) {
  if (!['starter', 'investor', 'pro'].includes(tier)) {
    console.warn('Deal Screener: invalid tier. Use: starter, investor, or pro');
    return;
  }
  if (tier === 'starter') localStorage.removeItem('tier');
  else localStorage.setItem('tier', tier);
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
