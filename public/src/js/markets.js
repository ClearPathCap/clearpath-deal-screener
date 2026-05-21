// ─── Market preset data ───────────────────────────────────────────────────────
// Phase 1 will add geolocation-based regional lookup on top of these presets.

export const FLIP_PRESETS = {
  charlotte:     { hold: 5, carry: 900,  target: 40000 },
  'lake-murray': { hold: 6, carry: 850,  target: 38000 },
  regional:      { hold: 7, carry: 1100, target: 45000 },
};

export const RENTAL_PRESETS = {
  'ocean-lakes': { down: 20, occ: 62, mgmt: 15, pm: 0, tax: 6200, maint: 3000, furnish: 18000, target: 6 },
  gatlinburg:    { down: 20, occ: 70, mgmt: 15, pm: 0, tax: 4700, maint: 3500, furnish: 22000, target: 6 },
  'pigeon-forge':{ down: 20, occ: 65, mgmt: 15, pm: 0, tax: 4300, maint: 3000, furnish: 20000, target: 6 },
  'lake-murray': { down: 20, occ: 55, mgmt: 15, pm: 0, tax: 3800, maint: 3000, furnish: 16000, target: 6 },
};
