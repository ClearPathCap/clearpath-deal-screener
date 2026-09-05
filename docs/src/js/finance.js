// ─── Shared rental finance engine (LTR + BRRR) ────────────────────────────────
// One income/DSCR formula, two analyzers. LTR calls it with the purchase loan;
// BRRR calls it with the refi loan. Pure functions only — no DOM, no markets —
// so the analyzer glue (ltr.js / brrr.js) and the Node acceptance tests both run
// the identical math. Reference for SPEC_LTR_ANALYZER §2 / SPEC_BRRR_ANALYZER §2.

// CPC brokering minimum — a REFERRAL threshold, not an analysis limit. The
// screener sizes and grades every deal regardless of size; this constant only
// governs whether the Clear Path handoff is available (CPC brokers loans of
// $100K+, matching the CPC site's public range). History: $150K → $50K
// (2026-06-18) → $100K (2026-08-10, aligned with CPC's owner-ratified floor).
// No upper cap. Pure so the gates stay testable.
export const CPC_BROKER_MIN = 100000;

// ─── Property-size bands (multifamily support) ───────────────────────────────
// 1–4 units = standard SFR / small-residential DSCR; 5–8 = small-multifamily DSCR
// (tighter LTV, higher reserves, a ~1.20 lender floor); 9+ = commercial — routed to
// manual CPC review, never auto-screened. propertyBand defaults to '1-4' for blank or
// invalid units, so every pre-existing 1–4 code path is byte-for-byte unchanged.
export function propertyBand(units){const n=Number(units);if(!Number.isFinite(n)||n<=4)return '1-4';if(n<=8)return '5-8';return '9plus';}
export const BAND_RULES={
 '1-4':{maxLtv:0.80,down:20,vac:5, pm:8,maint:5,capex:5,hotDscr:1.25,mosStrong:1.15,label:'Rental / DSCR'},
 '5-8':{maxLtv:0.75,down:25,vac:10,pm:9,maint:8,capex:6,hotDscr:1.25,smallMfFloor:1.20,mosStrong:1.20,label:'Small Multifamily DSCR'},
};

// DSCR / LTR funnel gate (SPEC_LTR §6c). ltv is a FRACTION (loan ÷ value, ~0.75);
// dscr a number. Undefined ltv/dscr are not disqualifying. No upper loan cap. The
// LTV ceiling is band-specific (1–4 ≤ 80%, 5–8 ≤ 75%); 9+ never auto-qualifies.
export function qualifiesForCpcLtr({ loan, ltv, dscr, band = '1-4' }) {
  if (band === '9plus') return false;                         // commercial → manual review only
  if (!loan || loan < CPC_BROKER_MIN) return false;
  const maxLtv = (BAND_RULES[band] || BAND_RULES['1-4']).maxLtv;
  if (ltv !== undefined && ltv > maxLtv) return false;
  if (dscr !== undefined && dscr < 1.0) return false;
  return true;
}

// BRRR funnel gate (SPEC_BRRR §6) — qualifies on the refi takeout (loan = refiLoan).
export function qualifiesForCpcBrrr({ loan, ltv, dscr, band = '1-4' }) {
  return qualifiesForCpcLtr({ loan, ltv, dscr, band });
}

// ─── Input validation (B2). Pure: returns blocking errors + soft warnings. Caller
// (analyzer glue) renders inline and aborts compute on any error. Treat undefined as
// "absent → default → in range" (skip it) — no out-of-range input may produce HOT. ──
const RANGE = {
  pct:    [0, 100],   // down, vacancy, pm, maint, capex, contingency, refiLtv, cc, reficost
  rate:   [0, 30],    // rate, acqRate, refiRate
  points: [0, 15],    // points, acqPoints
};
function oob(v, [lo, hi]) { return v !== undefined && v !== null && Number.isFinite(+v) && (+v < lo || +v > hi); }

// type: 'flip' | 'ltr' | 'brrr'. raw = the same whole-number/$ values the analyzer read.
export function validateInputs(type, raw) {
  const errors = [];
  const warnings = [];
  const err  = (field, label, message) => errors.push({ field, label, message });
  const warn = (field, label, message) => warnings.push({ field, label, message });

  if (type === 'ltr') {
    if (oob(raw.down,  RANGE.pct))   err('l-down','Down payment','must be between 0% and 100%.');
    if (oob(raw.vac,   RANGE.pct))   err('l-vac','Vacancy','must be between 0% and 100%.');
    if (oob(raw.pm,    RANGE.pct))   err('l-pm','Property mgmt','must be between 0% and 100%.');
    if (oob(raw.maint, RANGE.pct))   err('l-maint','Maintenance','must be between 0% and 100%.');
    if (oob(raw.capex, RANGE.pct))   err('l-capex','CapEx reserve','must be between 0% and 100%.');
    if (oob(raw.cc,    RANGE.pct))   err('l-cc','Closing costs','must be between 0% and 100%.');
    if (oob(raw.rate,  RANGE.rate))  err('l-rate','Interest rate','must be between 0% and 30%.');
    if (oob(raw.points,RANGE.points))err('l-points','Points','must be between 0 and 15.');
  } else if (type === 'brrr') {
    if (oob(raw.contingency, RANGE.pct))   err('b-contingency','Contingency','must be between 0% and 100%.');
    if (oob(raw.refiLtv,     RANGE.pct))   err('b-refiltv','Refi LTV','must be between 0% and 100%.');
    if (oob(raw.cc,          RANGE.pct))   err('b-cc','Closing costs','must be between 0% and 100%.');
    if (oob(raw.reficost,    RANGE.pct))   err('b-reficost','Refi costs','must be between 0% and 100%.');
    if (oob(raw.vac,         RANGE.pct))   err('b-vac','Vacancy','must be between 0% and 100%.');
    if (oob(raw.pm,          RANGE.pct))   err('b-pm','Property mgmt','must be between 0% and 100%.');
    if (oob(raw.maint,       RANGE.pct))   err('b-maint','Maintenance','must be between 0% and 100%.');
    if (oob(raw.capex,       RANGE.pct))   err('b-capex','CapEx reserve','must be between 0% and 100%.');
    if (oob(raw.acqRate,     RANGE.rate))  err('b-acqrate','Bridge rate','must be between 0% and 30%.');
    if (oob(raw.refiRate,    RANGE.rate))  err('b-refirate','Refi rate','must be between 0% and 30%.');
    if (oob(raw.acqPoints,   RANGE.points))err('b-acqpoints','Bridge points','must be between 0 and 15.');
  } else if (type === 'str') {
    // STR % fields are whole numbers (validate the raw value before the /100). No
    // points field and no separate loan input — so no flip-style loan-vs-cost check.
    if (oob(raw.down, RANGE.pct))  err('v-down','Down payment','must be between 0% and 100%.');
    if (oob(raw.occ,  RANGE.pct))  err('v-occ','Occupancy','must be between 0% and 100%.');
    if (oob(raw.mgmt, RANGE.pct))  err('v-mgmt','Platform fee','must be between 0% and 100%.');
    if (oob(raw.pm,   RANGE.pct))  err('v-pm','Property mgmt','must be between 0% and 100%.');
    if (oob(raw.rate, RANGE.rate)) err('v-interest-rate','Interest rate','must be between 0% and 30%.');
    if (raw.price   !== undefined && Number.isFinite(+raw.price)   && +raw.price   <= 0) err('v-price','Purchase price','must be greater than 0.');
    if (raw.revenue !== undefined && Number.isFinite(+raw.revenue) && +raw.revenue <= 0) err('v-rent','Annual revenue','must be greater than 0.');
    if (raw.tax     !== undefined && Number.isFinite(+raw.tax)     && +raw.tax     < 0) err('v-tax','Taxes + insurance','can\'t be negative.');
    if (raw.maint   !== undefined && Number.isFinite(+raw.maint)   && +raw.maint   < 0) err('v-maint','Maintenance','can\'t be negative.');
    if (raw.furnish !== undefined && Number.isFinite(+raw.furnish) && +raw.furnish < 0) err('v-furnish','Furnishing','can\'t be negative.');
  } else { // flip
    if (oob(raw.cc1, RANGE.pct)) err('f-cc1','Buying costs','must be between 0% and 100%.');
    if (oob(raw.cc2, RANGE.pct)) err('f-cc2','Selling costs','must be between 0% and 100%.');
    if (oob(raw.rate, RANGE.rate)) err('f-rate','Loan rate','must be between 0% and 30%.');
    if (oob(raw.points, RANGE.points)) err('f-points','Points','must be between 0 and 15.');
    const cost = (+raw.ask || 0) + (+raw.rep || 0);
    if (raw.loan !== undefined && cost > 0 && +raw.loan > cost)
      err('f-loan','Loan amount','can\'t exceed purchase + rehab (' + Math.round(cost).toLocaleString() + ') — that makes cash invested negative.');
  }

  // ── Soft, non-blocking plausibility warnings (compute still runs) ──
  const price = +raw.price || +raw.ask || 0;
  const rentMo = +raw.rentMo || +raw.rent || 0;
  if (price > 0 && rentMo > 0) {
    const onePct = (rentMo / price) * 100;
    if (onePct > 3)   warn('rent','Rent','looks high for the price (over 3% of price/mo) — double-check this number.');
    if (onePct < 0.3) warn('rent','Rent','looks low for the price (under 0.3% of price/mo) — double-check this number.');
  }
  return { errors, warnings };
}

