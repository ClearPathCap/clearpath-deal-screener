# GPT Market Benchmark Template
# Deal Screener — Clear Path Capital
# Instructions: Copy the SYSTEM PROMPT and the batch-specific USER PROMPT into GPT-4o.
# Swap the market list only. Everything else stays the same.
# Save each GPT response as a separate file, then bring to Cowork to compile.

---

## SYSTEM PROMPT (paste this first — set as system/custom instructions)

You are a real estate market research assistant helping build benchmark data for a national deal analysis app used by fix & flip and rental investors. Your job is to produce accurate, research-grounded benchmark figures for each market I give you.

Sources to draw from (use the most recent available data, ideally 2025–2026):
- Redfin market data (median price, days on market, price trends)
- AirDNA / Rabbu / Airbnb Insights (STR revenue, occupancy, ADR)
- Zumper / RentCafe / Apartment List (LTR rents, vacancy)
- Local MLS reports, BiggerPockets market data
- Construction cost indices for rehab estimates (RSMeans, local GC averages)

For each market, produce ONLY the JavaScript object I ask for — no prose, no explanations, no markdown fencing. Output must be valid JavaScript that can be pasted directly into a .js file. If you are genuinely uncertain about a value, set `confidence: "Low"` and note why in the `rehabNote` or `benchmarkNote` field. Do not fabricate data — a confident wrong number is worse than a flagged estimate.

---

## BATCH 1 — Fix & Flip: Southeast
### Markets: NC, SC, GA, FL, AL, TN, VA (coastal)
### Paste as USER PROMPT after setting the system prompt above

Produce Fix & Flip benchmark data for the following markets. Output each as a JavaScript object matching EXACTLY this format — no deviations:

```
'slug-here': {
  name: 'City ST',
  state: 'ST',
  medianArv: 000000,
  dom: 00,
  arvRuleLow: 0.00,
  arvRuleHigh: 0.00,
  holdPctLow: 0.0000,
  holdPctHigh: 0.0000,
  repairLow: 00,
  repairHigh: 000,
  rehabNote: 'One sentence: what drives rehab costs in this market.',
  strViability: 'Low|Medium|Medium-High|High',
  strRevLow: 00000,
  strRevHigh: 00000,
  confidence: 'High|Medium|Low',
  sourceUrl: 'https://redfin.com/...',
},
```

Field definitions:
- slug: lowercase-city-state (e.g., 'charlotte-nc')
- state: two-letter abbreviation
- medianArv: median sold price for investor-grade SFR (3br/2ba), in dollars
- dom: median days on market
- arvRuleLow/High: MAO rule — what fraction of ARV a flip investor typically pays (e.g. 0.65 = 65% of ARV). Lower = more conservative market.
- holdPctLow/High: monthly holding cost as % of ARV (financing, taxes, insurance, utilities). Typical range 0.005–0.010.
- repairLow/High: rehab cost in $/sf range for a mid-grade renovation (not cosmetic-only, not full gut)
- rehabNote: one sentence on what specifically drives costs higher or lower in this market
- strViability: how viable is this market for short-term rental (Airbnb/VRBO)?
- strRevLow/High: estimated annual gross STR revenue range for a 3br property, in dollars
- confidence: your confidence in these estimates based on data availability
- sourceUrl: the best Redfin URL for this market's housing data

MARKETS TO BENCHMARK (Fix & Flip, Southeast):

North Carolina:
- Charlotte NC (slug: charlotte-nc) — ALREADY HAVE, skip
- Raleigh NC (slug: raleigh-nc) — ALREADY HAVE, skip
- Greensboro NC (slug: greensboro-nc)
- Durham NC (slug: durham-nc)
- Winston-Salem NC (slug: winston-salem-nc)
- Fayetteville NC (slug: fayetteville-nc)
- Wilmington NC (slug: wilmington-nc)
- Asheville NC (slug: asheville-nc)

South Carolina:
- Columbia SC (slug: columbia-sc)
- Greenville SC (slug: greenville-sc)
- Charleston SC (slug: charleston-sc)
- Spartanburg SC (slug: spartanburg-sc)

Georgia:
- Atlanta GA (slug: atlanta-ga) — ALREADY HAVE, skip
- Savannah GA (slug: savannah-ga)
- Augusta GA (slug: augusta-ga)
- Macon GA (slug: macon-ga)
- Columbus GA (slug: columbus-ga)

Florida:
- Tampa FL (slug: tampa-fl) — ALREADY HAVE, skip
- Jacksonville FL (slug: jacksonville-fl) — ALREADY HAVE, skip
- Orlando FL (slug: orlando-fl)
- Miami FL (slug: miami-fl)
- Fort Lauderdale FL (slug: fort-lauderdale-fl)
- West Palm Beach FL (slug: west-palm-beach-fl)
- Cape Coral FL (slug: cape-coral-fl)
- Sarasota FL (slug: sarasota-fl)
- Pensacola FL (slug: pensacola-fl)
- Tallahassee FL (slug: tallahassee-fl)

