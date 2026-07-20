// ─── Insurance readiness (Phase A Refined Option B) ───────────────────────────
// Single source of truth for the three-state insurance model on income deals
// (LTR / BRRR):
//   'missing'        — insurance untouched / blank / absent
//   'explicit_zero'  — the user deliberately entered numeric 0
//   'valid'          — a positive nonzero insurance value
// The two unresolved states share ONE lender-readiness outcome (NOT lender-ready)
// but keep DISTINCT source status and borrower-facing language. Pure module: no
// DOM, no storage, no imports — loadable by the Node data-URL test pattern
// (tests/handoff.test.mjs), and consumed in production by ltr.js / brrr.js /
// clearpath.js.

export const INS_MISSING = 'missing';
export const INS_EXPLICIT_ZERO = 'explicit_zero';
export const INS_VALID = 'valid';

// Classify the RAW parsed insurance input. parseNumOpt('') → undefined, so
// `== null` catches blank/untouched; parseNumOpt('0') → 0 stays a real zero.
export function insuranceStatus(ins) {
  if (ins == null) return INS_MISSING;
  if (ins === 0) return INS_EXPLICIT_ZERO;
  return INS_VALID;
}

// Status for an analyzer RESULT object (lastLtrResult / lastBrrrResult / saved
// pipeline deals). New results carry insStatus; legacy saved results fall back:
// held-era objects carry insMissing, and public-era objects coerced blank → ins:0.
// Treating that legacy 0 as explicit_zero is SAFE — both unresolved states produce
// the identical handoff omission set and a Pending presentation.
export function resultInsuranceStatus(r) {
  if (!r) return INS_MISSING;
  if (r.insStatus === INS_MISSING || r.insStatus === INS_EXPLICIT_ZERO || r.insStatus === INS_VALID) {
    return r.insStatus;
  }
  if (r.insMissing) return INS_MISSING;
  return insuranceStatus(r.ins);
}

// Lender-ready predicate: only a positive entered insurance value supports a
// lender-ready income calculation. missing and explicit_zero are both NOT ready
// (shared outcome), while remaining distinct source states.
export function insuranceReady(status) {
  return status === INS_VALID;
}

// Borrower-facing replacement presentation for unresolved insurance; null for
// 'valid' (normal verdict presentation). tag/label/sub feed the verdict banner;
// pendingText replaces the main DSCR tile AND the breakdown NOI + DSCR values so
// the detail rows can never contradict the Pending headline.
export function insurancePresentation(status) {
  if (status === INS_MISSING) {
    return {
      status,
      tag: 'NEEDS INSURANCE',
      label: 'Add Insurance for a Lender-Ready DSCR',
      sub: 'Insurance required for lender-ready calculation — annual insurance wasn\'t entered, so the DSCR and NOI shown are Pending. Add insurance for an accurate figure; you can still explore funding in the meantime.',
      pendingText: 'Pending',
    };
  }
  if (status === INS_EXPLICIT_ZERO) {
    return {
      status,
      tag: 'VERIFY INSURANCE',
      label: 'Verify Insurance for a Lender-Ready DSCR',
      sub: 'Insurance entered as $0 — confirm before lender review. A $0 insurance figure isn\'t lender-ready without verification, so the DSCR and NOI shown are Pending; you can still explore funding in the meantime.',
      pendingText: 'Pending',
    };
  }
  return null;
}

// Clipboard-summary warning line (LTR/BRRR deal summaries); null for 'valid'.
export function insuranceSummaryWarning(status) {
  if (status === INS_MISSING) {
    return '⚠ INSURANCE NOT ENTERED — NOI/DSCR are Pending and not lender-ready until insurance is added.';
  }
  if (status === INS_EXPLICIT_ZERO) {
    return '⚠ INSURANCE ENTERED AS $0 — confirm before lender review; NOI/DSCR are Pending and not lender-ready until verified.';
  }
  return null;
}

// The exact CPC-handoff fields whose values materially depend on the insurance
// input. Unresolved insurance ('missing' OR 'explicit_zero') omits EVERY one of
// them through this single code path, so both unresolved states produce the
// IDENTICAL omission set by construction. The URL serializer (funding.js
// buildCpcUrl) drops undefined, so an omitted field never reaches CPC as
// 0 / '' / 'undefined'. `dscr` here is the base dscr param buildDealParams sends
// for LTR/BRRR (distinct from econHandoff's screenerDscr).
export function insuranceDependentHandoff(r) {
  const status = resultInsuranceStatus(r);
  if (!insuranceReady(status)) {
    return {
      annualInsurance: undefined,
      screenerNoi: undefined,
      screenerDscr: undefined,
      screenerCashFlowAnnual: undefined,
      screenerCashFlowMonthly: undefined,
      screenerCapRate: undefined,
      screenerVerdict: undefined,
      dscr: undefined,
    };
  }
  const round = (v) => (v == null ? undefined : Math.round(v));
  const dscr2 = r.dscr != null ? +r.dscr.toFixed(2) : undefined;
  return {
    annualInsurance: round(r.ins),
    screenerNoi: round(r.NOI),
    screenerDscr: dscr2,
    screenerCashFlowAnnual: round(r.cashFlowYr),
    screenerCashFlowMonthly: round(r.cashFlowMo),
    screenerCapRate: r.capRate != null ? +r.capRate.toFixed(2) : undefined,
    screenerVerdict: r.verdict || undefined,
    dscr: dscr2,
  };
}