// Post-compute plausibility warnings (need NOI/DSCR, so they can't live in the pure
// pre-compute validator). Caller appends these to the same inline warnings box AFTER
// computeX. No-ops on metrics that don't apply (flip has no dscr/capRate).
export function plausibilityWarnings(m) {
  const w = [];
  if (m && m.dscr != null && m.dscr > 3) {
    w.push({ field: 'dscr', label: 'DSCR', message: 'looks unusually high — double-check rent/price.' });
  }
  if (m && m.capRate != null && m.capRate > 20) {
    w.push({ field: 'cap', label: 'Cap rate', message: 'looks unusually high — double-check the numbers.' });
  }
  return w;
}

// ─── Verdict & Risk Framework (SPEC_VERDICT_RISK_FRAMEWORK_2026-06-18) ─────────
// A HOT deal = strong dollars AND low risk. Every verdict clears 3 bars: a dollar
// floor, a return/safety metric, and a STRESS TEST (conservative haircuts it must
// survive). Risk floors + haircuts are FIXED nationwide constants (not user-editable);
// only the existing per-deal target fields stay editable.
const money = (n) => '$' + Math.round(n).toLocaleString();

// Margin-of-Safety tile: Strong / Tight / Fails (HOT must be Strong or Tight).
export function mosLabel(mos) {
  return mos === 'strong'
    ? { label: 'Strong', cls: 'good' }
    : mos === 'tight'
      ? { label: 'Tight', cls: 'warn' }
      : { label: 'Fails', cls: 'bad' };
}

// ── Canonical Fix & Flip base engine ─────────────────────────────────────────
// THE one place the flip numbers come from. Until the UX wave this math lived
// inline in analyzeFlip (DOM-coupled) while computeFlipStress re-derived the
// same cost formulas under haircuts — two copies of one formula set. Both now
// delegate here, and the Pipeline editor recomputes saved deals through this
// exact function, so the analyzer, the stress test, and an edited saved deal
// can never disagree.
//
// Units contract (matches what analyzeFlip always used internally):
//   cc1 / cc2 / rate / points are FRACTIONS (0.02, not 2). Callers holding the
//   saved-deal schema must convert: saved cc1/cc2 are whole numbers, saved
//   rate/points are already fractions.
//   loan 0 or absent = all-cash view; self toggles the 75%/70% max-offer rule.
export function computeFlip({ ask, arv, rep, hold, cc1, cc2, carry, loan = 0, rate = 0.10, points = 0.03, self = false }) {
  const financed = loan > 0;
  const cost     = ask + rep;
  const buyCost  = ask * cc1;
  const sellCost = arv * cc2;
  const holdCost = carry * hold;                              // non-loan holding only
  const loanInt  = financed ? loan * (rate / 12) * hold : 0;  // interest-only carry
  const loanFees = financed ? loan * points : 0;              // origination + broker points
  const finCost  = loanInt + loanFees;

  const cashIn   = financed ? (cost - loan) + buyCost + holdCost + finCost
                            : cost + buyCost + holdCost;       // investment basis
  const totalIn  = cost + buyCost + holdCost + finCost;        // all-in (excl. selling costs)
  const profit   = arv - sellCost - cost - buyCost - holdCost - finCost;
  const roi      = cashIn > 0 ? (profit / cashIn) * 100 : 0;   // leveraged when financed
  const maxOffer = arv * (self ? 0.75 : 0.70) - rep;
  const ltvVal   = financed ? (loan / arv) * 100 : (ask / arv) * 100;
  const ltvLabel = financed ? 'LTV' : 'Price / ARV';
  const ltc      = financed && cost > 0 ? (loan / cost) * 100 : 0;

  return { financed, cost, buyCost, sellCost, holdCost, loanInt, loanFees, finCost,
           cashIn, totalIn, profit, roi, maxOffer, ltvVal, ltvLabel, ltc };
}

// ── Fix & Flip profit visual law (Track C — flip ONLY; display, not verdict) ─
// Scales with the investor's own Min Profit Target instead of treating every
// investor identically:
//   bad  (red):   profit <= 0, or below min($10,000, target)
//   warn (amber): clears the red floor but is below the target
//   good (green): meets the target
// With Aaron's $28,000 target: loss→red, $5,000→red, $15,000→amber, $28,000+→green.
export function flipProfitClass(profit, target) {
  const t = Number.isFinite(+target) && +target > 0 ? +target : 40000;
  if (profit <= 0 || profit < Math.min(10000, t)) return 'bad';
  if (profit < t) return 'warn';
  return 'good';
}

// ── Underwriting design wave · DealFit profit guidance + negotiation model ───
// GOVERNED v1 (owner dispatch, 2026-08-31). Everything here is DERIVED
// guidance layered around canonical computeFlip — no second profit formula
// exists anywhere in this block: every price→profit question is answered by
// calling computeFlip itself. The user's own Min Profit Target remains
// authoritative for the walk-away; DealFit's suggested range is educational.

