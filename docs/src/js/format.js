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

// ─── F-3: decimal-aware currency mask ────────────────────────────────────────
// Money fields accept ordinary currency syntax: optional $, commas and spaces as
// grouping, ONE decimal point, cents capped at two digits. The mask never deletes
// a decimal separator ("1,200.00" can no longer collapse into "120,000"), and
// malformed input (letters, dashes, a second dot) is flagged in place — never
// reshaped into a plausible number. Values are decimal-preserving by design:
// parseComma/parseNumOpt already read "1,200.50" as 1200.5 (shipblocker B3) and
// every engine consumes floats; displays round at the render layer only.
function stripCurrencyNoise(v) {
  return String(v ?? '').replace(/[$,\s ]/g, '');
}

export function isMalformedCurrency(v) {
  const s = stripCurrencyNoise(v);
  if (s === '') return false;                 // blank is not malformed — required/optional rules decide
  return s === '.' || !/^\d*\.?\d*$/.test(s); // digits with at most one decimal point
}

// Canonical {display, value, malformed} for a currency field. Pure — unit-tested
// in Node; fmtCurrencyInput is the thin DOM wrapper around it.
export function currencyMaskValue(raw) {
  const s = stripCurrencyNoise(raw);
  if (s === '') return { display: '', value: null, malformed: false };
  if (isMalformedCurrency(s)) return { display: String(raw), value: null, malformed: true };
  const dot = s.indexOf('.');
  const int = dot === -1 ? s : s.slice(0, dot);
  const dec = dot === -1 ? undefined : s.slice(dot + 1, dot + 3); // cents cap: 2 digits
  const intFmt = (int === '' ? 0 : parseInt(int, 10)).toLocaleString();
  const display = dec === undefined ? intFmt : intFmt + '.' + dec;
  const value = parseFloat((int === '' ? '0' : int) + (dec ? '.' + dec : ''));
  return { display, value, malformed: false };
}

export function fmtCurrencyInput(el) {
  const r = currencyMaskValue(el.value);
  const wrap = el.closest ? el.closest('.field') : null;
  let msg = wrap ? wrap.querySelector('.currency-msg') : null;
  if (r.malformed) {
    // Junk stays visible and flagged — it must never become credible decision data.
    el.classList.add('input-invalid');
    el.setAttribute('aria-invalid', 'true');
    if (!msg && wrap) {
      msg = document.createElement('div');
      msg.className = 'currency-msg';
      wrap.appendChild(msg);
    }
    if (msg) msg.textContent = 'Not a valid dollar amount';
    return;
  }
  el.classList.remove('input-invalid');
  el.removeAttribute('aria-invalid');
  if (msg) msg.textContent = '';
  el.value = r.display;
}

// Numeric-input integrity (2026-09-05): an <input type="number"> holding text the
// browser cannot parse ("7.", "7,") reports value '' and validity.badInput. The
// analyzers read such a field as NaN so validateInputs blocks the run instead of
// a default silently standing in. Node harnesses stub `validity` to exercise it.
export function inputIsIncomplete(el) {
  return !!(el && el.validity && el.validity.badInput);
}

export function initCurrencyInputs() {
  document.querySelectorAll('[data-currency]').forEach(el => {
    // A value already differing from the HTML default before this module ran
    // (fast typing on a slow load, browser form restore) is the user's — protect
    // it from the presets that render right after init.
    if (el.value !== '' && el.value !== (el.defaultValue == null ? '' : String(el.defaultValue))) el.dataset.userEdited = '1';
    // Format any pre-populated values on init
    if (el.value) fmtCurrencyInput(el);
    el.addEventListener('input', (e) => {
      // LIVE INPUT-BINDING DEFECT (Orange Street, 2026-09-04): a dollar value the
      // user typed was never marked userEdited, so the market presets
      // (setLtrPreset / setBrrrPreset, re-run on every slot re-render: sub-tab
      // switch, market hydration, slot click, Clear & New Deal) silently replaced
      // a typed monthly rent / tax with the market default. Only a REAL keystroke
      // marks the field — programmatic .value writes fire no event, and the one
      // synthetic re-format dispatch (flip.js → f-carry) is untrusted by design.
      if (!e || e.isTrusted) el.dataset.userEdited = '1';
      fmtCurrencyInput(el);
    });
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
