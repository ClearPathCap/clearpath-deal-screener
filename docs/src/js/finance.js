// ─── Shared rental finance engine (LTR + BRRR) ────────────────────────────────
// One income/DSCR formula, two analyzers. LTR calls it with the purchase loan;
// BRRR calls it with the refi loan. Pure functions only — no DOM, no markets —
// so the analyzer glue (ltr.js / brrr.js) and the Node acceptance tests both run
// the identical math. Reference for SPEC_LTR_ANALYZER §2 / SPEC_BRRR_ANALYZER §2.

// CPC box bounds — loan minimum lowered $150K → $50K (A-Aron, 2026-06-18). Used
// by every qualifiesForCpc* gate and the under-box explainer. Pure constants so
// the gates stay testable (funding.js re-exports the gates for the app).
export const CPC_LOAN_MIN = 50000;
export const CPC_LOAN_MAX = 5000000;

// DSCR / LTR funnel gate (SPEC_LTR §6c, with the $50K override). ltv is a FRACTION
// (loan ÷ value, ~0.75); dscr a number. Undefined ltv/dscr are not disqualifying.
export function qualifiesForCpcLtr({ loan, ltv, dscr }) {
  if (!loan || loan < CPC_LOAN_MIN || loan > CPC_LOAN_MAX) return false;
  if (ltv !== undefined && ltv > 0.8) return false;
  if (dscr !== undefined && dscr < 1.0) return false;
  return true;
}

// BRRR funnel gate (SPEC_BRRR §6) — qualifies on the refi takeout (loan = refiLoan).
export function qualifiesForCpcBrrr({ loan, ltv, dscr }) {
  return qualifiesForCpcLtr({ loan, ltv, dscr });
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
  };
}

// LTR verdict (SPEC_LTR §3). dscr === null (all-cash) → treated as fully covered.
export function ltrVerdict(m) {
  const d = m.dscr === null ? Infinity : m.dscr;
  const target = m.target;
  let cls, verdict, vsub;
  const dscrText = m.dscr === null ? "n/a" : m.dscr.toFixed(2);
  const cocText = (Math.round(m.coc * 10) / 10) + "%";
  const cfMo = Math.round(m.cashFlowMo);

  if (d >= 1.25 && m.coc >= target && m.cashFlowMo > 0) {
    cls = "hot";
    verdict = "Strong Rental — Lender-Ready";
    vsub =
      "DSCR of " + dscrText + " clears lender underwriting and cash-on-cash of " +
      cocText + " beats your " + target + "% target. Confirm market rent with comps/Zillow before closing.";
  } else if ((d >= 1.1 && m.coc >= 4) || (d >= 1.25 && m.coc < target)) {
    cls = "warm";
    verdict = "Dig Deeper & Negotiate";
    if (d >= 1.25 && m.coc < target) {
      // WARM (b) — the DSCR finance-and-hold bridge
      vsub =
        "Cash-on-cash of " + cocText + " is light, but DSCR " + dscrText +
        " clears typical 1.20–1.25 underwriting — a finance-and-hold candidate even if it's not a yield play.";
    } else {
      vsub =
        "DSCR of " + dscrText + " covers the debt and it cash-flows $" + cfMo +
        "/mo, but cash-on-cash of " + cocText + " trails your " + target +
        "% target. Negotiate price or raise rent to close the gap.";
    }
  } else {
    cls = "pass";
    verdict = "Negative Leverage — Walk or Restructure";
    if (m.dscr !== null && m.dscr < 1.0) {
      vsub =
        "DSCR of " + dscrText + " is below 1.0 — rent doesn't cover the debt at this price and down payment. " +
        "Increase the down payment, negotiate price, or walk.";
    } else {
      vsub =
        "This loses $" + Math.abs(cfMo) + "/mo after reserves. Restructure the financing or walk.";
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

  return {
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

  let cls, verdict, vsub;
  if (!hardFail && d >= 1.25 && rec >= 75 && cf > 0) {
    cls = "hot";
    verdict = "Textbook BRRR — Capital Recycled";
    const left =
      m.capitalLeft <= 0
        ? "You pulled out more than you put in — an infinite-return BRRR."
        : "Only $" + Math.round(m.capitalLeft).toLocaleString() + " left in the deal.";
    vsub =
      "Recovered " + recText + " of your capital and the refi holds at DSCR " + dscrText +
      ". " + left + " Confirm ARV with comps and rent with the market before closing.";
  } else if (
    !hardFail &&
    ((d >= 1.1 && cf >= 0 && rec >= 40) ||
      (d >= 1.25 && cf > 0 && rec >= 40 && rec < 75) ||
      (rec >= 90 && d >= 1.1 && d < 1.25))
  ) {
    cls = "warm";
    verdict = "Partial BRRR — Capital Trapped or Tight";
    vsub =
      "DSCR " + dscrText + " and " + recText + " recovered — the mechanics work but " +
      (m.dscr !== null && m.dscr < 1.25
        ? "cash flow is thin for best-pricing DSCR"
        : "capital is partly trapped") +
      ". Push ARV, rent, or the refi LTV to tighten it.";
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