// §B/§C · DealFit suggested PROJECT profit (apples-to-apples with the user's
// target and the projected profit — labor allowance is ADDED to the
// investment-return band so all three speak the same unit).
// Engine-unit inputs: arv/rep dollars, hold months, self boolean.
// Returns null when the inputs can't support a recommendation (§G4).
export function flipProfitGuidance({ arv, rep, hold, self }) {
  if (!Number.isFinite(arv) || arv <= 0 ||
      !Number.isFinite(rep) || rep < 0 ||
      !Number.isFinite(hold) || hold <= 0) return null;
  const rehabRatio = rep / arv;
  // Rehab-intensity multiplier (governed v1 boundaries: <10 / 10–<20 / 20–30 / >30 %):
  const intensity = rehabRatio < 0.10 ? 1.00
    : rehabRatio < 0.20 ? 1.10
    : rehabRatio <= 0.30 ? 1.20
    : 1.35;
  // Hold multiplier (governed v1: ≤4 / 5–6 / 7–9 / 10–12 / >12 months):
  const holdMult = hold <= 4 ? 1.00
    : hold <= 6 ? 1.05
    : hold <= 9 ? 1.15
    : hold <= 12 ? 1.25
    : 1.35;
  // Investment-return point: max($25K floor, 10% ARV × intensity × hold).
  const investmentPoint = Math.max(25000, 0.10 * arv * intensity * holdMult);
  // Owner-labor allowance: an EDUCATIONAL proxy (5% ARV, aligned with the
  // governed 75-vs-70 acquisition-rule delta) — never described as a wage.
  const laborAllowance = self ? 0.05 * arv : 0;
  const lowRaw  = investmentPoint * 0.90 + laborAllowance;
  const highRaw = investmentPoint * 1.10 + laborAllowance;
  const midRaw  = investmentPoint + laborAllowance;
  return {
    arv, rep, hold, self: !!self,   // input echo for display ("Based on: …")
    rehabRatio, intensity, holdMult, investmentPoint, laborAllowance,
    lowRaw, highRaw, midRaw,
    // Display rounding: range outward to $1K, midpoint nearest $1K.
    low:  Math.floor(lowRaw  / 1000) * 1000,
    high: Math.ceil(highRaw / 1000) * 1000,
    mid:  Math.round(midRaw / 1000) * 1000,
  };
}

// §D · derived-price solver — computeFlip IS the law. profit(P) is strictly
// decreasing in price (each extra $1 of price costs 1 + cc1 of profit), so a
// bracket + binary search on the canonical engine finds the highest INTEGER
// price whose engine profit still meets the threshold. No closed form is used
// in production. Returns null when not even $1 reaches the threshold.
// `d` carries engine-unit inputs; price is the only free variable.
export function solveMaxPriceForProfit(d, threshold) {
  if (!Number.isFinite(threshold)) return null;
  const profitAt = (P) => computeFlip({
    arv: d.arv, rep: d.rep, hold: d.hold, cc1: d.cc1, cc2: d.cc2,
    carry: d.carry, loan: d.loan || 0, rate: d.rate ?? 0.10,
    points: d.points ?? 0.03, self: !!d.self, ask: P,
  }).profit;
  if (!(profitAt(1) >= threshold)) return null;
  let lo = 1, hi = 2;
  while (profitAt(hi) >= threshold) { lo = hi; hi *= 2; if (hi > 1e12) return null; }
  // invariant: profitAt(lo) >= threshold > profitAt(hi)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (profitAt(mid) >= threshold) lo = mid; else hi = mid;
  }
  return lo;
}

// §D/§E/§F · negotiation guidance around the canonical engine.
// Engine-unit inputs (cc1/cc2/rate/points fractions) + ask + target.
// - rule ceiling: computeFlip's OWN maxOffer (the existing 70/75 law, read
//   from the engine — not re-coded here)
// - user-target ceiling: solver against the user's Min Profit Target
// - walk-away: MIN of the two (the stricter constraint protects the user)
// - conservative ceiling (educational): solver against the DealFit low bound
// - suggested counter: comfortable price for the DealFit high bound, clamped
//   into the governed 92–97% cushion below the USER walk-away, then rounded
//   DOWN to a practical increment ($5K when walk-away ≥ $100K, else $1K),
//   never above asking. The cushion is a DealFit v1 product heuristic — not a
//   claim about typical market spreads, and never a promise of acceptance.
// Returns null when guidance itself is unavailable (§G4).
export function flipNegotiationGuidance(d) {
  const guidance = flipProfitGuidance({ arv: d.arv, rep: d.rep, hold: d.hold, self: !!d.self });
  if (!guidance) return null;
  const ruleCeiling = computeFlip({ ...d, ask: d.ask ?? 0, loan: d.loan || 0 }).maxOffer;
  const target = Number.isFinite(+d.target) && +d.target > 0 ? +d.target : 40000;
  const userCeiling = solveMaxPriceForProfit(d, target);
  // §G1 · no workable price: the user's own target is unreachable at ANY
  // positive price, or the acquisition rule leaves no positive ceiling.
  const walkAwayRaw = userCeiling === null ? null : Math.min(ruleCeiling, userCeiling);
  if (walkAwayRaw === null || !(walkAwayRaw > 0)) {
    return { guidance, ruleCeiling, userCeiling, target, walkAway: null, ruleBound: null,
             conservativeCeiling: null, counterComfortRaw: null, counter: null,
             cushionDollars: null, cushionPct: null,
             highUnachievable: false, noWorkablePrice: true, askBelowWalkAway: false };
  }
  const walkAway = walkAwayRaw;
  const ruleBound = ruleCeiling <= userCeiling;
  // §E · educational conservative ceiling (DealFit low bound; raw model value):
  const conservativeCeiling = solveMaxPriceForProfit(d, guidance.lowRaw);
  // §F · comfortable price for the DealFit high bound (raw model value):
  const counterComfortRaw = solveMaxPriceForProfit(d, guidance.highRaw);
  // §G3 · if the high bound is unreachable at any positive price, do NOT
  // fabricate a counter from the cushion clamp.
  let counter = null, highUnachievable = false;
  if (counterComfortRaw === null) {
    highUnachievable = true;
  } else {
    const lower = walkAway * 0.92, upper = walkAway * 0.97;
    let candidate = Math.min(Math.max(counterComfortRaw, lower), upper);
    if (Number.isFinite(d.ask) && d.ask > 0) candidate = Math.min(candidate, d.ask);
    const inc = walkAway >= 100000 ? 5000 : 1000;
    counter = Math.floor(candidate / inc) * inc;
  }
  const askBelowWalkAway = Number.isFinite(d.ask) && d.ask > 0 && d.ask <= walkAway;   // §G2
  return {
    guidance, ruleCeiling, userCeiling, target, walkAway, ruleBound,
    conservativeCeiling, counterComfortRaw, counter,
    cushionDollars: counter !== null ? walkAway - counter : null,
    cushionPct: counter !== null ? ((walkAway - counter) / walkAway) * 100 : null,
    highUnachievable, noWorkablePrice: false, askBelowWalkAway,
  };
}

// Compact card money: "$175K" for clean thousands, exact otherwise. The
// expanded detail always keeps exact dollars — this is card-level only.
export function moneyCompact(n) {
  const v = Math.round(n);
  return v % 1000 === 0 ? '$' + (v / 1000) + 'K' : money(v);
}

// §J · negotiation what-if scenario — PURE and NON-MUTATING. Input is the
// saved-deal data schema (cc1/cc2 whole numbers, rate/points fractions), the
// same shape the old max-offer what-if consumed. Every number runs through
// canonical computeFlip / computeFlipStress; nothing here writes anywhere.
export function computeNegotiationScenario(d) {
  const eng = {
    ask: d.ask, arv: d.arv, rep: d.rep, hold: d.hold,
    cc1: (d.cc1 ?? 2) / 100, cc2: (d.cc2 ?? 5) / 100,
    carry: d.carry, loan: d.loan || 0,
    rate: d.rate ?? 0.10, points: d.points ?? 0.03,
    self: !!d.self, target: d.target,
  };
  const nego = flipNegotiationGuidance(eng);
  if (!nego) return null;
  const at = (price) => {
    if (!(price > 0)) return null;
    const e = computeFlip({ ...eng, ask: price });
    const s = computeFlipStress({ ask: price, arv: eng.arv, rep: eng.rep,
      cc1: eng.cc1, cc2: eng.cc2, carry: eng.carry, hold: eng.hold,
      financed: eng.loan > 0, loan: eng.loan, rate: eng.rate, points: eng.points,
      target: nego.target });
    const g = nego.guidance;
    return {
      price, profit: e.profit, roi: e.roi, cashIn: e.cashIn,
      totalProject: e.totalIn + e.sellCost,
      targetMet: e.profit >= nego.target,
      rangeStatus: e.profit < g.low ? 'below' : e.profit > g.high ? 'above' : 'in',
      stressedProfit: s.stressedProfit, marginOfSafety: s.marginOfSafety,
    };
  };
  return {
    originalAsk: d.ask, ...nego,
    atCounter: nego.counter !== null ? at(nego.counter) : null,
    atWalkAway: nego.walkAway !== null ? at(nego.walkAway) : null,
  };
}

