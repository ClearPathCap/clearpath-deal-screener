// ─── localStorage wrappers ────────────────────────────────────────────────────

export function getDeals() {
  try {
    return JSON.parse(localStorage.getItem('deals_v3') || localStorage.getItem('deals') || '[]');
  } catch (e) {
    return [];
  }
}

export function saveDeals(d) {
  localStorage.setItem('deals_v3', JSON.stringify(d));
}
