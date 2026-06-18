// ─── Shared rental finance engine (LTR + BRRR) ────────────────────────────────
// One income/DSCR formula, two analyzers. LTR calls it with the purchase loan;
// BRRR calls it with the refi loan. Pure functions only — no DOM, no markets —
// so the analyzer glue (ltr.js / brrr.js) and the Node acceptance tests both run
// the identical math. Reference for SPEC_LTR_ANALYZER §2 / SPEC_BRRR_ANALYZER §2.

// CPC box: $50K floor (lowered from $150K), and NO upper cap — the $5M cap was
// removed 2026-06-18 (box/explainer copy → "$50K+"). Pure so the gates stay testable.
export const CPC_LOAN_MIN = 50000;

// DSCR / LTR funnel gate (SPEC_LTR §6c). ltv is a FRACTION (loan ÷ value, ~0.75);
// dscr a number. Undefined ltv/dscr are not disqualifying. No upper loan cap.
export function qualifiesForCpcLtr({ loan, ltv, dscr }) {
  if (!loan || loan < CPC_LOAN_MIN) return false;
  if (ltv !== undefined && ltv > 0.8) return false;
  if (dscr !== undefined && dscr < 1.0) return false;
  return true;
}

// BRRR funnel gate (SPEC_BRRR §6) — qualifies on the refi takeout (loan = refiLoan).
export function qualifiesForCpcBrrr({ loan, ltv, dscr }) {
  return qualifiesForCpcLtr({ loan, ltv, dscr });
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

// ── Flip stress test: ARV −5%, rehab +10%, hold +1 month → net profit ≥ 0 ──
// Inputs are flip base numbers (cc1/cc2/rate/points as FRACTIONS). Pure so flip.js
// and the tests share it.
export function computeFlipStress({ ask, arv, rep, cc1, cc2, carry, hold, financed, loan, rate, points, target }) {
  const sArv = arv * 0.95;
  const sRep = rep * 1.1;
  const sHold = hold + 1;
  const buyCost = ask * cc1;
  const sSellCost = sArv * cc2;
  const sHoldCost = carry * sHold;
  const sLoanInt = financed ? loan * (rate / 12) * sHold : 0;
  const loanFees = financed ? loan * points : 0;
  const stressedProfit = sArv - sSellCost - (ask + sRep) - buyCost - sHoldCost - sLoanInt - loanFees;
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
  const price = +inp.price || 0;
  const rentMo = +inp.rentMo || 0;
  const downF = (inp.down == null ? 20 : +inp.down) / 100;
  const vacF = (inp.vac == null ? 5 : +inp.vac) / 100;
  const pmF = inp.selfManage ? 0 : (inp.pm == null ? 8 : +inp.pm) / 100;
  const maintF = (inp.maint == null ? 5 : +inp.maint) / 100;
  const capexF = (inp.capex == null ? 5 : +inp.capex) / 100;
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

  // ── Stress test: rent −5%, vacancy +3 pts, rate +0.5% → DSCR ≥ 1.0 AND CF ≥ 0 ──
  const sIb = incomeBlock({
    rentYr: rentMo * 0.95 * 12,
    vac: vacF + 0.03,
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
  const survives = (stressedDscr === null || stressedDscr >= 1.0) && stressedCfMo >= 0;
  const marginOfSafety = !survives ? 'fails' : (stressedDscr === null || stressedDscr >= 1.15) ? 'strong' : 'tight';

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
  };
}

// LTR verdict (SPEC_LTR §3 + Verdict & Risk Framework §67-70). HOT clears the
// DSCR gate AND the dollar/CoC bar AND survives the stress test. dscr === null
// (all-cash) → treated as fully covered.
export function ltrVerdict(m) {
  const d = m.dscr === null ? Infinity : m.dscr;
  const target = m.target;
  const annualCF = m.cashFlowYr;
  const survives = m.marginOfSafety !== "fails";
  const dscrText = m.dscr === null ? "n/a" : m.dscr.toFixed(2);
  const cocText = (Math.round(m.coc * 10) / 10) + "%";
  const cfMo = Math.round(m.cashFlowMo);
  let cls, verdict, vsub;

  if (d < 1.0 || m.cashFlowMo < 0) {
    cls = "pass";
    verdict = "Negative Leverage — Walk or Restructure";
    vsub =
      m.dscr !== null && m.dscr < 1.0
        ? "DSCR of " + dscrText + " is below 1.0 — rent doesn't cover the debt at this price and down payment. Increase the down payment, negotiate price, or walk."
        : "This loses $" + Math.abs(cfMo) + "/mo after reserves. Restructure the financing or walk.";
  } else if (d >= 1.25 && (annualCF >= 6000 || m.coc >= target) && m.cashFlowMo > 0 && survives) {
    cls = "hot";
    verdict = "Strong Rental — Lender-Ready";
    vsub =
      "DSCR " + dscrText + " clears underwriting and " +
      (annualCF >= 6000
        ? money(annualCF) + "/yr cash flow is strong"
        : "cash-on-cash " + cocText + " beats your " + target + "% target") +
      ". Survives a stress test (rent −5%, vacancy +3pts, rate +0.5%). Confirm market rent with comps before closing.";
  } else {
    cls = "warm";
    verdict = "Dig Deeper & Negotiate";
    if (d >= 1.25 && !survives) {
      vsub =
        "DSCR " + dscrText + " clears underwriting at base case, but a stress test (rent −5%, vacancy +3pts, rate +0.5%) thins the margin of safety. Build in more cushion before treating it as a lock.";
    } else if (d >= 1.25 && m.coc < target && annualCF < 6000) {
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
  const vacF = (inp.vac == null ? 5 : +inp.vac) / 100;
  const pmF = inp.selfManage ? 0 : (inp.pm == null ? 8 : +inp.pm) / 100;
  const maintF = (inp.maint == null ? 5 : +inp.maint) / 100;
  const capexF = (inp.capex == null ? 5 : +inp.capex) / 100;
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

  // ── Stress test: ARV −5%, rent −5% → DSCR ≥ 1.0 AND capital-left ≤ 50% invested ──
  const sArv = arv * 0.95;
  const sRefiLoan = sArv * refiLtvF;
  const sCashOut = sRefiLoan - acqPayoff - sRefiLoan * reficostF;
  const sCapitalLeft = cashInvested - sCashOut;
  const sCapitalLeftPct = cashInvested > 0 ? (sCapitalLeft / cashInvested) * 100 : 0;
  const sIb = incomeBlock({
    rentYr: rentMo * 0.95 * 12,
    vac: vacF,
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
    : (stressedDscr === null || stressedDscr >= 1.15) && sCapitalLeftPct <= 25
      ? "strong"
      : "tight";

  return {
    stressedDscr,
    stressedCapitalLeftPct: sCapitalLeftPct,
    marginOfSafety,
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
  const d = m.dscr === null ? Infinity : m.dscr;
  const rec = m.cashRecoveredPct;
  const cf = m.cashFlowMo;
  const dscrText = m.dscr === null ? "n/a" : m.dscr.toFixed(2);
  const recText = (Math.round(rec * 10) / 10) + "%";

  // Hard fails first feed COLD; otherwise evaluate HOT → WARM.
  const hardFail = d < 1.0 || cf < 0 || m.refiLoan <= m.acqPayoff || m.equityCreated <= 0;
  const survives = m.marginOfSafety !== "fails"; // stress: ARV −5%, rent −5%

  let cls, verdict, vsub;
  if (!hardFail && d >= 1.25 && rec >= 75 && cf > 0 && survives) {
    cls = "hot";
    verdict = "Textbook BRRR — Capital Recycled";
    const left =
      m.capitalLeft <= 0
        ? "You pulled out more than you put in — an infinite-return BRRR."
        : "Only $" + Math.round(m.capitalLeft).toLocaleString() + " left in the deal.";
    vsub =
      "Recovered " + recText + " of your capital and the refi holds at DSCR " + dscrText +
      ". " + left + " Survives a stress test (ARV −5%, rent −5%). Confirm ARV with comps and rent with the market before closing.";
  } else if (
    !hardFail &&
    ((d >= 1.1 && cf >= 0 && rec >= 40) ||
      (d >= 1.25 && cf > 0 && rec >= 40 && rec < 75) ||
      (rec >= 90 && d >= 1.1 && d < 1.25))
  ) {
    cls = "warm";
    verdict = "Partial BRRR — Capital Trapped or Tight";
    const why = !survives
      ? "it thins under a stress test (ARV −5%, rent −5%)"
      : m.dscr !== null && m.dscr < 1.25
        ? "cash flow is thin for best-pricing DSCR"
        : "capital is partly trapped";
    vsub =
      "DSCR " + dscrText + " and " + recText + " recovered — the mechanics work but " +
      why + ". Push ARV, rent, or the refi LTV to tighten it.";
  } else {
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
      vsub =
        "DSCR " + dscrText + " or cash flow won't support the refinanced hold. Rework the basis, rent, or refi terms.";
    }
  }
  return { cls, verdict, vsub };
}
