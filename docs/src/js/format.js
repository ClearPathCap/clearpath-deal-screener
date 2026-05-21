// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmt(n) { return '$' + Math.round(n).toLocaleString(); }
export function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
export function cClass(v, good, ok) { return v >= good ? 'good' : v >= ok ? 'warn' : 'bad'; }

// ─── Comma-formatted currency input helper ────────────────────────────────────
// Apply to inputs that should show commas as user types.
// Usage: <input oninput="fmtCurrencyInput(this)">
// Read raw value: parseComma(el.value)

export function parseComma(v) {
  return +(String(v).replace(/,/g, '')) || 0;
}

export function fmtCurrencyInput(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  if (!raw) { el.value = ''; return; }
  const n = parseInt(raw, 10);
  el.value = n.toLocaleString();
}

export function initCurrencyInputs() {
  document.querySelectorAll('[data-currency]').forEach(el => {
    // Format any pre-populated values on init
    if (el.value) fmtCurrencyInput(el);
    el.addEventListener('input', () => fmtCurrencyInput(el));
  });
}

export function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function buildMetrics(items) {
  return items.map(m =>
    `<div class="metric"><div class="mlabel">${m.label}</div><div class="mval ${m.cls}">${m.val}</div></div>`
  ).join('');
}

export function buildRows(rows) {
  return rows.map(r =>
    `<div class="brow ${r.tot ? 'tot' : ''}"><span class="bl">${r.l}</span><span class="bv" style="${r.color ? 'color:' + r.color : ''}">${r.v}</span></div>`
  ).join('');
}
