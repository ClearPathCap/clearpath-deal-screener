// ─── Repair cost estimator ────────────────────────────────────────────────────

// Fallback ranges used before a market is loaded
const DEFAULT_RANGES = {
  light: { selfLow: 12, selfHigh: 22, hiredLow: 18, hiredHigh: 35 },
  mid:   { selfLow: 28, selfHigh: 48, hiredLow: 42, hiredHigh: 70 },
  full:  { selfLow: 60, selfHigh: 95, hiredLow: 90, hiredHigh: 130 },
};

// Current market-specific ranges — replaced when active market changes
let _ranges = DEFAULT_RANGES;
let currentTierName = 'mid';

// ─── Derive all three scope ranges from a FLIP_MARKETS entry ─────────────────
function computeRangesForMarket(market) {
  const lo = market.repairLow;
  const hi = market.repairHigh;
  return {
    light: {
      hiredLow:  Math.round(lo * 0.35),
      hiredHigh: Math.round(lo * 0.65),
      selfLow:   Math.round(lo * 0.22),
      selfHigh:  Math.round(lo * 0.40),
    },
    mid: {
      hiredLow:  lo,
      hiredHigh: hi,
      selfLow:   Math.round(lo * 0.62),
      selfHigh:  Math.round(hi * 0.62),
    },
    full: {
      // Full-gut starts where Mid tops out so the three scope tiers step up
      // monotonically (no Mid/Full overlap).
      hiredLow:  hi,
      hiredHigh: Math.round(hi * 1.45),
      selfLow:   Math.round(hi * 0.62),
      selfHigh:  Math.round(hi * 0.90),
    },
  };
}

// ─── Called from setFlipPreset when the active market slot changes ────────────
export function updateRepairRangesForMarket(market) {
  if (market && market.repairLow && market.repairHigh) {
    _ranges = computeRangesForMarket(market);
  } else {
    _ranges = DEFAULT_RANGES;
  }
  calcRepair(); // re-render tier labels + estimated range with new data
}

export function getCurrentTier() {
  return { name: currentTierName, ..._ranges[currentTierName] };
}

export function setRepairTier(name, el) {
  document.querySelectorAll('.tier').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentTierName = name;
  calcRepair();
  updateRepairTierRangeLabels();
}

// ─── Update the $/sf label on each scope card ─────────────────────────────────
function updateRepairTierRangeLabels() {
  const self    = document.getElementById('self-reno')?.checked;
  const tierEls = document.querySelectorAll('.tier');
  const names   = ['light', 'mid', 'full'];
  tierEls.forEach((el, i) => {
    const t = names[i];
    const r = _ranges[t];
    if (!t || !r) return;
    const rangeEl = el.querySelector('.tier-range');
    if (rangeEl) {
      const low  = self ? r.selfLow  : r.hiredLow;
      const high = self ? r.selfHigh : r.hiredHigh;
      rangeEl.textContent = '$' + low + '–' + high + '/sf';
    }
  });
}

export function calcRepair() {
  const sqft = +document.getElementById('sqft').value;
  const self = document.getElementById('self-reno')?.checked;
  const r    = _ranges[currentTierName];
  if (!r) return;

  const low  = self ? r.selfLow  : r.hiredLow;
  const high = self ? r.selfHigh : r.hiredHigh;

  // Always update scope card labels
  updateRepairTierRangeLabels();

  if (!sqft) {
    document.getElementById('repair-result').style.display = 'none';
    document.getElementById('use-est-btn').style.display   = 'none';
    return;
  }

  const rLow  = Math.round(sqft * low  / 1000) * 1000;
  const rHigh = Math.round(sqft * high / 1000) * 1000;
  document.getElementById('repair-est').textContent = '$' + rLow.toLocaleString() + ' – $' + rHigh.toLocaleString();
  document.getElementById('repair-result').style.display = 'flex';
  document.getElementById('use-est-btn').style.display   = 'block';

  // Auto-fill repair costs field with midpoint (unless user-edited)
  const repField = document.getElementById('f-rep');
  if (repField && !repField.dataset.userEdited) {
    const mid = Math.round((sqft * (low + high) / 2) / 1000) * 1000;
    repField.value = mid.toLocaleString();
    repField.dataset.autoFilled = '1';
    repField.classList.add('auto-filled');
  }
}

// Called when self-reno toggle changes
export function onSelfRenoToggle() {
  const repField = document.getElementById('f-rep');
  if (repField && repField.dataset.autoFilled === '1') {
    delete repField.dataset.userEdited;
    calcRepair();
  } else {
    calcRepair();
  }
}

// ─── P2-1 · is the Repair Costs value still the estimator's, not the user's? ──
// The field is currency-formatted, so a caret landing anywhere and new digits
// being typed CONCATENATES rather than replaces: an estimator-filled 7,800 with
// 55,000 typed after it reformats to 7,800,055,000. When the value on screen is
// still the estimator's, focusing it should offer it up for replacement.
//
// The two flags are the whole law, and they are already mutually exclusive by
// construction: calcRepair only auto-fills while `userEdited` is unset, and the
// first real keystroke sets `userEdited` and clears `autoFilled` (main.js). Both
// are checked anyway so the rule reads as its own statement — once the user has
// taken ownership of this field, focusing it never selects, and an intentionally
// positioned caret is left exactly where it was put.
export function repairFieldShouldSelectOnFocus(dataset) {
  return dataset?.autoFilled === '1' && !dataset?.userEdited;
}

// ─── Pipeline-edit corrective (defect 1) · estimator snapshot ────────────────
// The analyzer's repair-ownership state (dataset.autoFilled / userEdited) is
// runtime DOM state — it was never serialized, so a saved deal could not say
// whether its repair budget was the estimator's or the user's, and the Pipeline
// editor could not honor the difference. This snapshot captures, AT UNDERWRITING
// TIME, both governed midpoints (self-perform and hired) for the active scope
// tier and market ranges — the same formula useRepairEstimate/calcRepair use.
// A saved deal carrying it can swap self↔hired in the editor with numbers the
// REAL estimator produced, frozen exactly like the deal's market stamp; band
// recalibrations later never silently rewrite saved economics.
export function repairEstimateSnapshot(sqft) {
  const r = _ranges[currentTierName];
  if (!r || !sqft) return null;
  const mid = (lo, hi) => Math.round((sqft * (lo + hi) / 2) / 1000) * 1000;
  return {
    tier: currentTierName,
    selfMid:  mid(r.selfLow,  r.selfHigh),
    hiredMid: mid(r.hiredLow, r.hiredHigh),
  };
}

export function useRepairEstimate() {
  const sqft = +document.getElementById('sqft').value;
  const self = document.getElementById('self-reno')?.checked;
  const r    = _ranges[currentTierName];
  if (!r) return;
  const low  = self ? r.selfLow  : r.hiredLow;
  const high = self ? r.selfHigh : r.hiredHigh;
  const mid  = Math.round((sqft * (low + high) / 2) / 1000) * 1000;
  const repField = document.getElementById('f-rep');
  if (!repField) return;
  repField.value = mid.toLocaleString();
  repField.dataset.autoFilled = '1';
  repField.classList.add('auto-filled');
  repField.addEventListener('input', () => {
    repField.classList.remove('auto-filled');
    delete repField.dataset.autoFilled;
  }, { once: true });
}