Alabama:
- Birmingham AL (slug: birmingham-al) — ALREADY HAVE, skip
- Huntsville AL (slug: huntsville-al)
- Montgomery AL (slug: montgomery-al)
- Mobile AL (slug: mobile-al)

Tennessee:
- Nashville TN (slug: nashville-tn) — ALREADY HAVE, skip
- Memphis TN (slug: memphis-tn) — ALREADY HAVE, skip
- Knoxville TN (slug: knoxville-tn)
- Chattanooga TN (slug: chattanooga-tn) — ALREADY HAVE, skip
- Clarksville TN (slug: clarksville-tn)

Virginia (coastal/Southeast):
- Virginia Beach VA (slug: virginia-beach-va)
- Richmond VA (slug: richmond-va)
- Norfolk VA (slug: norfolk-va)

Output every market NOT marked "ALREADY HAVE". Output only the JavaScript objects, no other text.

---

## BATCH 2 — Fix & Flip: South Central
### Markets: TX, OK, AR, LA, MS, KS

MARKETS TO BENCHMARK (Fix & Flip, South Central):

Texas:
- Dallas TX (slug: dallas-tx) — ALREADY HAVE, skip
- Houston TX (slug: houston-tx)
- San Antonio TX (slug: san-antonio-tx) — ALREADY HAVE, skip
- Austin TX (slug: austin-tx) — ALREADY HAVE, skip
- Fort Worth TX (slug: fort-worth-tx)
- El Paso TX (slug: el-paso-tx)
- Lubbock TX (slug: lubbock-tx)
- Amarillo TX (slug: amarillo-tx)
- McAllen TX (slug: mcallen-tx)
- Corpus Christi TX (slug: corpus-christi-tx)

Oklahoma:
- Oklahoma City OK (slug: oklahoma-city-ok)
- Tulsa OK (slug: tulsa-ok)

Arkansas:
- Little Rock AR (slug: little-rock-ar)
- Fayetteville AR (slug: fayetteville-ar)

Louisiana:
- Baton Rouge LA (slug: baton-rouge-la)
- New Orleans LA (slug: new-orleans-la)
- Shreveport LA (slug: shreveport-la)

Mississippi:
- Jackson MS (slug: jackson-ms)
- Hattiesburg MS (slug: hattiesburg-ms)

Kansas:
- Wichita KS (slug: wichita-ks)
- Kansas City KS (slug: kansas-city-ks)

---

## BATCH 3 — Fix & Flip: Midwest
### Markets: OH, IN, MO, KY, MI, IL, WI, MN, IA, NE

MARKETS TO BENCHMARK (Fix & Flip, Midwest):

Ohio:
- Columbus OH (slug: columbus-oh) — ALREADY HAVE, skip
- Cleveland OH (slug: cleveland-oh)
- Cincinnati OH (slug: cincinnati-oh)
- Dayton OH (slug: dayton-oh)
- Toledo OH (slug: toledo-oh)
- Akron OH (slug: akron-oh)

Indiana:
- Indianapolis IN (slug: indianapolis-in) — ALREADY HAVE, skip
- Fort Wayne IN (slug: fort-wayne-in)
- Evansville IN (slug: evansville-in)

Missouri:
- Kansas City MO (slug: kansas-city-mo) — ALREADY HAVE, skip
- St. Louis MO (slug: st-louis-mo)
- Springfield MO (slug: springfield-mo)

Kentucky:
- Louisville KY (slug: louisville-ky)
- Lexington KY (slug: lexington-ky)

Michigan:
- Detroit MI (slug: detroit-mi)
- Grand Rapids MI (slug: grand-rapids-mi)
- Lansing MI (slug: lansing-mi)

Illinois:
- Chicago IL (slug: chicago-il)
- Rockford IL (slug: rockford-il)
- Peoria IL (slug: peoria-il)

Wisconsin:
- Milwaukee WI (slug: milwaukee-wi)
- Madison WI (slug: madison-wi)

Minnesota:
- Minneapolis MN (slug: minneapolis-mn)
- Rochester MN (slug: rochester-mn)

Iowa:
- Des Moines IA (slug: des-moines-ia)

Nebraska:
- Omaha NE (slug: omaha-ne)

---

## BATCH 4 — Fix & Flip: Mountain West
### Markets: AZ, CO, NV, UT, ID, NM, WY, MT

MARKETS TO BENCHMARK (Fix & Flip, Mountain West):

Arizona:
- Phoenix AZ (slug: phoenix-az) — ALREADY HAVE, skip
- Scottsdale AZ (slug: scottsdale-az) — ALREADY HAVE, skip
- Tucson AZ (slug: tucson-az)
- Mesa AZ (slug: mesa-az)
- Gilbert AZ (slug: gilbert-az)

Colorado:
- Denver CO (slug: denver-co) — ALREADY HAVE, skip
- Colorado Springs CO (slug: colorado-springs-co)
- Aurora CO (slug: aurora-co)
- Fort Collins CO (slug: fort-collins-co)

