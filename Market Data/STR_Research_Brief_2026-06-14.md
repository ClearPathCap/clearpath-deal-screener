# STR Benchmark Research Brief — 21 Missing Markets
**For: GPT (deep research) · Prepared 2026-06-14 · Source of truth: this file**

## Why this exists
The Deal Screener's STR analyzer carries city-level benchmark data in a `STR_MARKETS`
table. **21 markets are offered on the STR tab but have no city-level data** — the app
currently falls back to a regional average and now honestly labels them "regional
estimate." We want real city-level numbers so these become first-class STR markets.

Research each market below and return **drop-in data entries** in the exact schema.
Use 2025–2026 figures. Cite a real source URL per market.

## The schema (every field required)
Each entry is keyed by its slug and has these fields:

| Field | Meaning | Example (Gatlinburg TN) |
|---|---|---|
| `name` | Display name "City ST" | `'Gatlinburg TN'` |
| `region` | One of: Southeast, South Central, Midwest, Mountain West, Pacific, Northeast | `'Southeast'` |
| `revLow` / `revHigh` | **Annual gross STR revenue** range, whole $ (typical 3BR/median listing) | `48000` / `64000` |
| `occLow` / `occHigh` | **Occupancy** as a decimal (0–1) | `0.44` / `0.65` |
| `adrLow` / `adrHigh` | **Average Daily Rate**, whole $ | `347` / `366` |
| `makeReadyLow` / `makeReadyHigh` | **Furnishing / make-ready cost, $ per sq ft** | `45` / `110` |
| `regulatoryRisk` | One of: Low, Low-Medium, Medium, Medium-High, High | `'Low-Medium'` |
| `regulatoryNote` | 1 sentence on permits/zoning/HOA risk to verify | `'Verify county/city permits, fire/safety…'` |
| `benchmarkNote` | 1 sentence on what drives revenue in this market | `'High-demand Smoky Mountain cabin market; hot tubs, views… drive spread.'` |
| `confidence` | Your confidence in the numbers: Low / Medium / Medium-High / High | `'High'` |
| `sourceUrl` | A real URL backing the figures (AirDNA, AirROI, Rabbu, Zumper, etc.) | `'https://www.airroi.com/…/gatlinburg'` |

### Exact reference entry (copy this shape)
```js
'gatlinburg-tn': {
  name: 'Gatlinburg TN', region: 'Southeast',
  revLow: 48000, revHigh: 64000,
  occLow: 0.44, occHigh: 0.65,
  adrLow: 347, adrHigh: 366,
  makeReadyLow: 45, makeReadyHigh: 110,
  regulatoryRisk: 'Low-Medium',
  regulatoryNote: 'Verify county/city permits, fire/safety, well/septic, roads, and HOA restrictions.',
  benchmarkNote: 'High-demand Smoky Mountain cabin market; hot tubs, views, game rooms, and bedroom count drive spread.',
  confidence: 'High',
  sourceUrl: 'https://www.airroi.com/airbnb-data/united-states/tennessee/gatlinburg',
},
```

## The 21 markets to research

| Slug (do not change) | Market | Region |
|---|---|---|
| `cape-coral-fl` | Cape Coral FL | Southeast |
| `fort-lauderdale-fl` | Fort Lauderdale FL | Southeast |
| `knoxville-tn` | Knoxville TN | Southeast |
| `miami-fl` | Miami FL | Southeast |
| `nashville-tn` | Nashville TN | Southeast |
| `pensacola-fl` | Pensacola FL | Southeast |
| `roanoke-va` | Roanoke VA | Southeast |
| `sarasota-fl` | Sarasota FL | Southeast |
| `west-palm-beach-fl` | West Palm Beach FL | Southeast |
| `wilmington-nc` | Wilmington NC | Southeast |
| `corpus-christi-tx` | Corpus Christi TX | South Central |
| `fayetteville-ar` | Fayetteville AR | South Central |
| `new-orleans-la` | New Orleans LA | South Central |
| `colorado-springs-co` | Colorado Springs CO | Mountain West |
| `fort-collins-co` | Fort Collins CO | Mountain West |
| `gilbert-az` | Gilbert AZ | Mountain West |
| `henderson-nv` | Henderson NV | Mountain West |
| `las-vegas-nv` | Las Vegas NV | Mountain West |
| `mesa-az` | Mesa AZ | Mountain West |
| `san-diego-ca` | San Diego CA | Pacific |
| `seattle-wa` | Seattle WA | Pacific |

## Output format (so it drops straight into the code)
Return **one JS object literal per market**, exactly like the reference entry, keyed by
the slug above, ready to paste into `STR_MARKETS` in `markets.js`. Group them in the
order listed. Flag any market where STR is legally restricted (e.g., short-term rentals
banned or capped) in the `regulatoryNote` and set `regulatoryRisk` accordingly — several
of these (Miami, Fort Lauderdale, San Diego, Seattle, Las Vegas) have real STR ordinances
worth calling out.

## Notes / gotchas
- Numbers should reflect a **typical investable listing** (≈3BR / market-median), not the
  top 10% "superhost" outliers.
- `revLow`/`revHigh` is **annual gross revenue**, already occupancy-adjusted (this is the
  number an investor pastes from AirDNA/Rabbu). The app multiplies the user's entry by the
  occupancy they choose, so these benchmarks are for the user's reference, not a formula input.
- If a market's STR market is thin or data is sparse, set `confidence: 'Low'` rather than guessing.
- Keep each note to one sentence.