// ── Flip stress test: ARV −5%, rehab +10%, hold +1 month → net profit ≥ 0 ──
// Inputs are flip base numbers (cc1/cc2/rate/points as FRACTIONS). Pure so flip.js
// and the tests share it. The stressed profit is the canonical engine run on the
// haircut inputs — one formula set, not a second copy.
export function computeFlipStress({ ask, arv, rep, cc1, cc2, carry, hold, financed, loan, rate, points, target }) {
  const stressedProfit = computeFlip({
    ask, arv: arv * 0.95, rep: rep * 1.1, hold: hold + 1,
    cc1, cc2, carry, loan: financed ? loan : 0, rate, points,
  }).profit;
  const strongBar = target > 0 ? 0.5 * target : 25000;
  const marginOfSafety =
    stressedProfit < 0 ? 'fails' : stressedProfit >= strongBar ? 'strong' : 'tight';
  return { stressedProfit, marginOfSafety };
}

// Flip verdict (SPEC_VERDICT §63). HOT: profit ≥ max($50K, target) AND ROI ≥ 15%
// AND maxOffer > 0 AND survives stress. COLD: profit < $25K base, maxOffer ≤ 0, or
// loses money under stress. WARM: works at base case but misses a HOT bar.
// Design wave: `ask` and `nego` (flipNegotiationGuidance result) are OPTIONAL —
// legacy calls without them get the exact pre-wave verdicts. With them, the
// pass-branch counter verdict becomes the dynamic negotiation instruction
// (§I: "COUNTER AT $X — WALK ABOVE $Y") and §G1's no-workable-price verdict
// exists. Verdict CLASS boundaries (hot/warm/pass) are unchanged.
export function flipVerdict({ profit, roi, target, maxOffer, marginOfSafety, stressedProfit, self, ask, nego }) {
  const survives = marginOfSafety !== 'fails';
  const hotDollar = Math.max(50000, target || 0);
  let cls, verdict, vsub;

  if (profit >= hotDollar && roi >= 15 && maxOffer > 0 && survives) {
    cls = 'hot';
    verdict = 'Strong Flip Play';
    vsub =
      'Net profit ' + money(profit) + ' clears your target at ' + (Math.round(roi * 10) / 10) +
      '% ROI, and it survives a stress test (ARV −5%, rehab +10%, +1 month → ' + money(stressedProfit) +
      '). ' + (self ? 'Self-performing gives you maximum margin.' : 'Self-performing could push margin higher.') +
      ' Verify ARV with comps before committing.';
  } else if (profit < 25000 || maxOffer <= 0 || !survives) {
    cls = 'pass';
    // §I · the counter instruction: opening offer and economic ceiling are
    // DIFFERENT numbers. Fires only when the ask actually exceeds the user's
    // walk-away and a governed counter exists; §G2 keeps the legacy verdict
    // when the ask is already at/below the walk-away; §G1 names the truth
    // when no positive price can meet the user's target.
    const dyn = nego && !nego.noWorkablePrice && nego.counter !== null &&
                Number.isFinite(ask) && ask > nego.walkAway;
    if (dyn) {
      verdict = 'Counter at ' + moneyCompact(nego.counter) + ' — Walk Above ' + money(nego.walkAway);
    } else {
      verdict = 'Counter at Max Offer — Walk Away';
    }
    if (maxOffer <= 0) {
      vsub = 'Repairs exceed the ' + (self ? '75' : '70') + '% ARV ceiling — no purchase price hits your target. Walk away.';
    } else if (!survives) {
      vsub = 'Net profit goes negative under a modest stress test (ARV −5%, rehab +10%, +1 month → ' + money(stressedProfit) + '). Too little margin of safety — renegotiate hard or walk.'
        + (dyn ? ' If you engage at all: counter at ' + money(nego.counter) + ' and walk above ' + money(nego.walkAway) + '.' : '');
    } else if (dyn) {
      vsub = 'Net profit ' + money(profit) + ' at the ask is below where this flip\'s risk is worth it. Open at ' + money(nego.counter) + ' and walk above ' + money(nego.walkAway) + ' — '
        + (nego.ruleBound ? 'your ceiling under the ' + (self ? '75' : '70') + '% acquisition rule.'
                          : 'the highest price that still clears your own profit target.');
    } else {
      vsub = 'Net profit ' + money(profit) + ' is below the $25K floor where a flip\'s risk is worth it. Max offer ' + money(Math.max(0, maxOffer)) + ' — counter hard or walk.';
    }
  } else {
    cls = 'warm';
    verdict = 'Dig Deeper & Negotiate';
    const miss = profit < hotDollar
      ? 'profit ' + money(profit) + ' is under the ' + money(hotDollar) + ' strong bar'
      : roi < 15
        ? 'ROI ' + (Math.round(roi * 10) / 10) + '% is under the 15% bar'
        : 'the stress-test margin is thin';
    vsub = 'Workable, but ' + miss + '. Counter at ' + money(Math.max(0, maxOffer)) + ' max offer' + (self ? ' — your labor advantage could close the gap.' : '.');
  }

  // §G1 (GPT review ruling on 3336faa): when required inputs are valid and the
  // canonical solver proves NO positive purchase price reaches the user's Min
  // Profit Target, the PRICE/NEGOTIATION guidance says exactly that —
  // regardless of the deal grade. The grade (cls: hot/warm/pass and its badge
  // tag) is deliberately NOT touched: grade and price guidance are separate
  // signals. If price cannot solve the problem, negotiation cannot either.
  // (A HOT grade cannot mathematically coexist with an unreachable target —
  // hot requires profit ≥ max($50K, target), so the ask itself satisfies the
  // solver; the override is still unconditional as defense in depth.)
  // Rule-side impossibility (maxOffer ≤ 0) keeps its repairs-exceed-ceiling
  // explanation, which already carries the same walk-away instruction.
  if (nego && nego.noWorkablePrice) {
    verdict = 'No Workable Price — Walk Away';
    if (maxOffer > 0) {
      vsub = 'No purchase price above $0 meets your ' + money(nego.target) + ' minimum-profit target under the current assumptions. Adjust the underwriting only if the numbers truly support it — otherwise walk away.';
    }
  }
  return { cls, verdict, vsub };
}

