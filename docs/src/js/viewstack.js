// ─── View stack — History-API navigation, sheets, keyboard (design-system wave) ──
// Native-interaction groundwork that works on the web today and inside a
// Capacitor shell later:
//   · every tab switch and every sheet (modal) presentation is a History entry,
//     so the browser Back button, the iOS Safari edge-swipe, the Android system
//     Back gesture (and, in the shell, @capacitor/app's backButton → history.back
//     and WKWebView's allowsBackForwardNavigationGestures) all step back through
//     the app: the top sheet closes first, then the previous tab returns at the
//     scroll position it was left at;
//   · Escape closes the top sheet (keyboard parity with Back);
//   · a required sheet (data-required on its backdrop) is not dismissed by Back
//     from inside the app — its entry is put back. (A browser may still skip an
//     entry that was pushed without a user gesture, e.g. a sheet opened at load;
//     that is the browser's own back-button intervention.)
//   · on touch devices the bottom tab bar steps aside while the on-screen
//     keyboard is up (detected from the visual viewport, so a keyboard hidden
//     without a blur brings the tab bar back), the focused field is kept clear
//     of the keyboard, and Enter in an analyzer field moves to the next field
//     (the last one says "done" and dismisses the keyboard).
// The URL never changes — no route contract is added; only history.state does.
// Pure navigation: nothing here reads or writes deal, market, tier or account
// data, and main.js keeps its own open/close/scroll-lock law.
//
// HISTORY MODEL. history.state only changes when a traversal is APPLIED, which
// is asynchronous, so the module keeps its own model of the entries it created
// (_stack, each with a unique n) and of the logical position (_pos) — where
// history WILL be once every requested traversal has landed. Decisions read the
// model, never history.state:
//   · a UI close of the top sheet steps the model back and owes one traversal;
//     closes in the same task are coalesced into ONE history.go(-k);
//   · while a traversal is owed or in flight, new entries are queued and pushed
//     only after its popstate lands (a push before it would be undone by it);
//   · a sheet closed while another sheet is above it cannot have its entry
//     removed (History cannot delete entries), so the entry is marked dead and
//     skipped when Back or Forward reaches it — no "dead" Back press.

let _hooks = null;          // { showPage(id), closeModal(id), currentPage(), isRequired(id) }
let _rootPage = 'flip';
let _seq = 0;               // entry ids (monotonic, unique across reloads)
let _stack = [];            // the entries this page created, oldest first
let _pos = 0;               // logical position in _stack (after owed traversals)
let _owed = 0;              // traversal steps requested this task, not yet issued
let _expect = false;        // a traversal we issued has not landed yet
let _queue = [];            // entries waiting for an in-flight traversal to land
let _fromPop = false;       // true while a popstate is being applied (no new entries)
let _timer = null;
const _open = [];           // sheet ids, in presentation order (last = top)

function H() {
  return (typeof history !== 'undefined' && history && typeof history.pushState === 'function') ? history : null;
}
function scrollY() { return (typeof window !== 'undefined' && window.scrollY) || 0; }
const busy = () => _owed > 0 || _expect;

function rawPush(s) { const h = H(); if (h) { try { h.pushState(Object.assign({}, s), ''); } catch {} } }
function push(state) {
  state.n = ++_seq;
  _stack.splice(_pos + 1);
  _stack.push(state);
  _pos = _stack.length - 1;
  if (busy()) _queue.push(state); else rawPush(state);
}
function flushQueue() {
  const q = _queue; _queue = [];
  q.forEach(rawPush);
}
// Owe `steps` traversals back; all requests in one task become one go(-k).
function stepBack(steps) {
  if (steps <= 0) return;
  const first = _owed === 0;
  _owed += steps;
  if (!first) return;                    // already scheduled this task
  Promise.resolve().then(() => {
    const k = _owed; _owed = 0;
    const h = H(); if (!h || !k) { flushQueue(); return; }
    _expect = true;
    try { h.go(-k); } catch { _expect = false; flushQueue(); return; }
    // A traversal that never reports (a browser quirk) must not wedge later
    // pushes forever. The expectation is KEPT, so a late popstate is still
    // recognised as ours and never mistaken for the user's Back.
    clearTimeout(_timer);
    _timer = setTimeout(flushQueue, 3000);
  });
}

