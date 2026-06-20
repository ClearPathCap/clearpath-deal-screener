// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmt(n) { return '$' + Math.round(n).toLocaleString(); }
export function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
export function cClass(v, good, ok) { return v >= good ? 'good' : v >= ok ? 'warn' : 'bad'; }

// ─── Comma-formatted currency input helper ────────────────────────────────────
// Apply to inputs that should show commas as user types.
// Usage: <input oninput="fmtCurrencyInput(this)">
// Read raw value: parseComma(el.value)

// Strip $, all whitespace (incl. non-breaking space), commas; normalize figure/en/em
// dashes and the Unicode minus to ASCII '-' (so a real negative still reaches B2 validation).
function normalizeNumericString(v) {
  return String(v ?? '')
    .replace(/[‒–—−]/g, '-') // ‒ – — − → -
    .replace(/[$,\s ]/g, '');               // $  ,  spaces  NBSP → removed
}

// Required-style read. Finite number; 0 when empty/unparseable.
// Preserves the existing flip.js contract (blank rep → 0; `|| default` fallbacks still fire).
export function parseComma(v) {
  const n = parseFloat(normalizeNumericString(v));
  return Number.isFinite(n) ? n : 0;
}

// Optional-style read for fields that must fall through to finance.js defaults.
// undefined when empty/unparseable (so `inp.x == null` applies the default); finite number otherwise.
export function parseNumOpt(v) {
  const s = normalizeNumericString(v);
  if (s === '') return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
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

// ─── Inline input errors / warnings (B2) ──────────────────────────────────────
// Renders blocking errors + soft warnings into a box above `<prefix>-results`
// (created on first use). Returns true when there is at least one blocking error
// (caller aborts compute). Pure-DOM; safe to leave unused in Node (document only
// touched when called).
export function renderInputIssues(prefix, errors, warnings) {
  let box = document.getElementById(prefix + '-input-errors');
  if (!box) {
    box = document.createElement('div');
    box.id = prefix + '-input-errors';
    box.className = 'input-errors';
    const anchor = document.getElementById(prefix + '-results');
    anchor?.parentNode?.insertBefore(box, anchor);
  }
  const e = (errors || []).map(x => `<div class="input-error">⚠ ${x.label}: ${x.message}</div>`).join('');
  const w = (warnings || []).map(x => `<div class="input-warn">• ${x.label}: ${x.message}</div>`).join('');
  box.innerHTML = e + w;
  box.style.display = (e || w) ? 'block' : 'none';
  return errors && errors.length > 0; // true = blocked
}