// Standard fully-amortizing monthly mortgage payment. annualRate is a fraction
// (0.0725), amortYears in years. loan 0 → 0 (all-cash, no divide-by-zero).
export function amortizedPaymentMonthly(loan, annualRate, amortYears) {
  if (!loan || loan <= 0) return 0;
  const i = annualRate / 12;
  const n = amortYears * 12;
  if (i === 0) return loan / n;
  return (loan * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

// Shared income block (SPEC_BRRR §8). All rate/% args are FRACTIONS (already /100).
// NOI excludes the CapEx reserve (deducted in cashFlow, not NOI) — the lender
// convention (LTR D3). dscr = NOI ÷ annual debt service, null when all-cash.
export function incomeBlock({
  rentYr,
  vac,
  pm,
  maint,
  tax,
  ins,
  hoaYr,
  capex,
  loan,
  rate,
  amortYears,
}) {
  const EGI = rentYr * (1 - vac);
  const opEx = EGI * pm + rentYr * maint + tax + ins + hoaYr;
  const NOI = EGI - opEx;
  const piMo = amortizedPaymentMonthly(loan, rate, amortYears);
  const debtYr = piMo * 12;
  const capexRes = rentYr * capex;
  const cashFlowYr = NOI - debtYr - capexRes;
  return {
    EGI,
    opEx,
    NOI,
    piMo,
    debtYr,
    capexRes,
    cashFlowYr,
    dscr: debtYr > 0 ? NOI / debtYr : null,
  };
}

// ─── LTR ──────────────────────────────────────────────────────────────────────
// Inputs are raw field values: $ amounts as numbers, percentages as whole numbers
// (down 20 → 20, not 0.20). selfManage true forces pm = 0.
export function computeLtr(inp) {
  // Band (1-4 / 5-8 / 9plus) sets the default down/vacancy/PM/maint/CapEx; all stay
  // user-overridable. 9plus should be intercepted upstream (referral, not a calc) —
  // the BAND_RULES fallback to '1-4' here is purely defensive.
  const band = propertyBand(inp.units);
  const rules = BAND_RULES[band] || BAND_RULES['1-4'];
  const price = +inp.price || 0;
  const rentMo = +inp.rentMo || 0;
  const downF = (inp.down == null ? rules.down : +inp.down) / 100;
  const vacF = (inp.vac == null ? rules.vac : +inp.vac) / 100;
  const pmF = inp.selfManage ? 0 : (inp.pm == null ? rules.pm : +inp.pm) / 100;
  const maintF = (inp.maint == null ? rules.maint : +inp.maint) / 100;
  const capexF = (inp.capex == null ? rules.capex : +inp.capex) / 100;
  const rateF = (inp.rate == null ? 7.25 : +inp.rate) / 100;
  const pointsF = (inp.points == null ? 1 : +inp.points) / 100;
  const ccF = (inp.cc == null ? 2 : +inp.cc) / 100;
  const amort = inp.amort == null ? 30 : +inp.amort;
  const tax = +inp.tax || 0;
  const ins = +inp.ins || 0;
  const hoaYr = (+inp.hoa || 0) * 12;
  const target = inp.target == null ? 8 : +inp.target;

  const rentYr = rentMo * 12;
  const loan = price * (1 - downF);

  const ib = incomeBlock({
    rentYr,
    vac: vacF,
    pm: pmF,
    maint: maintF,
    tax,
    ins,
    hoaYr,
    capex: capexF,
    loan,
    rate: rateF,
    amortYears: amort,
  });

  const capRate = price > 0 ? (ib.NOI / price) * 100 : 0;
  const cashFlowMo = ib.cashFlowYr / 12;
  const downAmt = price * downF;
  const points$ = loan * pointsF;
  const closing$ = price * ccF;
  const cashToClose = downAmt + points$ + closing$;
  const coc = cashToClose > 0 ? (ib.cashFlowYr / cashToClose) * 100 : 0;
  const onePctRule = price > 0 ? (rentMo / price) * 100 : 0;
  const grm = rentYr > 0 ? price / rentYr : 0;
  const ltv = price > 0 ? (loan / price) * 100 : 0;

  // ── Stress test. 1–4: rent −5%, vacancy +3 pts, rate +0.5% → DSCR ≥ 1.0 AND CF ≥ 0.
  // 5–8: same rent/rate haircut, but vacancy floors at one full vacant unit (1/units),
  // and Margin-of-Safety keys off the stressed DSCR vs the band's strong threshold
  // (1.20) — debt coverage, not the CapEx-adjusted monthly cash flow, is the lender bar. ──
  const stressVac = band === '5-8'
    ? Math.max(vacF + 0.05, (+inp.units > 0 ? 1 / Number(inp.units) : vacF + 0.05))
    : vacF + 0.03;
  const sIb = incomeBlock({
    rentYr: rentMo * 0.95 * 12,
    vac: stressVac,
    pm: pmF,
    maint: maintF,
    tax,
    ins,
    hoaYr,
    capex: capexF,
    loan,
    rate: rateF + 0.005,
    amortYears: amort,
  });
  const stressedDscr = sIb.dscr;
  const stressedCfMo = sIb.cashFlowYr / 12;
  let survives, marginOfSafety;
  if (band === '5-8') {
    survives = (stressedDscr === null || stressedDscr >= 1.0);
    marginOfSafety = !survives ? 'fails'
      : (stressedDscr === null || stressedDscr >= rules.mosStrong) ? 'strong' : 'tight';
  } else {
    survives = (stressedDscr === null || stressedDscr >= 1.0) && stressedCfMo >= 0;
    marginOfSafety = !survives ? 'fails'
      : (stressedDscr === null || stressedDscr >= rules.mosStrong) ? 'strong' : 'tight';
  }

  return {
    price,
    rentYr,
    EGI: ib.EGI,
    opEx: ib.opEx,
    NOI: ib.NOI,
    piMo: ib.piMo,
    debtYr: ib.debtYr,
    capexRes: ib.capexRes,
    capRate,
    cashFlowYr: ib.cashFlowYr,
    cashFlowMo,
    dscr: ib.dscr,
    loan,
    downAmt,
    points$,
    closing$,
    cashToClose,
    coc,
    onePctRule,
    grm,
    ltv,
    target,
    stressedDscr,
    stressedCfMo,
    marginOfSafety,
    units: inp.units == null ? null : Number(inp.units),
    band,
  };
}

// LTR verdict (SPEC_LTR §3 + Verdict & Risk Framework §67-70). HOT clears the
// DSCR gate AND the dollar/CoC bar AND survives the stress test. dscr === null
// (all-cash) → treated as fully covered.
// The LTR verdict's gates, extracted so DealFit Guidance can EXPLAIN the verdict
// from the same booleans that decide it — one source, no restated thresholds.
// Every expression here is lifted verbatim from ltrVerdict (which now consumes
// this). Bars: debt coverage (DSCR ≥ 1.0 ⇔ NOI ≥ debt service; all-cash ⇔ NOI ≥ 0),
// the band's lender DSCR bar (hotDscr, 1.25), the dollar-or-CoC bar ($6,000/yr OR
// CoC ≥ the user's target), positive monthly cash flow, and stress survival.
export function ltrGates(m) {
  const band = m.band || '1-4';
  const rules = BAND_RULES[band] || BAND_RULES['1-4'];
  const d = m.dscr === null ? Infinity : m.dscr;
  return {
    band,
    hotDscr: rules.hotDscr,
    smallMfFloor: rules.smallMfFloor == null ? null : rules.smallMfFloor,
    dollarBar: 6000,
    target: m.target,
    coversDebt: (m.dscr === null) ? (m.NOI >= 0) : (m.NOI >= m.debtYr),
    dscrOk: d >= rules.hotDscr,
    floorOk: band === '5-8' ? d >= rules.smallMfFloor : null,
    dollarOk: m.cashFlowYr >= 6000,
    cocOk: m.coc >= m.target,
    cfPositive: m.cashFlowMo > 0,
    survives: m.marginOfSafety !== "fails",
  };
}

export function ltrVerdict(m) {
  const band = m.band || '1-4';
  const rules = BAND_RULES[band] || BAND_RULES['1-4'];
  const hotDscr = rules.hotDscr;                 // 1.25 both bands
  const d = m.dscr === null ? Infinity : m.dscr;
  const target = m.target;
  const annualCF = m.cashFlowYr;
  const g = ltrGates(m);
  const survives = g.survives;
  const dscrText = m.dscr === null ? "n/a" : m.dscr.toFixed(2);
  const cocText = (Math.round(m.coc * 10) / 10) + "%";
  const cfMo = Math.round(m.cashFlowMo);
  let cls, verdict, vsub;

  // COLD only when the debt itself isn't covered: DSCR < 1.0 — equivalently NOI < annual
  // debt service (cash-flow-negative BEFORE the CapEx reserve). dscr === null = all-cash =
  // fully covered unless NOI itself is negative. The CapEx reserve alone never flips a
  // DSCR-fundable deal COLD (decision B5). Identical across bands.
  const coversDebt = g.coversDebt;
  if (!coversDebt) {
    cls = "pass";
    verdict = "Negative Leverage — Walk or Restructure";
    vsub = (m.dscr !== null)
      ? "DSCR of " + dscrText + " is below 1.0 — rent doesn't cover the debt at this price and down payment. Increase the down payment, negotiate price, or walk."
      : "Even all-cash, operating costs exceed income before any debt service — the property is cash-flow negative on its own. Rework rent or expenses, or walk.";
  } else if (g.dscrOk && (g.dollarOk || g.cocOk) && g.cfPositive && survives) {
    cls = "hot";
    verdict = band === '5-8' ? "Strong Small-Multifamily — Lender-Ready" : "Strong Rental — Lender-Ready";
    const stressText = band === '5-8'
      ? "Survives a stress test (rent −5%, one-vacant-unit vacancy, rate +0.5%)"
      : "Survives a stress test (rent −5%, vacancy +3pts, rate +0.5%)";
    const confirm = band === '5-8'
      ? "Verify rent roll, leases, and stabilized occupancy before closing."
      : "Confirm market rent with comps before closing.";
    vsub =
      "DSCR " + dscrText + " clears " + (band === '5-8' ? "the small-multifamily floor" : "underwriting") + " and " +
      (annualCF >= 6000
        ? money(annualCF) + "/yr cash flow is strong"
        : "cash-on-cash " + cocText + " beats your " + target + "% target") +
      ". " + stressText + ". " + confirm;
  } else if (band === '5-8') {
    // 5–8 WARM is keyed to the ~1.20 small-multifamily lender floor (DSCR-band based).
    cls = "warm";
    if (d >= rules.smallMfFloor) {
      // 1.20 ≤ DSCR < 1.25, or ≥ 1.25 that failed the multifamily stress test.
      verdict = "Clears the Floor — Light for Best Pricing";
      vsub = "DSCR " + dscrText + " clears the ~1.20 small-multifamily floor but light for best pricing — one vacant unit could break it. Verify rent roll, leases, and stabilized occupancy.";
    } else {
      // 1.0 ≤ DSCR < 1.20 — covers debt but under the small-multifamily lender floor.
      verdict = "Covers Debt — Below Small-Multifamily Floor";
      vsub = "DSCR " + dscrText + " covers debt but below the ~1.20 small-multifamily lender floor — needs more cushion to be fundable; verify rent roll, leases, stabilized occupancy.";
    }
  } else {
    cls = "warm";
    verdict = "Dig Deeper & Negotiate";
    if (m.cashFlowMo < 0) {
      // B5: DSCR ≥ 1.0 covers the debt, but the CapEx reserve tips monthly cash flow negative.
      verdict = "Covers Debt — Thin After Reserves";
      vsub = "DSCR " + dscrText + " covers the debt (lender-fundable), but it runs about $" + Math.abs(cfMo) +
             "/mo negative after the CapEx reserve. Finance-and-hold and build a cushion — negotiate price or raise rent to firm it up.";
    } else if (d >= hotDscr && !survives) {
      vsub =
        "DSCR " + dscrText + " clears underwriting at base case, but a stress test (rent −5%, vacancy +3pts, rate +0.5%) thins the margin of safety. Build in more cushion before treating it as a lock.";
    } else if (d >= hotDscr && m.coc < target && annualCF < 6000) {
      // WARM (b) — the DSCR finance-and-hold bridge
      vsub =
        "Cash-on-cash " + cocText + " is light and cash flow " + money(annualCF) +
        "/yr is below the $6,000 strong bar, but DSCR " + dscrText +
        " clears typical 1.20–1.25 underwriting — a finance-and-hold candidate even if it's not a yield play.";
    } else {
      vsub =
        "DSCR " + dscrText + " covers the debt and it cash-flows $" + cfMo +
        "/mo, but it misses a HOT bar (DSCR < 1.25, light cash flow, or a thin stress margin). Negotiate price or raise rent to tighten it.";
    }
  }
  return { cls, verdict, vsub };
}

// ─── LTR · DealFit Guidance (product parity with the F&F negotiation plan) ────
// GOVERNED APPROACH, not a new advice system: the ONLY law consulted is the
// existing ltrVerdict, evaluated over canonical computeLtr. Guidance answers
// two questions from that law alone — which of the verdict's own bars pass or
// fail right now, and what single-lever change (price to negotiate, rent to
// raise, down payment to add) would make the SAME verdict come back
// lender-ready. No threshold is invented; the predicate IS ltrVerdict.
//
// Saved-deal → engine mapping: the saved LTR record stores `rent` (monthly)
// while computeLtr reads `rentMo`; pm is stored as a whole number (0 when
// self-managed), which computeLtr accepts directly.
export function ltrEngineInput(data) {
  return {
    price: data.price, rentMo: data.rentMo != null ? data.rentMo : data.rent,
    units: data.units, down: data.down, vac: data.vac, tax: data.tax, ins: data.ins,
    hoa: data.hoa, maint: data.maint, pm: data.pm, capex: data.capex, rate: data.rate,
    amort: data.amort, points: data.points, cc: data.cc, target: data.target,
    selfManage: !!data.selfManage,
  };
}

const ltrIsHot = (inp) => ltrVerdict(computeLtr(inp)).cls === 'hot';

// Highest PRICE at which the existing verdict is 'hot' (hot-ness is monotone
// non-increasing in price: every bar — DSCR, dollar/CoC, monthly CF, stress,
// debt coverage — weakens as price rises). Integer-dollar binary search on the
// engine itself. null when no positive price is lender-ready.
export function solveLtrPriceForHot(inp) {
  const at = (P) => ltrIsHot({ ...inp, price: P });
  if (!at(1)) return null;
  let lo = 1, hi = Math.max(2, Math.round(inp.price || 2));
  if (at(hi)) { while (at(hi)) { lo = hi; hi *= 2; if (hi > 1e10) return null; } }
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid)) lo = mid; else hi = mid; }
  return lo;
}