// ── Pages ────────────────────────────────────────────────────────────────────
// showPage calls this on every switch; a switch caused by Back does not record.
// prevY is the leaving page's scroll position, read BEFORE the page swap (once
// the shorter page is shown the browser has already clamped window.scrollY).
export function recordPage(id, prevY) {
  if (!_hooks || _fromPop || !H()) return;
  const cur = _stack[_pos];
  if (cur && cur.page === id && !cur.sheet) return;
  if (cur) {
    cur.y = typeof prevY === 'number' ? prevY : scrollY();
    if (!busy()) { try { H().replaceState(Object.assign({}, cur), ''); } catch {} }
  }
  push({ df: 1, page: id, sheet: null, y: 0 });
}

// ── Sheets ───────────────────────────────────────────────────────────────────
export function recordSheetOpen(id) {
  if (!_open.includes(id)) _open.push(id);
  if (!_hooks || _fromPop || !H()) return;
  push({ df: 1, page: _hooks.currentPage(), sheet: id, y: 0 });
}
export function recordSheetClose(id) {
  const i = _open.lastIndexOf(id); if (i > -1) _open.splice(i, 1);
  if (!_hooks || _fromPop || !H()) return;
  let k = -1;
  for (let j = _pos; j > 0; j--) if (_stack[j].sheet === id && !_stack[j].dead) { k = j; break; }
  if (k === -1) return;
  const qi = _queue.indexOf(_stack[k]);
  if (qi > -1 && k === _pos) {           // never reached the browser: just drop it
    _queue.splice(qi, 1); _stack.splice(k, 1); _pos--;
    return;
  }
  if (k === _pos) {                      // the top entry: step back over it and any dead ones below
    let steps = 0;
    do { _pos--; steps++; } while (_pos > 0 && _stack[_pos].dead);
    stepBack(steps);
  } else {
    _stack[k].dead = true;               // below another sheet: skipped later
  }
}
export function topSheet() { return _open.length ? _open[_open.length - 1] : null; }

// ── Back / Forward ───────────────────────────────────────────────────────────
function onPop(e) {
  if (_expect) {                         // a traversal we issued has landed
    clearTimeout(_timer);
    _expect = false;
    flushQueue();
    return;
  }
  // A user traversal (Back, Forward, edge swipe, system back).
  const st = e && e.state;
  let idx = st && st.df === 1 ? _stack.findIndex(s => s.n === st.n) : -1;
  if (idx === -1) idx = 0;               // an entry from before this load → the root
  // An entry that can no longer be shown (a dead sheet entry, or a sheet that is
  // not open — e.g. Forward into a closed sheet) is skipped down to the nearest
  // live entry below it.
  let live = idx;
  while (live > 0 && (_stack[live].dead || (_stack[live].sheet && !_open.includes(_stack[live].sheet)))) live--;
  const target = _stack[live];
  _pos = idx;
  _fromPop = true;
  try {
    // 1. Close sheets above the target (top first). A required sheet stays: its
    //    entry is put back on top of where history now is, nothing else changes.
    for (let k = _open.length - 1; k >= 0; k--) {
      const id = _open[k];
      if (id === target.sheet) break;
      if (_hooks.isRequired(id)) {
        _pos = idx;                      // where the browser now is
        push({ df: 1, page: _hooks.currentPage(), sheet: id, y: 0 });
        return;
      }
      _hooks.closeModal(id);
    }
    // 2. Return to the target's page at the scroll position it was left at.
    if (target.page && target.page !== _hooks.currentPage()) {
      _hooks.showPage(target.page);
      if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, target.y || 0);
    }
  } finally { _fromPop = false; }
  // 3. Skip the dead entries so the next Back press does something visible.
  if (live < idx) { _pos = live; stepBack(idx - live); }
}

function onKey(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  const id = topSheet();
  if (!id || _hooks.isRequired(id)) return;
  e.preventDefault();
  _hooks.closeModal(id);
}

