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
//   · a required sheet (data-required on its backdrop) cannot be dismissed by
//     Back — its entry is put back;
//   · on touch devices the bottom tab bar steps aside while the keyboard is up,
//     the focused field is kept clear of the keyboard, and Enter in an analyzer
//     field moves to the next field (the last one dismisses the keyboard).
// The URL never changes — no route contract is added; only history.state does.
// Pure navigation: nothing here reads or writes deal, market, tier or account
// data, and main.js keeps its own open/close/scroll-lock law.

let _hooks = null;          // { showPage(id), closeModal(id), currentPage(), isRequired(id) }
let _rootPage = 'flip';     // page for an entry whose state another module replaced with null
let _fromPop = false;       // true while a popstate is being applied (no new entries)
let _pendingBack = 0;       // history.back() calls issued by a UI close, awaiting popstate
let _queue = [];            // entries pushed while a back was pending, flushed after it lands
let _timer = null;
const _open = [];           // sheet ids, in presentation order (last = top)

function H() {
  return (typeof history !== 'undefined' && history && typeof history.pushState === 'function') ? history : null;
}
function scrollY() { return (typeof window !== 'undefined' && window.scrollY) || 0; }

function push(state) {
  const h = H(); if (!h) return;
  if (_pendingBack) { _queue.push(state); return; }
  try { h.pushState(state, ''); } catch {}
}
function flush() {
  clearTimeout(_timer); _timer = null;
  const q = _queue; _queue = [];
  const h = H(); if (!h) return;
  q.forEach(s => { try { h.pushState(s, ''); } catch {} });
}
function armTimer() {
  // A back() that never produces a popstate (a browser quirk, a page with no
  // earlier entry) must not wedge later pushes.
  clearTimeout(_timer);
  _timer = setTimeout(() => { _pendingBack = 0; flush(); }, 600);
}

function stateOf(s) {
  return (s && s.df === 1) ? s : { df: 1, page: _rootPage, sheet: null, y: 0 };
}

// ── Pages ────────────────────────────────────────────────────────────────────
// showPage calls this on every switch; a switch caused by Back does not record.
// prevY is the leaving page's scroll position, read BEFORE the page swap (once
// the shorter page is shown the browser has already clamped window.scrollY).
export function recordPage(id, prevY) {
  const h = H(); if (!h || !_hooks || _fromPop) return;
  const cur = stateOf(h.state);
  if (cur.page === id && !cur.sheet) return;
  try { h.replaceState(Object.assign({}, cur, { y: typeof prevY === 'number' ? prevY : scrollY() }), ''); } catch {}
  push({ df: 1, page: id, sheet: null, y: 0 });
}

// ── Sheets ───────────────────────────────────────────────────────────────────
export function recordSheetOpen(id) {
  if (!_open.includes(id)) _open.push(id);
  const h = H(); if (!h || !_hooks || _fromPop) return;
  push({ df: 1, page: _hooks.currentPage(), sheet: id, y: 0 });
}
export function recordSheetClose(id) {
  const i = _open.lastIndexOf(id); if (i > -1) _open.splice(i, 1);
  const h = H(); if (!h || !_hooks || _fromPop) return;
  const top = _queue.length ? _queue[_queue.length - 1] : h.state;
  if (_queue.length && top && top.sheet === id) { _queue.pop(); return; }   // never reached the history yet
  if (top && top.df === 1 && top.sheet === id) {
    _pendingBack++; armTimer();
    try { h.back(); } catch { _pendingBack = 0; flush(); }
  }
}
export function topSheet() { return _open.length ? _open[_open.length - 1] : null; }

// ── Back ─────────────────────────────────────────────────────────────────────
function onPop(e) {
  if (_pendingBack) {            // the entry a UI close consumed — already applied
    _pendingBack--;
    if (!_pendingBack) flush();
    return;
  }
  const target = stateOf(e && e.state);
  _fromPop = true;
  try {
    // 1. Close sheets above the target (top first). A required sheet stays and
    //    gets its entry back.
    for (let k = _open.length - 1; k >= 0; k--) {
      const id = _open[k];
      if (id === target.sheet) break;
      if (_hooks.isRequired(id)) {
        _fromPop = false;
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
}

function onKey(e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
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
  if (!el || el.disabled || !el.getClientRects || !el.getClientRects().length) return false;
  const d = el.closest && el.closest('details');
  return !(d && !d.open && !(el.closest('summary')));
}
// The analyzer field after `el` on the same page, or null.
export function nextField(el) {
  const page = el && el.closest && el.closest('.page');
  if (!page) return null;
  const all = Array.from(page.querySelectorAll('input, textarea')).filter(f => isTextEntry(f) && visible(f));
  const i = all.indexOf(el);
  return i > -1 && i < all.length - 1 ? all[i + 1] : null;
}

function keepClearOfKeyboard() {
  const el = document.activeElement, vv = window.visualViewport;
  if (!vv || !isTextEntry(el) || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  const top = vv.offsetTop + 8, bottom = vv.offsetTop + vv.height - 12;
  if (r.bottom > bottom || r.top < top) {
    try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch {}
  }
}

function initKeyboard() {
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const body = document.body;
  if (coarse && body && body.classList) {
    document.addEventListener('focusin', e => { if (isTextEntry(e.target)) body.classList.add('kb-open'); });
    document.addEventListener('focusout', () => {
      setTimeout(() => { if (!isTextEntry(document.activeElement)) body.classList.remove('kb-open'); }, 0);
    });
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', keepClearOfKeyboard);
    }
  }
  // Enter = Next inside an analyzer page (fields carry enterkeyhint="next").
  // Never inside a modal: the sign-in and code fields keep their own Enter.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    const el = e.target;
    if (!el || el.tagName !== 'INPUT' || !isTextEntry(el) || !el.closest || !el.closest('.page')) return;
    e.preventDefault();
    const next = nextField(el);
    if (next) next.focus(); else if (el.blur) el.blur();
  });
  document.querySelectorAll('.page input').forEach(f => {
    if (isTextEntry(f) && !f.getAttribute('enterkeyhint')) f.setAttribute('enterkeyhint', 'next');
  });
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
  const h = H();
  if (typeof window === 'undefined' || !window.addEventListener || typeof document === 'undefined' || !document.addEventListener) return false;
  if (h) {
    try { if ('scrollRestoration' in h) h.scrollRestoration = 'manual'; } catch {}
    try { h.replaceState(Object.assign({}, h.state, { df: 1, page: _rootPage, sheet: null, y: 0 }), ''); } catch {}
    window.addEventListener('popstate', onPop);
  }
  document.addEventListener('keydown', onKey);
  initKeyboard();
  return true;
}