// Lowest monthly RENT at which the verdict is 'hot' at the current price
// (monotone non-decreasing in rent). null when even a very large rent fails.
export function solveLtrRentForHot(inp) {
  const at = (R) => ltrIsHot({ ...inp, rentMo: R });
  let lo = 0, hi = Math.max(1, Math.round(inp.rentMo || 1));
  if (at(hi)) { while (lo < hi - 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid)) hi = mid; else lo = mid; } return hi; }
  while (!at(hi)) { lo = hi; hi *= 2; if (hi > 1e8) return null; }
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (at(mid)) hi = mid; else lo = mid; }
  return hi;
}

// Lowest DOWN PAYMENT % (whole points, ≤ 100) at which the verdict is 'hot'.
// CoC is not monotone in down, so this is an exhaustive 1-point scan, not a
// binary search. null when no down payment up to 100% is lender-ready.
export function solveLtrDownForHot(inp) {
  const start = Math.max(0, Math.round(inp.down == null ? 0 : +inp.down));
  for (let d = start; d <= 100; d++) if (ltrIsHot({ ...inp, down: d })) return d;
  return null;
}

// Full guidance payload for a saved LTR record (or the analyzer's live
// result). Pure and non-mutating. null when required inputs are missing.
export function ltrGuidance(data) {
  // Honest null for anything that is not an analyzed LTR record — a typed
  // non-LTR blob, an empty record, or a pending (no rent / no price) analysis.
  if (!data || typeof data !== 'object' || (data.type && data.type !== 'ltr')) return null;
  const inp = ltrEngineInput(data);
  if (!(inp.price > 0) || !(inp.rentMo > 0)) return null;
  const m = computeLtr(inp);
  const gates = ltrGates(m);
  const v = ltrVerdict(m);
  const requiredForHot = [
    { key: 'coversDebt', ok: gates.coversDebt },
    { key: 'dscrOk',     ok: gates.dscrOk },
    { key: 'cashBar',    ok: gates.dollarOk || gates.cocOk },
    { key: 'cfPositive', ok: gates.cfPositive },
    { key: 'survives',   ok: gates.survives },
  ];
  const failing = requiredForHot.filter(x => !x.ok).map(x => x.key);
  const isHot = v.cls === 'hot';
  const priceForHot = isHot ? inp.price : solveLtrPriceForHot(inp);
  const rentForHot  = isHot ? inp.rentMo : solveLtrRentForHot(inp);
  const downForHot  = isHot ? (inp.down == null ? null : +inp.down) : solveLtrDownForHot(inp);
  // The lender-ready verdict label is read from the engine at the solved
  // lever — never restated here — so band-specific wording stays one-sourced.
  const hotLabel = priceForHot != null ? ltrVerdict(computeLtr({ ...inp, price: priceForHot })).verdict
    : rentForHot != null ? ltrVerdict(computeLtr({ ...inp, rentMo: rentForHot })).verdict
    : downForHot != null ? ltrVerdict(computeLtr({ ...inp, down: downForHot })).verdict : null;
  return {
    verdict: v.verdict, cls: v.cls, vsub: v.vsub, hotLabel,
    gates,
    current: {
      price: m.price, rentMo: inp.rentMo, down: inp.down == null ? null : +inp.down,
      dscr: m.dscr, coc: m.coc, cashFlowYr: m.cashFlowYr, cashFlowMo: m.cashFlowMo,
      NOI: m.NOI, debtYr: m.debtYr, stressedDscr: m.stressedDscr, stressedCfMo: m.stressedCfMo,
      marginOfSafety: m.marginOfSafety, band: m.band, target: m.target,
    },
    failing, isHot,
    levers: {
      price: priceForHot,
      rent:  rentForHot,
      down:  downForHot,
    },
  };
}

