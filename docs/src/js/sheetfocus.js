// ─── Sheet focus law (design-system wave, accessibility round, 2026-11-24) ────
// A sheet is a modal: while it is open, keyboard and screen-reader focus live in
// it, and when it closes focus goes back to where the user was.
//   · open  — focus moves to the sheet's surface (its dialog element, made
//             programmatically focusable with tabindex="-1"), never to an input:
//             focusing an input would raise the phone keyboard unasked. A caller
//             that focuses a field right after openModal() still wins.
//   · Tab   — cycles inside the top open sheet (Shift+Tab backwards); focus that
//             has escaped the sheet is brought back in.
//   · close — focus returns to the control that opened the sheet when it is still
//             on screen; otherwise to the sheet now on top; otherwise it is left.
//             Focus the code already moved somewhere else on purpose is left.
// EXCLUDED: #modal-upgrade (sign-in / plans). Its focus is owned by the sign-in
// session (code-field focus, otpfocus suite); while it is open nothing here acts.
// Pure DOM, no imports; main.js calls sheetOpened / sheetClosed from openModal /
// closeModal and initSheetFocus once at boot. FAIL-SAFE: focus is a courtesy —
// no exception from here may ever escape into openModal / closeModal or a
// keydown, so every export swallows its own errors (bookkeeping happens first,
// so a later DOM failure cannot strand a sheet in the open list).

export const FOCUS_EXCLUDED = new Set(['modal-upgrade']);
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

let _order = [];                 // managed sheets open now, top last
const _return = new Map();       // sheet id -> element focused before it opened

const shown = (el) => !!el && el.isConnected !== false && typeof el.getClientRects === 'function' && el.getClientRects().length > 0;

export function sheetSurface(el) {
  return el.querySelector('[role="dialog"]') || el.querySelector('.modal, .modal-picker') || el;
}

export function focusables(el) {
  return Array.from(el.querySelectorAll(FOCUSABLE)).filter(shown);
}

const excludedOpen = (doc) => Array.from(FOCUS_EXCLUDED).some(id => doc.getElementById(id)?.classList.contains('active'));

export function sheetOpened(el, id, doc = document) { try { openImpl(el, id, doc); } catch {} }
export function sheetClosed(el, id, doc = document) { try { closeImpl(el, id, doc); } catch {} }
export function onSheetTab(e, doc = document) { try { return tabImpl(e, doc); } catch { return false; } }

function openImpl(el, id, doc) {
  if (!el || FOCUS_EXCLUDED.has(id)) return;
  if (!_order.includes(id)) {
    const prev = doc.activeElement;
    _return.set(id, prev && prev !== doc.body && !el.contains(prev) ? prev : null);
    _order.push(id);
  }
  const surface = sheetSurface(el);
  if (!surface.hasAttribute('tabindex')) surface.setAttribute('tabindex', '-1');
  if (!el.contains(doc.activeElement)) { try { surface.focus({ preventScroll: true }); } catch {} }
}

function closeImpl(el, id, doc) {
  if (!el || FOCUS_EXCLUDED.has(id)) return;
  const i = _order.indexOf(id);
  if (i < 0) return;
  _order.splice(i, 1);
  const target = _return.get(id);
  _return.delete(id);
  const a = doc.activeElement;
  if (a && a !== doc.body && !el.contains(a)) return;            // focus already moved on purpose
  const topEl = _order.length ? doc.getElementById(_order[_order.length - 1]) : null;
  try {
    if (target && shown(target) && (!topEl || topEl.contains(target))) target.focus({ preventScroll: true });
    else if (topEl) sheetSurface(topEl).focus({ preventScroll: true });
    else if (a && el.contains(a)) a.blur?.();                       // nothing to return to: leave the hidden sheet
  } catch {}
}

function tabImpl(e, doc) {
  if (e.key !== 'Tab' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return false;
  if (excludedOpen(doc)) return false;
  const id = _order[_order.length - 1];
  const el = id && doc.getElementById(id);
  if (!el || !el.classList.contains('active')) return false;
  const surface = sheetSurface(el);
  const items = focusables(el);
  const a = doc.activeElement;
  if (!items.length) { e.preventDefault(); try { surface.focus({ preventScroll: true }); } catch {} return true; }
  const first = items[0], last = items[items.length - 1];
  let to = null;
  if (!el.contains(a)) to = e.shiftKey ? last : first;
  else if (e.shiftKey && (a === first || a === surface || a === el)) to = last;
  else if (!e.shiftKey && a === last) to = first;
  if (!to) return false;
  e.preventDefault();
  try { to.focus({ preventScroll: true }); } catch {}
  return true;
}

export function initSheetFocus(doc = document) {
  try { doc.addEventListener('keydown', (e) => onSheetTab(e, doc), true); } catch {}
}

// Test hook: forget every open sheet (the module keeps state across a suite).
export function _resetSheetFocus() { _order = []; _return.clear(); }
