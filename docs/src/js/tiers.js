// ─── Tier & Market management ─────────────────────────────────────────────────

// All 23 markets available in Phase 1
export const ALL_MARKETS = [
  // Fix & Flip markets
  { id: 'charlotte-nc',    label: 'Charlotte NC',      type: 'flip' },
  { id: 'atlanta-ga',      label: 'Atlanta GA',         type: 'flip' },
  { id: 'dallas-tx',       label: 'Dallas TX',          type: 'flip' },
  { id: 'phoenix-az',      label: 'Phoenix AZ',         type: 'flip' },
  { id: 'tampa-fl',        label: 'Tampa FL',           type: 'flip' },
  { id: 'nashville-tn',    label: 'Nashville TN',       type: 'flip' },
  { id: 'indianapolis-in', label: 'Indianapolis IN',    type: 'flip' },
  { id: 'columbus-oh',     label: 'Columbus OH',        type: 'flip' },
  { id: 'kansas-city-mo',  label: 'Kansas City MO',     type: 'flip' },
  { id: 'memphis-tn',      label: 'Memphis TN',         type: 'flip' },
  { id: 'jacksonville-fl', label: 'Jacksonville FL',    type: 'flip' },
  { id: 'san-antonio-tx',  label: 'San Antonio TX',     type: 'flip' },
  { id: 'birmingham-al',   label: 'Birmingham AL',      type: 'flip' },
  // STR markets
  { id: 'ocean-lakes-sc',  label: 'Ocean Lakes SC',     type: 'str' },
  { id: 'gatlinburg-tn',   label: 'Gatlinburg TN',      type: 'str' },
  { id: 'pigeon-forge-tn', label: 'Pigeon Forge TN',    type: 'str' },
  { id: 'lake-murray-sc',  label: 'Lake Murray SC',     type: 'str' },
  { id: 'destin-fl',       label: 'Destin FL',          type: 'str' },
  { id: 'blue-ridge-ga',   label: 'Blue Ridge GA',      type: 'str' },
  { id: 'outer-banks-nc',  label: 'Outer Banks NC',     type: 'str' },
  { id: 'hilton-head-sc',  label: 'Hilton Head SC',     type: 'str' },
  { id: 'gulf-shores-al',  label: 'Gulf Shores AL',     type: 'str' },
  { id: 'branson-mo',      label: 'Branson MO',         type: 'str' },
];

// Default selections shown before onboarding completes
const DEFAULT_MARKETS = ['charlotte-nc', 'ocean-lakes-sc'];
const MARKET_LOCK_DAYS = 30;

// ─── Active tier ──────────────────────────────────────────────────────────────

export function getActiveTier() {
  return localStorage.getItem('devTier') || 'starter';
}

export function isDevMode() {
  return !!localStorage.getItem('devTier');
}

// Called from console: setTier('starter') | setTier('investor') | setTier('pro')
// Also handles repair card tier clicks (passed through from main.js)
export function setDevTier(tier) {
  if (!['starter', 'investor', 'pro'].includes(tier)) {
    console.warn('Deal Screener: invalid tier. Use: starter, investor, or pro');
    return;
  }
  if (tier === 'starter') {
    localStorage.removeItem('devTier');
  } else {
    localStorage.setItem('devTier', tier);
  }
  window.location.reload();
}

// ─── Market selection ─────────────────────────────────────────────────────────

export function hasSelectedMarkets() {
  return !!localStorage.getItem('hasSelectedMarkets');
}

export function getSelectedMarkets() {
  try {
    const raw = localStorage.getItem('selectedMarkets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 1) return parsed;
    }
  } catch {}
  return DEFAULT_MARKETS;
}

export function setSelectedMarkets(ids) {
  localStorage.setItem('selectedMarkets', JSON.stringify(ids));
  localStorage.setItem('hasSelectedMarkets', '1');
  localStorage.setItem('marketSelectedDate', new Date().toISOString());
}

export function canChangeMarkets() {
  const tier = getActiveTier();
  if (tier === 'investor' || tier === 'pro') return true;
  const dateStr = localStorage.getItem('marketSelectedDate');
  if (!dateStr) return true;
  const diffDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= MARKET_LOCK_DAYS;
}

export function nextChangeDate() {
  const dateStr = localStorage.getItem('marketSelectedDate');
  if (!dateStr) return null;
  const next = new Date(new Date(dateStr).getTime() + MARKET_LOCK_DAYS * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Market unlock logic ──────────────────────────────────────────────────────

export function isMarketUnlocked(id) {
  const tier = getActiveTier();
  if (tier === 'pro') return true;
  const selected = getSelectedMarkets();
  if (selected.includes(id)) return true;
  // Investor unlocks 4 markets — placeholder (future: allow user to pick 4)
  if (tier === 'investor') return selected.includes(id);
  return false; // starter — only selected 2
}
