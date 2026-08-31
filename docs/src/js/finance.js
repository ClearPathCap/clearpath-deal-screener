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

// ── "Counter at Max Offer" what-if (Track D) — PURE and NON-MUTATING ─────────
// Answers: "even if the seller accepted DealFit's max offer, is this worth
// pursuing?" Input is the saved-deal data schema (cc1/cc2 whole numbers,
// rate/points fractions). Everything runs through canonical computeFlip /
// computeFlipStress — no second formula set, and nothing here writes anywhere.
// Returns null when no positive purchase price hits the target (maxOffer <= 0).
export function computeMaxOfferScenario(d) {
  const cc1 = (d.cc1 ?? 2) / 100, cc2 = (d.cc2 ?? 5) / 100;
  const rate = d.rate ?? 0.10, points = d.points ?? 0.03;
  const loan = d.loan || 0, target = d.target ?? 40000;
  const base = computeFlip({ ask: d.ask, arv: d.arv, rep: d.rep, hold: d.hold,
    cc1, cc2, carry: d.carry, loan, rate, points, self: !!d.self });
  const offer = Math.round(base.maxOffer);
  if (!(offer > 0)) return null;
  const eng = computeFlip({ ask: offer, arv: d.arv, rep: d.rep, hold: d.hold,
    cc1, cc2, carry: d.carry, loan, rate, points, self: !!d.self });
  const stress = computeFlipStress({ ask: offer, arv: d.arv, rep: d.rep,
    cc1, cc2, carry: d.carry, hold: d.hold, financed: loan > 0, loan, rate, points, target });
  return {
    originalAsk: d.ask, offer,
    profit: eng.profit, roi: eng.roi,
    cashIn: eng.cashIn, totalProject: eng.totalIn + eng.sellCost,
    target, targetMet: eng.profit >= target,
    stressedProfit: stress.stressedProfit, marginOfSafety: stress.marginOfSafety,
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
export function flipVerdict({ profit, roi, target, maxOffer, marginOfSafety, stressedProfit, self }) {
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
    verdict = 'Counter at Max Offer — Walk Away';
    if (maxOffer <= 0) {
      vsub = 'Repairs exceed the ' + (self ? '75' : '70') + '% ARV ceiling — no purchase price hits your target. Walk away.';
    } else if (!survives) {
      vsub = 'Net profit goes negative under a modest stress test (ARV −5%, rehab +10%, +1 month → ' + money(stressedProfit) + '). Too little margin of safety — renegotiate hard or walk.';
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
export function ltrVerdict(m) {
  const band = m.band || '1-4';
  const rules = BAND_RULES[band] || BAND_RULES['1-4'];
  const hotDscr = rules.hotDscr;                 // 1.25 both bands
  const d = m.dscr === null ? Infinity : m.dscr;
  const target = m.target;
  const annualCF = m.cashFlowYr;
  const survives = m.marginOfSafety !== "fails";
  const dscrText = m.dscr === null ? "n/a" : m.dscr.toFixed(2);
  const cocText = (Math.round(m.coc * 10) / 10) + "%";
  const cfMo = Math.round(m.cashFlowMo);
  let cls, verdict, vsub;

  // COLD only when the debt itself isn't covered: DSCR < 1.0 — equivalently NOI < annual
  // debt service (cash-flow-negative BEFORE the CapEx reserve). dscr === null = all-cash =
  // fully covered unless NOI itself is negative. The CapEx reserve alone never flips a
  // DSCR-fundable deal COLD (decision B5). Identical across bands.
  const coversDebt = (m.dscr === null) ? (m.NOI >= 0) : (m.NOI >= m.debtYr);
  if (!coversDebt) {
    cls = "pass";
    verdict = "Negative Leverage — Walk or Restructure";
    vsub = (m.dscr !== null)
      ? "DSCR of " + dscrText + " is below 1.0 — rent doesn't cover the debt at this price and down payment. Increase the down payment, negotiate price, or walk."
      : "Even all-cash, operating costs exceed income before any debt service — the property is cash-flow negative on its own. Rework rent or expenses, or walk.";
  } else if (d >= hotDscr && (annualCF >= 6000 || m.coc >= target) && m.cashFlowMo > 0 && survives) {
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