// ─── BRRR ──────────────────────────────────────────────────────────────────────
export function computeBrrr(inp) {
  // Band sets the default hold-phase vacancy/PM/maint/CapEx (user-overridable). 9plus
  // is intercepted upstream; the '1-4' fallback here is defensive.
  const band = propertyBand(inp.units);
  const rules = BAND_RULES[band] || BAND_RULES['1-4'];
  const price = +inp.price || 0;
  const rehab = +inp.rehab || 0;
  const contingencyF = (inp.contingency == null ? 15 : +inp.contingency) / 100;
  const arv = +inp.arv || 0;
  const ccF = (inp.cc == null ? 2 : +inp.cc) / 100;
  const hold = inp.hold == null ? 6 : +inp.hold;
  const carry = inp.carry == null ? 600 : +inp.carry;
  const acqLoan = +inp.acqLoan || 0;
  const acqRateF = (inp.acqRate == null ? 10 : +inp.acqRate) / 100;
  const acqPointsF = (inp.acqPoints == null ? 2 : +inp.acqPoints) / 100;

  const refiLtvF = (inp.refiLtv == null ? 75 : +inp.refiLtv) / 100;
  const refiRateF = (inp.refiRate == null ? 7.0 : +inp.refiRate) / 100;
  const refiAmort = inp.refiAmort == null ? 30 : +inp.refiAmort;
  const reficostF = (inp.reficost == null ? 3 : +inp.reficost) / 100;
  const season = inp.season == null ? 6 : +inp.season;

  const rentMo = +inp.rent || 0;
  const vacF = (inp.vac == null ? rules.vac : +inp.vac) / 100;
  const pmF = inp.selfManage ? 0 : (inp.pm == null ? rules.pm : +inp.pm) / 100;
  const maintF = (inp.maint == null ? rules.maint : +inp.maint) / 100;
  const capexF = (inp.capex == null ? rules.capex : +inp.capex) / 100;
  const tax = +inp.tax || 0;
  const ins = +inp.ins || 0;
  const hoaYr = (+inp.hoa || 0) * 12;
  const targetDscr = inp.targetDscr == null ? 1.25 : +inp.targetDscr;

  // ── Acquisition / all-in basis ──
  const rehabTotal = rehab * (1 + contingencyF);
  const purchCosts = price * ccF;
  const carryTotal = carry * hold;
  const acqInterest = acqLoan > 0 ? acqLoan * (acqRateF / 12) * hold : 0;
  const acqFees = acqLoan > 0 ? acqLoan * acqPointsF : 0;
  const allInCost = price + rehabTotal + purchCosts + carryTotal + acqInterest + acqFees;
  const cashInvested = allInCost - acqLoan;

  // ── Refinance (cash-out takeout) ──
  const refiLoan = arv * refiLtvF;
  const refiCosts = refiLoan * reficostF;
  const acqPayoff = acqLoan;
  const cashOut = refiLoan - acqPayoff - refiCosts;
  const capitalLeft = cashInvested - cashOut;
  const cashRecoveredPct = cashInvested > 0 ? (cashOut / cashInvested) * 100 : 0;

  // ── Equity ──
  const equityCreated = arv - allInCost;
  const postRefiEquity = arv - refiLoan;

  // ── Income (post-refi hold) — shared incomeBlock ──
  const rentYr = rentMo * 12;
  const ib = incomeBlock({
    rentYr,
    vac: vacF,
    pm: pmF,
    maint: maintF,
    tax,
    ins,
    hoaYr,
    capex: capexF,
    loan: refiLoan,
    rate: refiRateF,
    amortYears: refiAmort,
  });
  const cashFlowMo = ib.cashFlowYr / 12;

  // ── Returns ──
  const capRate = allInCost > 0 ? (ib.NOI / allInCost) * 100 : 0;
  const postRefiCoC = capitalLeft > 0 ? (ib.cashFlowYr / capitalLeft) * 100 : Infinity;
  const refiLTVactual = arv > 0 ? (refiLoan / arv) * 100 : 0;

  // ── Stress test: ARV −5%, rent −5% → DSCR ≥ 1.0 AND capital-left ≤ 50% invested.
  // For 5–8, hold-phase vacancy also floors at one full vacant unit (1/units), and the
  // "strong" DSCR bar rises to the band's mosStrong (1.20 vs 1.15). ──
  const sArv = arv * 0.95;
  const sRefiLoan = sArv * refiLtvF;
  const sCashOut = sRefiLoan - acqPayoff - sRefiLoan * reficostF;
  const sCapitalLeft = cashInvested - sCashOut;
  const sCapitalLeftPct = cashInvested > 0 ? (sCapitalLeft / cashInvested) * 100 : 0;
  const stressVac = band === '5-8'
    ? Math.max(vacF + 0.05, (+inp.units > 0 ? 1 / Number(inp.units) : vacF + 0.05))
    : vacF;
  const sIb = incomeBlock({
    rentYr: rentMo * 0.95 * 12,
    vac: stressVac,
    pm: pmF,
    maint: maintF,
    tax,
    ins,
    hoaYr,
    capex: capexF,
    loan: sRefiLoan,
    rate: refiRateF,
    amortYears: refiAmort,
  });
  const stressedDscr = sIb.dscr;
  const stressSurvives = (stressedDscr === null || stressedDscr >= 1.0) && sCapitalLeftPct <= 50;
  const marginOfSafety = !stressSurvives
    ? "fails"
    : (stressedDscr === null || stressedDscr >= rules.mosStrong) && sCapitalLeftPct <= 25
      ? "strong"
      : "tight";

  return {
    stressedDscr,
    stressedCapitalLeftPct: sCapitalLeftPct,
    marginOfSafety,
    units: inp.units == null ? null : Number(inp.units),
    band,
    price,
    arv,
    rehabTotal,
    purchCosts,
    carryTotal,
    acqLoan,
    acqInterest,
    acqFees,
    allInCost,
    cashInvested,
    refiLoan,
    refiCosts,
    acqPayoff,
    cashOut,
    capitalLeft,
    cashRecoveredPct,
    equityCreated,
    postRefiEquity,
    rentYr,
    EGI: ib.EGI,
    NOI: ib.NOI,
    piMo: ib.piMo,
    refiDebtYr: ib.debtYr,
    capexRes: ib.capexRes,
    cashFlowYr: ib.cashFlowYr,
    cashFlowMo,
    dscr: ib.dscr,
    capRate,
    postRefiCoC,
    refiLTVactual,
    season,
    targetDscr,
  };
}

