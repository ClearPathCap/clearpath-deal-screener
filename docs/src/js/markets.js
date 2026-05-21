// ─── Market preset data + geolocation regional lookup ────────────────────────

// ─── Market presets ───────────────────────────────────────────────────────────

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

// ─── Rent range data for STR preset display (Section 6d) ─────────────────────

export const RENTAL_RENT_RANGES = {
  'ocean-lakes': { low: 40000, high: 85000 },
  gatlinburg:    { low: 48000, high: 140000 },
  'pigeon-forge':{ low: 42000, high: 110000 },
  'lake-murray': { low: 35000, high: 80000 },
};

// ─── Regional market conditions (no external API — lat/lng bounding boxes) ───

const REGIONS = [
  {
    name: 'Northeast',
    arvRule: 0.65,
    holdAdj: 1.15,
    states: ['ME','NH','VT','MA','RI','CT','NY','NJ'],
    // Approximate bounding box: lat 40.5–47.5, lng -80–-66.9
    lat: [40.5, 47.5], lng: [-80.0, -66.9],
  },
  {
    name: 'Mid-Atlantic',
    arvRule: 0.68,
    holdAdj: 1.10,
    states: ['PA','MD','DE','VA','DC','WV'],
    lat: [36.5, 42.5], lng: [-83.7, -74.0],
  },
  {
    name: 'Southeast',
    arvRule: 0.72,
    holdAdj: 1.00,
    states: ['NC','SC','GA','FL','TN','AL','MS'],
    lat: [24.4, 36.6], lng: [-91.7, -75.4],
  },
  {
    name: 'Midwest',
    arvRule: 0.72,
    holdAdj: 0.95,
    states: ['OH','IN','IL','MI','WI','MN','MO','IA','KY','ND','SD','NE','KS'],
    lat: [36.0, 49.4], lng: [-104.0, -80.5],
  },
  {
    name: 'South Central',
    arvRule: 0.72,
    holdAdj: 0.95,
    states: ['TX','OK','AR','LA'],
    lat: [25.8, 37.0], lng: [-106.6, -88.8],
  },
  {
    name: 'Mountain West',
    arvRule: 0.70,
    holdAdj: 1.05,
    states: ['CO','UT','AZ','NM','NV','ID','WY','MT'],
    lat: [31.3, 49.0], lng: [-120.0, -102.0],
  },
  {
    name: 'Pacific Coast',
    arvRule: 0.63,
    holdAdj: 1.20,
    states: ['CA','OR','WA','HI','AK'],
    lat: [32.5, 49.0], lng: [-124.7, -114.0],
  },
];

const NATIONAL_DEFAULT = { name: 'National Default', arvRule: 0.70, holdAdj: 1.00 };

export function detectRegion(lat, lng) {
  for (const r of REGIONS) {
    if (lat >= r.lat[0] && lat <= r.lat[1] && lng >= r.lng[0] && lng <= r.lng[1]) {
      return r;
    }
  }
  return NATIONAL_DEFAULT;
}

// ─── Geolocation — prompt on first launch, store result ───────────────────────
// Stored in localStorage:
//   geo_prompted = '1'   (set after permission decision, prevents re-prompt)
//   geo_region   = name  (detected region name)
//   geo_lat / geo_lng    (raw coords, for future use)

export function initGeolocation() {
  if (!('geolocation' in navigator)) return;
  if (localStorage.getItem('geo_prompted')) return;

  // Charlotte NC is in the Southeast region — will auto-select correctly:
  // 35.2271°N, 80.8431°W
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      localStorage.setItem('geo_prompted', '1');
      localStorage.setItem('geo_lat', lat);
      localStorage.setItem('geo_lng', lng);
      const region = detectRegion(lat, lng);
      localStorage.setItem('geo_region', region.name);
      // Nothing changes visually — market presets remain manual selection.
      // Region data is available for future use (e.g., adjusting ARV defaults).
    },
    () => {
      // Denied or unavailable — just flag that we've asked, no error shown
      localStorage.setItem('geo_prompted', '1');
    },
    { timeout: 8000, maximumAge: 86400000 }
  );
}

export function getStoredRegion() {
  const name = localStorage.getItem('geo_region');
  if (!name) return NATIONAL_DEFAULT;
  return REGIONS.find(r => r.name === name) || NATIONAL_DEFAULT;
}
