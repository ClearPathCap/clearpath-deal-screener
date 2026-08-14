// ─── STR pure math + verdict ──────────────────────────────────────────────────
// Extracted VERBATIM from rental.js analyzeRental in the F-6 blocker-fix cycle so
// the STR analyzer is unit-testable the way finance.js is (the split engine meant
// STR had no Node-loadable math at all — the architectural root of F-6). Zero
// behavior change: the Pass-0 W4-F4 / W4-F4b goldens pin this in
// tests/blockerfix.test.mjs. Pure functions only — no DOM, no imports — loadable
// via the same data: URL pattern as finance.js.
//
// All rate/% args arrive as FRACTIONS (already /100, matching how rental.js read
// them before the extraction). `rent` is ANNUAL revenue at 100% occupancy.
export function computeStr({ price, rent, down, occ, mgmt, pm, tax, maint, furnish, tgtCoc, interestRate }) {
  const effRent     = rent * occ;
  const platformFee = effRent * mgmt;
  const pmFee       = effRent * pm;
  const totalExp    = platformFee + pmFee + tax + maint;
  const noi         = effRent - totalExp;
  const capRate     = (noi / price) * 100;
  const downAmt     = price * down + furnish;
  const loan        = price - (price * down);
  const monthlyRate = interestRate / 12;
  const n           = 360;
  const mo          = loan > 0 ? loan * monthlyRate * Math.pow(1 + monthlyRate, n) / (Math.pow(1 + monthlyRate, n) - 1) : 0;
  const debt        = mo * 12;
  const cashflow    = noi - debt;
  const dscr        = debt > 0 ? noi / debt : 0;   // the metric a rental lender underwrites to
  const coc         = (cashflow / downAmt) * 100;
  const grm         = Math.round((price / rent) * 10) / 10;

  let verdict, vsub, cls;
  if (coc >= tgtCoc && capRate >= 6) {
    verdict = 'Strong STR Play'; cls = 'hot';
    vsub = 'Cash-on-cash return of ' + (Math.round(coc * 10) / 10) + '% clears your ' + tgtCoc + '% target. ' +
      'Cap Rate (' + (Math.round(capRate * 10) / 10) + '%) measures return as if you paid cash. Verify occupancy with AirDNA before closing.';
  } else if (coc >= tgtCoc * 0.75 && capRate >= 4.5) {
    verdict = 'Dig Deeper & Negotiate'; cls = 'warm';
    vsub = 'Cash-on-cash of ' + (Math.round(coc * 10) / 10) + '% is close to your ' + tgtCoc + '% target. ' +
      'A few more booked nights/month changes the math. Verify occupancy in AirDNA and negotiate on price.';
  } else {
    verdict = 'Thin Margins — Walk Away'; cls = 'pass';
    vsub = 'Cash-on-cash of ' + (Math.round(coc * 10) / 10) + '% misses your ' + tgtCoc + '% target. ' +
      'Negotiate price down significantly or find a property with stronger revenue potential.';
  }

  // DSCR bridge: a warm cash-on-cash deal that still clears lender DSCR is fundable.
  if (cls === 'warm' && dscr >= 1.25) {
    vsub += ' Lender-fundable: DSCR ' + dscr.toFixed(2) + ' clears typical 1.20–1.25 underwriting even though cash-on-cash trails your target — a finance-and-hold candidate.';
  }

  return { effRent, platformFee, pmFee, totalExp, noi, capRate, downAmt, loan, mo, debt, cashflow, dscr, coc, grm, verdict, vsub, cls };
}
