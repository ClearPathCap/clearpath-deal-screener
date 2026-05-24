// ─── Market preset data + geolocation regional lookup ────────────────────────

// ─── Fix & Flip presets (all 13 markets) ─────────────────────────────────────

export const FLIP_PRESETS = {
  'charlotte-nc':    { hold: 5, carry: 900,  target: 40000 },
  'atlanta-ga':      { hold: 5, carry: 950,  target: 42000 },
  'dallas-tx':       { hold: 5, carry: 1000, target: 45000 },
  'phoenix-az':      { hold: 5, carry: 1100, target: 45000 },
  'tampa-fl':        { hold: 5, carry: 1050, target: 42000 },
  'nashville-tn':    { hold: 5, carry: 1000, target: 45000 },
  'indianapolis-in': { hold: 5, carry: 750,  target: 35000 },
  'columbus-oh':     { hold: 5, carry: 800,  target: 35000 },
  'kansas-city-mo':  { hold: 5, carry: 800,  target: 35000 },
  'memphis-tn':      { hold: 5, carry: 700,  target: 32000 },
  'jacksonville-fl': { hold: 5, carry: 900,  target: 38000 },
  'san-antonio-tx':  { hold: 5, carry: 850,  target: 38000 },
  'birmingham-al':   { hold: 5, carry: 700,  target: 32000 },
};

// ─── STR / Rental presets (all 10 markets) ───────────────────────────────────

export const RENTAL_PRESETS = {
  'ocean-lakes-sc':  { down: 20, occ: 62, mgmt: 3, pm: 0, tax: 6200,  maint: 3000, furnish: 18000, target: 6 },
  'gatlinburg-tn':   { down: 20, occ: 70, mgmt: 3, pm: 0, tax: 4700,  maint: 3500, furnish: 22000, target: 6 },
  'pigeon-forge-tn': { down: 20, occ: 65, mgmt: 3, pm: 0, tax: 4300,  maint: 3000, furnish: 20000, target: 6 },
  'lake-murray-sc':  { down: 20, occ: 55, mgmt: 3, pm: 0, tax: 3800,  maint: 3000, furnish: 16000, target: 6 },
  'destin-fl':       { down: 20, occ: 68, mgmt: 3, pm: 0, tax: 7500,  maint: 3500, furnish: 22000, target: 6 },
  'blue-ridge-ga':   { down: 20, occ: 65, mgmt: 3, pm: 0, tax: 4000,  maint: 3000, furnish: 20000, target: 6 },
  'outer-banks-nc':  { down: 20, occ: 65, mgmt: 3, pm: 0, tax: 7000,  maint: 4000, furnish: 25000, target: 6 },
  'hilton-head-sc':  { down: 20, occ: 60, mgmt: 3, pm: 0, tax: 6500,  maint: 3500, furnish: 22000, target: 6 },
  'gulf-shores-al':  { down: 20, occ: 62, mgmt: 3, pm: 0, tax: 5500,  maint: 3000, furnish: 18000, target: 6 },
  'branson-mo':      { down: 20, occ: 60, mgmt: 3, pm: 0, tax: 3500,  maint: 2500, furnish: 15000, target: 6 },
};

// ─── STR rent ranges for hint display ────────────────────────────────────────

export const RENTAL_RENT_RANGES = {
  'ocean-lakes-sc':  { low: 40000,  high: 85000 },
  'gatlinburg-tn':   { low: 48000,  high: 140000 },
  'pigeon-forge-tn': { low: 42000,  high: 110000 },
  'lake-murray-sc':  { low: 35000,  high: 80000 },
  'destin-fl':       { low: 55000,  high: 150000 },
  'blue-ridge-ga':   { low: 45000,  high: 120000 },
  'outer-banks-nc':  { low: 50000,  high: 145000 },
  'hilton-head-sc':  { low: 45000,  high: 110000 },
  'gulf-shores-al':  { low: 40000,  high: 100000 },
  'branson-mo':      { low: 30000,  high: 80000 },
};

// ─── Regional market conditions (no external API — lat/lng bounding boxes) ───

const REGIONS = [
  {
    name: 'Northeast',
    arvRule: 0.65,
    holdAdj: 1.15,
    states: ['ME','NH','VT','MA','RI','CT','NY','NJ'],
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

export function initGeolocation() {
  if (!('geolocation' in navigator)) return;
  if (localStorage.getItem('geo_prompted')) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      localStorage.setItem('geo_prompted', '1');
      localStorage.setItem('geo_lat', lat);
      localStorage.setItem('geo_lng', lng);
      const region = detectRegion(lat, lng);
      localStorage.setItem('geo_region', region.name);
    },
    () => {
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