Nevada:
- Las Vegas NV (slug: las-vegas-nv)
- Reno NV (slug: reno-nv)
- Henderson NV (slug: henderson-nv)

Utah:
- Salt Lake City UT (slug: salt-lake-city-ut)
- Provo UT (slug: provo-ut)
- Ogden UT (slug: ogden-ut)

Idaho:
- Boise ID (slug: boise-id)
- Nampa ID (slug: nampa-id)

New Mexico:
- Albuquerque NM (slug: albuquerque-nm)

Wyoming:
- Casper WY (slug: casper-wy)

---

## BATCH 5 — Fix & Flip: Pacific Coast
### Markets: CA, OR, WA

MARKETS TO BENCHMARK (Fix & Flip, Pacific Coast):

California:
- Los Angeles CA (slug: los-angeles-ca)
- San Diego CA (slug: san-diego-ca)
- Sacramento CA (slug: sacramento-ca)
- Fresno CA (slug: fresno-ca)
- Riverside CA (slug: riverside-ca)
- Bakersfield CA (slug: bakersfield-ca)
- Stockton CA (slug: stockton-ca)

Oregon:
- Portland OR (slug: portland-or)
- Eugene OR (slug: eugene-or)
- Salem OR (slug: salem-or)

Washington:
- Seattle WA (slug: seattle-wa)
- Tacoma WA (slug: tacoma-wa)
- Spokane WA (slug: spokane-wa)

---

## BATCH 6 — Fix & Flip: Northeast
### Markets: PA, NY, NJ, CT, MA, MD, VA (northern), RI, DE, DC, NH, VT, ME

MARKETS TO BENCHMARK (Fix & Flip, Northeast):

Pennsylvania:
- Philadelphia PA (slug: philadelphia-pa)
- Pittsburgh PA (slug: pittsburgh-pa)
- Allentown PA (slug: allentown-pa)

New York:
- Buffalo NY (slug: buffalo-ny)
- Rochester NY (slug: rochester-ny)
- Albany NY (slug: albany-ny)
- Syracuse NY (slug: syracuse-ny)
(Note: NYC metro excluded — margin profile does not fit typical flip model)

New Jersey:
- Trenton NJ (slug: trenton-nj)
- Camden NJ (slug: camden-nj)

Maryland:
- Baltimore MD (slug: baltimore-md)
- Silver Spring MD (slug: silver-spring-md)

Connecticut:
- Hartford CT (slug: hartford-ct)
- Bridgeport CT (slug: bridgeport-ct)

Massachusetts:
- Springfield MA (slug: springfield-ma)
- Worcester MA (slug: worcester-ma)

Virginia (northern):
- Roanoke VA (slug: roanoke-va)
- Fredericksburg VA (slug: fredericksburg-va)

---

## BATCHES 7–12 — STR Markets (coming next)
## Use the SAME system prompt above.
## Replace the field definitions with the STR format below.

STR output format:
```
'slug-here': {
  name: 'City/Area ST',
  state: 'ST',
  revLow: 00000,
  revHigh: 00000,
  occLow: 0.00,
  occHigh: 0.00,
  adrLow: 000,
  adrHigh: 000,
  makeReadyLow: 00,
  makeReadyHigh: 000,
  regulatoryRisk: 'Low|Medium|High|Very High',
  regulatoryNote: 'One sentence on local STR rules, licensing, HOA restrictions.',
  benchmarkNote: 'One sentence on what drives revenue in this market (seasonality, demand drivers, property type).',
  confidence: 'High|Medium|Low',
  sourceUrl: 'https://www.airdna.co/...',
},
```

Field definitions:
- revLow/High: estimated annual gross STR revenue range for a 3br property
- occLow/High: occupancy rate range (decimal — 0.65 = 65%)
- adrLow/High: average daily rate range in dollars
- makeReadyLow/High: typical make-ready/cleaning cost per turn in dollars
- regulatoryRisk: how restrictive is the local STR regulatory environment?
- sourceUrl: best AirDNA URL for this market

---

## BATCHES 13–18 — LTR Markets (Long-Term Rental, Phase 2)
## Same system prompt. Use the LTR output format below.

LTR output format:
```
'slug-here': {
  name: 'City ST',
  state: 'ST',
  medRent1br: 0000,
  medRent2br: 0000,
  medRent3br: 0000,
  vacancyRate: 0.00,
  rentGrowthYoy: 0.00,
  priceToRentRatio: 00,
  ltrNote: 'One sentence on rental demand drivers, vacancy trends, or tenant profile.',
  confidence: 'High|Medium|Low',
  sourceUrl: 'https://www.zumper.com/...',
},
```

Field definitions:
- medRent1/2/3br: median monthly rent by bedroom count
- vacancyRate: rental vacancy rate (decimal — 0.06 = 6%)
- rentGrowthYoy: year-over-year rent growth (decimal — 0.04 = 4%)
- priceToRentRatio: median home price divided by annual rent (lower = better cash flow)
- sourceUrl: best Zumper or RentCafe URL for this market