// BRRR verdict (SPEC_BRRR §3). Evaluate HOT → WARM → COLD.
export function brrrVerdict(m) {
  const band = m.band || '1-4';
  const rules = BAND_RULES[band] || BAND_RULES['1-4'];
  const hotDscr = rules.hotDscr;                 // 1.25 both bands
  const d = m.dscr === null ? Infinity : m.dscr;
  const rec = m.cashRecoveredPct;
  const cf = m.cashFlowMo;
  const dscrText = m.dscr === null ? "n/a" : m.dscr.toFixed(2);
  const recText = (Math.round(rec * 10) / 10) + "%";

  // COLD only when the refi debt itself isn't covered — DSCR < 1.0, equivalently
  // NOI < annual refi debt service (all-cash: NOI < 0) — or when the BRRR mechanics
  // break (refi can't pay off the bridge, or no equity is created). The CapEx
  // reserve alone never flips a covered deal COLD (decision B5, mirroring ltrVerdict);
  // the reserve-tipped negative-cash-flow case grades WARM below.
  const coversDebt = (m.dscr === null) ? (m.NOI >= 0) : (m.NOI >= m.refiDebtYr);
  const hardFail = !coversDebt || m.refiLoan <= m.acqPayoff || m.equityCreated <= 0;
  const survives = m.marginOfSafety !== "fails"; // stress: ARV −5%, rent −5%

  // hardFail is evaluated FIRST so COLD is reachable ONLY through it — mirroring
  // ltrVerdict, whose covered deals are structurally unable to grade COLD. Every
  // covered-debt deal that misses HOT and the named WARM arms lands in the WARM
  // catch-all at the bottom, never in COLD.
  let cls, verdict, vsub;
  if (hardFail) {
    cls = "pass";
    verdict = "BRRR Breaks — Rework the Numbers";
    if (m.refiLoan <= m.acqPayoff) {
      vsub =
        "The refi (~$" + Math.round(m.refiLoan).toLocaleString() + ") doesn't cover your $" +
        Math.round(m.acqPayoff).toLocaleString() +
        " acquisition loan — you'd bring cash to the refi. Lower the basis or raise ARV.";
    } else if (m.equityCreated <= 0) {
      vsub =
        "All-in cost ($" + Math.round(m.allInCost).toLocaleString() + ") meets or exceeds ARV ($" +
        Math.round(m.arv).toLocaleString() +
        ") — no equity is created, so there's nothing to refinance. This isn't a BRRR.";
    } else {
      // Debt not covered: DSCR < 1.0 (financed) or negative NOI (all-cash). This
      // branch is honest by construction — it is inside hardFail.
      vsub = m.dscr !== null
        ? "DSCR " + dscrText + " is below 1.0 — rent doesn't cover the refi debt at this structure. Rework the basis, rent, or refi terms."
        : "Even all-cash, operating costs exceed income before any debt service — the hold is cash-flow negative on its own. Rework rent or expenses, or walk.";
    }
  } else if (d >= hotDscr && rec >= 75 && cf > 0 && survives) {
    cls = "hot";
    verdict = band === '5-8' ? "Textbook Small-Multifamily BRRR — Capital Recycled" : "Textbook BRRR — Capital Recycled";
    const left =
      m.capitalLeft <= 0
        ? "You pulled out more than you put in — an infinite-return BRRR."
        : "Only $" + Math.round(m.capitalLeft).toLocaleString() + " left in the deal.";
    vsub =
      "Recovered " + recText + " of your capital and the refi holds at DSCR " + dscrText +
      ". " + left + " Survives a stress test (ARV −5%, rent −5%). Confirm ARV with comps and rent with the market before closing.";
  } else if (cf < 0) {
    // B5: DSCR ≥ 1.0 covers the refi debt, but the CapEx reserve tips monthly cash
    // flow negative. Mirrors ltrVerdict's "Covers Debt — Thin After Reserves".
    cls = "warm";
    verdict = "Covers Debt — Thin After Reserves";
    vsub =
      "DSCR " + dscrText + " covers the refi debt (lender-fundable), but the hold runs about $" +
      Math.abs(Math.round(cf)) + "/mo negative after the CapEx reserve. Build a cushion — push rent, " +
      "trim the refi loan, or negotiate the basis to firm it up.";
  } else if (
    (d >= 1.1 && cf >= 0 && rec >= 40) ||
    (d >= hotDscr && cf > 0 && rec >= 40 && rec < 75) ||
    (rec >= 90 && d >= 1.1 && d < hotDscr)
  ) {
    cls = "warm";
    verdict = "Partial BRRR — Capital Trapped or Tight";
    const why = !survives
      ? "it thins under a stress test (ARV −5%, rent −5%)"
      : m.dscr !== null && m.dscr < hotDscr
        ? "cash flow is thin for best-pricing DSCR"
        : "capital is partly trapped";
    vsub =
      "DSCR " + dscrText + " and " + recText + " recovered — the mechanics work but " +
      why + ". Push ARV, rent, or the refi LTV to tighten it.";
  } else {
    // WARM catch-all (the ltrVerdict mirror's load-bearing piece): the refi debt is
    // covered and cash flow is non-negative, but the deal misses every stronger arm —
    // typically low capital recovery, or DSCR in [1.0, 1.1). Never COLD (decision B5).
    cls = "warm";
    verdict = "Partial BRRR — Capital Trapped or Tight";
    const why = rec < 40
      ? "only " + recText + " of your capital comes back — the hold works, but the recycle doesn't"
      : "cash flow is thin for best-pricing DSCR";
    vsub =
      "DSCR " + dscrText + " covers the refi debt and the hold cash-flows, but " + why +
      ". Push ARV, rent, or the refi LTV to tighten it.";
  }
  return { cls, verdict, vsub };
}
