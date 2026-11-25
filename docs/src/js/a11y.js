// ─── Accessibility helpers (native-readiness wave, local) ───────────────────
// A few list rows are <div role="button" tabindex="0" onclick=…> (the repair
// tiers, the market-picker rows). A real <button> would be the better long-term
// markup, but those rows carry the design wave's styling, so this wave makes
// them reachable without restyling: Tab reaches them (tabindex), screen readers
// call them buttons (role), and the keys behave like a native button's —
// Enter activates on key-down, Space on key-up (and never scrolls the page),
// a held key does not repeat. Native buttons, links and form fields are never
// touched. Web and app alike; no data is read or written.
//
// Two follow-ups a native button would give for free:
//   · the selected repair tier is announced (aria-pressed mirrors its .active
//     class, which repair.js — a protected engine file — sets);
//   · when activating a row re-renders the list it lived in (the market picker
//     drills from states into markets), focus moves to the first row of the new
//     list instead of falling to <body>.

const NATIVE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/;
export function rowButton(e) {
  const el = e && e.target;
  if (!el || !el.getAttribute || el.getAttribute('role') !== 'button') return null;
  if (NATIVE.test((el.tagName || '').toUpperCase())) return null;
  if (el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}
const isSpace = (k) => k === ' ' || k === 'Spacebar';
export function activatesRowButton(e) {
  if (!e || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return false;
  if (e.key !== 'Enter') return false;
  return !!rowButton(e);
}

function refocusAfter(el, box, d) {
  setTimeout(() => {
    if (!box || (d.contains && d.contains(el))) return;          // the row is still there: nothing to do
    const next = box.querySelector && box.querySelector('[role="button"]:not([aria-disabled="true"]), button, input');
    if (next && next.focus) next.focus();
  }, 0);
}
function activate(el, d) { const box = el.parentElement; el.click(); refocusAfter(el, box, d); }   // the list is read BEFORE the click: a re-render detaches the row

export function syncPressed(root) {
  if (!root || !root.querySelectorAll) return 0;
  let n = 0;
  root.querySelectorAll('.tier[role="button"]').forEach(t => {
    const v = t.classList && t.classList.contains('active') ? 'true' : 'false';
    if (t.getAttribute('aria-pressed') !== v) { t.setAttribute('aria-pressed', v); n++; }
  });
  return n;
}

let _on = false;
export function initA11y(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (_on || !d || !d.addEventListener) return false;
  _on = true;
  let spaceOn = null;
  d.addEventListener('keydown', (e) => {
    const el = rowButton(e);
    if (!el || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isSpace(e.key)) { e.preventDefault(); if (!e.repeat) spaceOn = el; return; }   // Space acts on key-up, like a button
    if (!activatesRowButton(e)) return;
    e.preventDefault();
    activate(el, d);
  });
  d.addEventListener('keyup', (e) => {
    if (!isSpace(e.key) || !spaceOn) return;
    const el = spaceOn; spaceOn = null;
    if (e.target !== el) return;
    e.preventDefault();
    activate(el, d);
  });
  // aria-pressed follows the repair tiers' .active class.
  try {
    syncPressed(d);
    if (typeof MutationObserver !== 'undefined' && d.querySelectorAll) {
      const mo = new MutationObserver(() => syncPressed(d));
      d.querySelectorAll('.tier[role="button"]').forEach(t => mo.observe(t, { attributes: true, attributeFilter: ['class'] }));
    }
  } catch {}
  return true;
}
