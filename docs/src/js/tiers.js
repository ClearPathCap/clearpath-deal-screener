// ─── Tier & Market management ─────────────────────────────────────────────────

// ─── Market hierarchy: Region → State → Market ───────────────────────────────

export const MARKET_HIERARCHY = {
  'Southeast': {
    'AL': [
      { id: 'birmingham-al',   label: 'Birmingham' },
      { id: 'gulf-shores-al',  label: 'Gulf Shores' },
    ],
    'FL': [
      { id: 'tampa-fl',        label: 'Tampa' },
      { id: 'jacksonville-fl', label: 'Jacksonville' },
      { id: 'destin-fl',       label: 'Destin' },
    ],
    'GA': [
      { id: 'atlanta-ga',      label: 'Atlanta' },
      { id: 'blue-ridge-ga',   label: 'Blue Ridge' },
    ],
    'NC': [
      { id: 'charlotte-nc',    label: 'Charlotte' },
      { id: 'outer-banks-nc',  label: 'Outer Banks' },
    ],
    'SC': [
      { id: 'ocean-lakes-sc',  label: 'Ocean Lakes (Myrtle Beach)' },
      { id: 'lake-murray-sc',  label: 'Lake Murray' },
      { id: 'hilton-head-sc',  label: 'Hilton Head' },
    ],
    'TN': [
      { id: 'nashville-tn',    label: 'Nashville' },
      { id: 'memphis-tn',      label: 'Memphis' },
      { id: 'gatlinburg-tn',   label: 'Gatlinburg' },
      { id: 'pigeon-forge-tn', label: 'Pigeon Forge' },
    ],
  },
  'Midwest': {
    'IN': [
      { id: 'indianapolis-in', label: 'Indianapolis' },
    ],
    'MO': [
      { id: 'kansas-city-mo',  label: 'Kansas City' },
      { id: 'branson-mo',      label: 'Branson' },
    ],
    'OH': [
      { id: 'columbus-oh',     label: 'Columbus' },
    ],
  },
  'South Central': {
    'TX': [
      { id: 'dallas-tx',       label: 'Dallas' },
      { id: 'san-antonio-tx',  label: 'San Antonio' },
    ],
  },
  'Mountain West': {
    'AZ': [
      { id: 'phoenix-az',      label: 'Phoenix' },
    ],
  },
  'Northeast':     {},
  'Pacific Coast': {},
};

export const STATE_NAMES = {
  AL: 'Alabama',        AZ: 'Arizona',        FL: 'Florida',
  GA: 'Georgia',        IN: 'Indiana',        MO: 'Missouri',
  NC: 'North Carolina', OH: 'Ohio',           SC: 'South Carolina',
  TN: 'Tennessee',      TX: 'Texas',
};

// Flat list of all markets (for lookups, clearpath summaries, etc.)
export const ALL_MARKETS = Object.values(MARKET_HIERARCHY)
  .flatMap(states => Object.values(states).flat());

// ─── Active tier ──────────────────────────────────────────────────────────────

export function getActiveTier() {
  return localStorage.getItem('devTier') || 'starter';
}

export function isDevMode() {
  return !!localStorage.getItem('devTier');
}

// Called from console or dev modal
export function setDevTier(tier) {
  if (!['starter', 'investor', 'pro'].includes(tier)) {
    console.warn('Deal Screener: invalid tier. Use: starter, investor, or pro');
    return;
  }
  if (tier === 'starter') localStorage.removeItem('devTier');
  else localStorage.setItem('devTier', tier);
  window.location.reload();
}

// ─── Market slots ─────────────────────────────────────────────────────────────

// Returns array of market IDs (empty string = slot not filled)
export function getMarketSlots() {
  try {
    const raw = localStorage.getItem('marketSlots');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  // Migrate from old selectedMarkets format
  try {
    const old = localStorage.getItem('selectedMarkets');
    if (old) {
      const parsed = JSON.parse(old);
      if (Array.isArray(parsed) && parsed.length) {
        localStorage.setItem('marketSlots', JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function setMarketSlot(index, id) {
  const slots = getMarketSlots();
  while (slots.length <= index) slots.push('');
  slots[index] = id;
  localStorage.setItem('marketSlots', JSON.stringify(slots));
}

// Called after first-launch primary selection
export function completePrimarySelection(marketId) {
  setMarketSlot(0, marketId);
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
  const slots = getMarketSlots();
  return slots.includes(id);
}

// ─── Convenience lookups ──────────────────────────────────────────────────────

export function getMarketLabel(id) {
  const market = ALL_MARKETS.find(m => m.id === id);
  return market ? market.label : id;
}
