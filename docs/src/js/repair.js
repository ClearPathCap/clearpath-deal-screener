// ─── Repair cost estimator ────────────────────────────────────────────────────

// Explicit self-perform vs. hired-out ranges (Addendum item 10)
const TIER_RANGES = {
  light: { selfLow: 12, selfHigh: 22, hiredLow: 18, hiredHigh: 35 },
  mid:   { selfLow: 28, selfHigh: 48, hiredLow: 42, hiredHigh: 70 },
  full:  { selfLow: 60, selfHigh: 95, hiredLow: 90, hiredHigh: 130 },
};

let currentTierName = 'mid';

export function getCurrentTier() {
  return { name: currentTierName, ...TIER_RANGES[currentTierName] };
}

export function setRepairTier(name, el) {
  document.querySelectorAll('.tier').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentTierName = name;
  calcRepair();
  updateRepairTierRangeLabels();
}

// Update the range labels shown on the tier cards to reflect self/hired state
function updateRepairTierRangeLabels() {
  const self = document.getElementById('self-reno')?.checked;
  const tierEls = document.querySelectorAll('.tier');
  const names = ['light', 'mid', 'full'];
  tierEls.forEach((el, i) => {
    const t = names[i];
    if (!t) return;
    const r = TIER_RANGES[t];
    const rangeEl = el.querySelector('.tier-range');
    if (rangeEl) {
      if (self) {
        rangeEl.textContent = '$' + r.selfLow + '–' + r.selfHigh + '/sf';
      } else {
        rangeEl.textContent = '$' + r.hiredLow + '–' + r.hiredHigh + '/sf';
      }
    }
  });
}

export function calcRepair() {
  const sqft = +document.getElementById('sqft').value;
  const self = document.getElementById('self-reno')?.checked;
  const r = TIER_RANGES[currentTierName];
  const low  = self ? r.selfLow  : r.hiredLow;
  const high = self ? r.selfHigh : r.hiredHigh;

  // Always update the tier range labels when self-reno state changes
  updateRepairTierRangeLabels();

  if (!sqft) {
    document.getElementById('repair-result').style.display = 'none';
    document.getElementById('use-est-btn').style.display = 'none';
    return;
  }
  const rLow  = Math.round(sqft * low  / 1000) * 1000;
  const rHigh = Math.round(sqft * high / 1000) * 1000;
  document.getElementById('repair-est').textContent = '$' + rLow.toLocaleString() + ' – $' + rHigh.toLocaleString();
  document.getElementById('repair-result').style.display = 'flex';
  document.getElementById('use-est-btn').style.display = 'block';

  // Auto-fill repair costs field with midpoint
  const repField = document.getElementById('f-rep');
  if (repField && !repField.dataset.userEdited) {
    const mid = Math.round((sqft * (low + high) / 2) / 1000) * 1000;
    repField.value = mid.toLocaleString();
    repField.dataset.autoFilled = '1';
    repField.classList.add('auto-filled');
  }
}

// Called when self-reno toggle changes — recalculate if field was auto-filled
export function onSelfRenoToggle() {
  const repField = document.getElementById('f-rep');
  // Recalculate if field was populated via auto-fill
  if (repField && repField.dataset.autoFilled === '1') {
    repField.dataset.userEdited = '';      // clear user-edited guard
    delete repField.dataset.userEdited;   // ensure it's gone
    calcRepair();
  } else {
    // Still update the range labels and result display even if field not auto-filled
    calcRepair();
  }
}

export function useRepairEstimate() {
  const sqft = +document.getElementById('sqft').value;
  const self = document.getElementById('self-reno')?.checked;
  const r = TIER_RANGES[currentTierName];
  const low  = self ? r.selfLow  : r.hiredLow;
  const high = self ? r.selfHigh : r.hiredHigh;
  const mid = Math.round((sqft * (low + high) / 2) / 1000) * 1000;
  const repField = document.getElementById('f-rep');
  repField.value = mid.toLocaleString();
  repField.dataset.autoFilled = '1';
  repField.classList.add('auto-filled');
  repField.addEventListener('input', () => {
    repField.classList.remove('auto-filled');
    delete repField.dataset.autoFilled;
  }, { once: true });
}
