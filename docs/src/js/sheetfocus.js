// ─── Sheet focus law (design-system wave, accessibility round, 2026-11-24) ────
// A sheet is a modal: while it is open, keyboard focus lives in it, and when it
// closes focus goes back to where the user was.
//   · open  — the sheet's surface is announced as a modal dialog (role="dialog",
//             aria-modal="true", labelled by its heading; markup that already
//             says so is respected) and takes focus (tabindex="-1"), never an
//             input: focusing an input would raise the phone keyboard unasked.
//             A caller that focuses a field right after openModal() still wins.
//   · Tab   — cycles inside the top open sheet (Shift+Tab backwards); focus that
//             has escaped the sheet is brought back in.
//   · close — focus returns to the control that opened the sheet when it is still
//             on screen and is not a text field (re-focusing a text field would
//             raise the keyboard); otherwise to the sheet now on top; otherwise
//             it leaves the hidden sheet. Focus the code already moved somewhere
//             else on purpose is left alone.
// Screen readers: aria-modal is the signal; the page behind is not made inert
// (no `inert` on the app shell yet — banked), so a swipe reader may still reach
// it on engines that ignore aria-modal.
// DF-SIGNIN-SHEET (2026-11-27): #modal-upgrade (sign-in / plans), excluded until
// its redesign, is now managed like every other sheet. Its own field focus still
// wins: the code box is focused inside the Send code tap (otpfocus suite), after
// the sheet is already open, and a resumed code step focuses the box right after
// openModal(). FOCUS_EXCLUDED stays as the mechanism, empty.
// A sheet whose title element is re-rendered must keep the id its
// aria-labelledby names (the market picker re-uses #picker-headline).
// Pure DOM, no imports; main.js calls sheetOpened / sheetClosed from openModal /
// closeModal and initSheetFocus once at boot. FAIL-SAFE: focus is a courtesy —
// no exception from here may ever escape into openModal / closeModal or a
// keydown, so every export swallows its own errors (bookkeeping happens first,
// so a later DOM failure cannot strand a sheet in the open list).

export const FOCUS_EXCLUDED = new Set();
export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
const NON_TEXT_INPUT = /^(button|submit|reset|checkbox|radio|range|color|file|image)$/i;

let _order = [];                 // managed sheets open now, top last
const _return = new Map();       // sheet id -> element focused before it opened

const shown = (el) => !!el && el.isConnected !== false && typeof el.getClientRects === 'function' && el.getClientRects().length > 0;
const attr = (el, a) => (typeof el.getAttribute === 'function' ? el.getAttribute(a) : null);

export function isTextField(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT.test(String(attr(el, 'type') || el.type || 'text'));
  return attr(el, 'contenteditable') === 'true' || el.isContentEditable === true;
}

export function sheetSurface(el) {
  if (typeof el.matches === 'function' && el.matches('[role="dialog"]')) return el;
  return el.querySelector('[role="dialog"]') || el.querySelector('.modal, .modal-picker') || el;
}

// Tabbable controls: the selector, minus anything explicitly taken out of the
// Tab order (a button with tabindex="-1" matches button:not([disabled])).
export function focusables(el) {
  return Array.from(el.querySelectorAll(FOCUSABLE)).filter(e => attr(e, 'tabindex') !== '-1' && shown(e));
}

const excludedOpen = (doc) => Array.from(FOCUS_EXCLUDED).some(id => doc.getElementById(id)?.classList.contains('active'));

export function sheetOpened(el, id, doc = document) { try { openImpl(el, id, doc); } catch {} }
export function sheetClosed(el, id, doc = document) { try { closeImpl(el, id, doc); } catch {} }
export function onSheetTab(e, doc = document) { try { return tabImpl(e, doc); } catch { return false; } }

function announce(surface, id) {
  if (!surface.hasAttribute('role')) surface.setAttribute('role', 'dialog');
  if (!surface.hasAttribute('aria-modal')) surface.setAttribute('aria-modal', 'true');
  if (surface.hasAttribute('aria-labelledby') || surface.hasAttribute('aria-label')) return;
  const h = surface.querySelector('h1, h2, h3, .picker-title');   // the market picker titles with a div
  if (!h) return;
  if (!h.id) h.id = id + '-title';
  surface.setAttribute('aria-labelledby', h.id);
}

function openImpl(el, id, doc) {
  if (!el || FOCUS_EXCLUDED.has(id)) return;
  if (!_order.includes(id)) {
    const prev = doc.activeElement;
    _return.set(id, prev && prev !== doc.body && !el.contains(prev) ? prev : null);
    _order.push(id);
  }
  const surface = sheetSurface(el);
  announce(surface, id);
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
    if (target && shown(target) && !isTextField(target) && (!topEl || topEl.contains(target))) target.focus({ preventScroll: true });
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
