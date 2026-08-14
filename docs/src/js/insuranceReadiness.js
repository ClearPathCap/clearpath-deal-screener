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

// ─── F-5: property-tax readiness (LTR / BRRR) ─────────────────────────────────
// Same three-state classifier as insurance, with ONE ruled difference (blocker-fix
// spec v1.1): an explicit $0 tax entry is a real value and computes normally —
// explicit_zero pends for insurance but NOT for taxes. Blank stays unknown and
// pends. Reuses the insurance mechanism rather than building a second one.
export function taxStatus(tax) { return insuranceStatus(tax); }
export function taxReady(status) { return status !== INS_MISSING; }

// Status for an analyzer RESULT object. New results carry taxStatus; legacy saved
// results coerced blank taxes to 0 at save time, so a legacy 0 is indistinguishable
// from an explicit entry and computes (bounded, disclosed legacy gap — the safe
// direction differs from insurance because explicit-zero taxes are ruled valid).
export function resultTaxStatus(r) {
  if (!r) return INS_MISSING;
  if (r.taxStatus === INS_MISSING || r.taxStatus === INS_EXPLICIT_ZERO || r.taxStatus === INS_VALID) {
    return r.taxStatus;
  }
  return insuranceStatus(r.tax);
}

// Combined income-expense readiness for LTR/BRRR surfaces.
export function incomeReady(taxSt, insSt) { return taxReady(taxSt) && insuranceReady(insSt); }

// Borrower-facing overlay for unresolved taxes and/or insurance; null when both
// are resolved (normal verdict). Insurance-only cases return the exact banked
// insurance presentations unchanged.
export function incomePresentation(taxSt, insSt) {
  const taxPend = !taxReady(taxSt);
  const insP = insurancePresentation(insSt);
  if (taxPend && insP) {
    // Verification round: the sub-copy is state-accurate — insurance may be missing
    // OR an entered $0 awaiting verification; "neither was entered" was false for
    // the tax-blank + insurance-$0 corner.
    const insZero = insSt === INS_EXPLICIT_ZERO;
    return {
      status: 'taxes_and_insurance',
      tag: 'NEEDS TAXES + INSURANCE',
      label: 'Add Taxes & Insurance for a Lender-Ready DSCR',
      sub: 'Property taxes and insurance are required for a lender-ready calculation — taxes weren\'t entered and insurance ' +
        (insZero ? 'was entered as $0 (confirm before lender review)' : 'wasn\'t entered') +
        ', so the DSCR and NOI shown are Pending. Resolve both for accurate figures; you can still explore funding in the meantime.',
      pendingText: 'Pending',
    };
  }
  if (taxPend) {
    return {
      status: 'taxes_missing',
      tag: 'NEEDS PROPERTY TAXES',
      label: 'Add Property Taxes for a Lender-Ready DSCR',
      sub: 'Property taxes are required for a lender-ready calculation — annual taxes weren\'t entered, so the DSCR and NOI shown are Pending. Add taxes for an accurate figure; you can still explore funding in the meantime.',
      pendingText: 'Pending',
    };
  }
  return insP;
}

// Clipboard-summary warning for missing taxes; composes with insuranceSummaryWarning.
export function taxSummaryWarning(status) {
  if (status === INS_MISSING) {
    return '⚠ PROPERTY TAXES NOT ENTERED — NOI/DSCR are Pending and not lender-ready until taxes are added.';
  }
  return null;
}

// ─── F-6: STR combined taxes+insurance readiness ──────────────────────────────
// rental.js has a single combined "Taxes + insurance" field, so a blank pends as
// ONE combined expense state — the field cannot distinguish missing taxes from
// missing insurance, and no meaning is silently picked. An explicit $0 computes
// as a real value (same ruled semantics as F-5 taxes).
export function strExpensePresentation(status) {
  if (status === INS_MISSING) {
    return {
      status: 'str_expenses_missing',
      tag: 'NEEDS TAXES + INSURANCE',
      label: 'Add Taxes & Insurance to Complete the Analysis',
      sub: 'Taxes + insurance (annual) wasn\'t entered, so the returns shown are Pending — a blank expense is unknown, not $0. Add the combined annual figure for an accurate read; you can still explore funding in the meantime.',
      pendingText: 'Pending',
    };
  }
  return null;
}

// Clipboard-summary warning for the STR combined field; null when resolved.
export function strExpenseSummaryWarning(status) {
  if (status === INS_MISSING) {
    return '⚠ TAXES + INSURANCE NOT ENTERED — returns are Pending and not decision-ready until the combined annual figure is added.';
  }
  return null;
}

// Shared render-time pending decision for saved/shared surfaces, all analyzer
// types (flip has no expense-readiness concept and always returns null).
export function pendingPresentationFor(type, taxSt, insSt) {
  if (type === 'rental') return strExpensePresentation(taxSt);
  if (type !== 'ltr' && type !== 'brrr') return null;
  return incomeReady(taxSt, insSt) ? null : incomePresentation(taxSt, insSt);
}

// F-5 handoff gating: unresolved taxes contaminate the same screener metrics as
// unresolved insurance, and additionally omit annualTaxes itself (a blank field
// must never ship a fabricated $0). Wraps the banked insuranceDependentHandoff
// (unchanged) so both gates stay a single decision each.
export function incomeDependentHandoff(r) {
  const ins = insuranceDependentHandoff(r);
  if (taxReady(resultTaxStatus(r))) {
    return { annualTaxes: r.tax == null ? undefined : Math.round(r.tax), ...ins };
  }
  return {
    annualTaxes: undefined,
    annualInsurance: ins.annualInsurance,
    screenerNoi: undefined,
    screenerDscr: undefined,
    screenerCashFlowAnnual: undefined,
    screenerCashFlowMonthly: undefined,
    screenerCapRate: undefined,
    screenerVerdict: undefined,
    dscr: undefined,
  };
}
