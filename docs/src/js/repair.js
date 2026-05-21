// ─── Repair cost estimator ────────────────────────────────────────────────────

let currentTier = { name: 'mid', low: 35, high: 70 };

export function getCurrentTier() { return currentTier; }

export function setTier(name, el) {
  document.querySelectorAll('.tier').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const tiers = {
    light: { name: 'light', low: 15, high: 35 },
    mid:   { name: 'mid',   low: 35, high: 70 },
    full:  { name: 'full',  low: 70, high: 130 },
  };
  currentTier = tiers[name];
  calcRepair();
}

export function calcRepair() {
  const sqft = +document.getElementById('sqft').value;
  const self = document.getElementById('self-reno').checked;
  let low = currentTier.low, high = currentTier.high;
  if (self) { low = Math.round(low * 0.65); high = Math.round(high * 0.65); }
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
}

export function useRepairEstimate() {
  const sqft = +document.getElementById('sqft').value;
  const self = document.getElementById('self-reno').checked;
  let low = currentTier.low, high = currentTier.high;
  if (self) { low = Math.round(low * 0.65); high = Math.round(high * 0.65); }
  const mid = Math.round((sqft * (low + high) / 2) / 1000) * 1000;
  document.getElementById('f-rep').value = mid;
}