// ── Keyboard and focus (touch devices) ──────────────────────────────────────
const NON_TEXT = /^(checkbox|radio|button|submit|reset|range|color|file|hidden|image)$/i;
export function isTextEntry(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName.toUpperCase();
  if (t === 'TEXTAREA') return true;
  if (t !== 'INPUT') return false;
  return !NON_TEXT.test(el.type || 'text');
}
function visible(el) {
  return !!(el && !el.disabled && el.getClientRects && el.getClientRects().length);
}
// The analyzer text field after `el` on the same page, or null.
export function nextField(el) {
  const page = el && el.closest && el.closest('.page');
  if (!page) return null;
  const all = Array.from(page.querySelectorAll('input, textarea')).filter(f => isTextEntry(f) && visible(f));
  const i = all.indexOf(el);
  return i > -1 && i < all.length - 1 ? all[i + 1] : null;
}
// The on-screen keyboard is up when the visual viewport is clearly shorter than
// the layout viewport (pinch-zoom excluded).
export const KEYBOARD_MIN_PX = 150;
export function keyboardUp(win) {
  const vv = win && win.visualViewport;
  if (!vv || (vv.scale && vv.scale > 1.01)) return false;
  return (win.innerHeight - vv.height) > KEYBOARD_MIN_PX;
}
function keepClearOfKeyboard(el, vv) {
  if (!el || !el.getBoundingClientRect || !vv) return;
  const r = el.getBoundingClientRect();
  const top = vv.offsetTop + 8, bottom = vv.offsetTop + vv.height - 12;
  if (r.bottom > bottom || r.top < top) {
    try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch {}
  }
}
// One watcher for focus and viewport changes: the tab bar hides while a text
// field is focused and the keyboard is up (or was just focused, before the
// keyboard's own resize arrives); it returns when the keyboard goes away even
// if focus stays (Android Back hides the keyboard without a blur). The focused
// field is re-centred only on the change INTO the keyboard-up state, never on
// ordinary scrolling or browser-chrome resizes.
export function makeKeyboardWatcher(win, doc) {
  let up = false;
  const set = (on) => { const b = doc.body; if (b && b.classList) b.classList[on ? 'add' : 'remove']('kb-open'); };
  return {
    focusIn(el) {
      if (!isTextEntry(el)) return;
      if (el.closest && el.closest('.page') && el.setAttribute) el.setAttribute('enterkeyhint', nextField(el) ? 'next' : 'done');
      up = keyboardUp(win);
      set(true);
    },
    focusOut() {
      if (isTextEntry(doc.activeElement)) return;
      up = false; set(false);
    },
    viewport() {
      const now = keyboardUp(win), el = doc.activeElement;
      if (!isTextEntry(el)) { up = false; set(false); return; }
      if (now && !up) { up = true; set(true); keepClearOfKeyboard(el, win.visualViewport); }
      else if (!now && up) { up = false; set(false); }
    },
  };
}

// Enter = Next inside an analyzer page. Never inside a modal: the sign-in and
// code fields keep their own Enter.
export function onEnter(e) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return false;
  const el = e.target;
  if (!el || el.tagName !== 'INPUT' || !isTextEntry(el) || !el.closest || !el.closest('.page')) return false;
  e.preventDefault();
  const next = nextField(el);
  if (next) next.focus(); else if (el.blur) el.blur();
  return true;
}

function initKeyboard() {
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (coarse) {
    const w = makeKeyboardWatcher(window, document);
    document.addEventListener('focusin', e => w.focusIn(e.target));
    document.addEventListener('focusout', () => setTimeout(() => w.focusOut(), 0));
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', () => w.viewport());
    }
  }
  document.addEventListener('keydown', onEnter);
}

// ── Haptics (shell groundwork) ───────────────────────────────────────────────
// A no-op on the web. Inside a Capacitor shell with @capacitor/haptics, a light
// selection tick on tab switches — never on a financial result.
export function haptic() {
  try {
    const H2 = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H2 && H2.selectionChanged) H2.selectionChanged();
  } catch {}
}

// ── Init ─────────────────────────────────────────────────────────────────────
export function initViewStack(hooks) {
  _hooks = hooks;
  _rootPage = hooks.currentPage() || 'flip';
  if (typeof window === 'undefined' || !window.addEventListener || typeof document === 'undefined' || !document.addEventListener) return false;
  const h = H();
  if (h) {
    // Reload: the view stack restores scroll itself (manual restoration — the
    // body lock behind an open sheet would otherwise record 0 for the page).
    // If the reloaded entry was this same page with no sheet, return to where
    // the visitor was, as the browser used to.
    const prev = h.state;
    const restoreY = prev && prev.df === 1 && prev.page === _rootPage && !prev.sheet && prev.y > 0 ? prev.y : 0;
    try { if ('scrollRestoration' in h) h.scrollRestoration = 'manual'; } catch {}
    _seq = Date.now();
    const root = { df: 1, n: ++_seq, page: _rootPage, sheet: null, y: 0 };
    _stack = [root]; _pos = 0;
    try { h.replaceState(Object.assign({}, h.state, root), ''); } catch {}
    window.addEventListener('popstate', onPop);
    // Keep the current entry's scroll position for a reload.
    window.addEventListener('pagehide', () => {
      const cur = _stack[_pos];
      if (cur && !cur.sheet && !busy()) { try { h.replaceState(Object.assign({}, cur, { y: scrollY() }), ''); } catch {} }
    });
    if (restoreY && window.scrollTo) {
      const go = () => window.scrollTo(0, restoreY);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else setTimeout(go, 0);
    }
  }
  document.addEventListener('keydown', onKey);
  initKeyboard();
  return true;
}
