// ─── Platform layer — one seam between the web app and a native shell ────────
// Native-readiness wave (local). DealFit ships the SAME files to GitHub Pages and,
// later, into a Capacitor 8 shell (bundled `docs/`, no live-site wrapper). Every
// place where the two differ goes through this module:
//   · share            — the OS share sheet (navigator.share on the web; the
//                        Share plugin in the app, where Android's WebView has no
//                        navigator.share);
//   · external pages   — window.open(url, '_blank') on the web; the in-app
//                        browser (SFSafariViewController / Custom Tabs) in the app;
//   · payment pages    — location.href on the web; REFUSED in the app until the
//                        owner chooses a store-compliant payment path (an owner
//                        decision, NATIVE_READINESS.md §7) — no checkout code;
//   · install prompt   — never offered inside the app;
//   · hardware Back    — Android Back steps the design wave's view stack;
//   · haptics, status bar, safe area, keyboard accessory bar;
//   · deep links       — Universal Links / App Links mapped to a local page.
//
// WEB LAW. When `window.Capacitor?.isNativePlatform?.()` is not true, every export
// here does exactly what the call site did before this module existed, and
// initPlatform() changes nothing (no listener, no attribute, no DOM write). No
// native plugin code is ever loaded on the web: a native shell injects its own
// bridge (`window.Capacitor`), and this module only talks to that bridge.
//
// THE BRIDGE. In a real Capacitor 8 shell the native side pre-fills
// window.Capacitor.Plugins (Android JSExport, iOS JSExport.swift): every plugin
// is an object whose methods call nativePromise / nativeCallback, and whose
// addListener returns a plain { remove } object — NOT a Promise. With
// @capacitor/core loaded (not the case here: no bundler) the entries are
// registerPlugin proxies whose addListener returns a Promise. call() and
// listen() below accept both shapes and never throw, so a shell difference can
// never stop main.js from booting. A plugin listed in PluginHeaders but missing
// from Capacitor.Plugins gets a fallback object built the same way JSExport
// builds it.
//
// Importable in Node: no top-level browser access (the share/handoff suites
// import modules that import this one).

const W = () => (typeof window !== 'undefined' ? window : null);
const CAP = () => { const w = W(); return w && w.Capacitor ? w.Capacitor : null; };

// The one native test, exactly as the owner's architecture standard words it.
export function isNative() {
  try { const c = CAP(); return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform() === true); }
  catch { return false; }
}
export function platformId() {
  if (!isNative()) return 'web';
  try { const p = CAP().getPlatform(); return p === 'ios' || p === 'android' ? p : 'web'; } catch { return 'web'; }
}

// ── Plugins ─────────────────────────────────────────────────────────────────
// Returns the shell's plugin object, or null on the web or when the shell does
// not carry it.
const _fallbacks = new Map();
export function plugin(name) {
  if (!isNative()) return null;
  const c = CAP();
  if (c.Plugins && c.Plugins[name]) return c.Plugins[name];
  if (_fallbacks.has(name)) return _fallbacks.get(name);
  const header = Array.isArray(c.PluginHeaders) ? c.PluginHeaders.find(h => h && h.name === name) : null;
  if (!header || typeof c.nativePromise !== 'function' || typeof c.nativeCallback !== 'function') return null;
  const obj = {};
  for (const m of (header.methods || [])) {
    if (!m || m.name === 'addListener' || m.name === 'removeListener') continue;
    obj[m.name] = m.rtype === 'promise'
      ? (opts) => c.nativePromise(name, m.name, opts || {})
      : (opts, cb) => c.nativeCallback(name, m.name, opts || {}, cb);
  }
  // Same shape as the bridge's own cap.addListener: a plain { remove }.
  obj.addListener = (eventName, cb) => {
    if (typeof c.addListener === 'function') return c.addListener(name, eventName, cb);
    const callbackId = c.nativeCallback(name, 'addListener', { eventName }, cb);
    return { remove: async () => { c.nativeCallback(name, 'removeListener', { callbackId, eventName }, cb); } };
  };
  _fallbacks.set(name, obj);
  try { if (c.Plugins && !c.Plugins[name]) c.Plugins[name] = obj; } catch {}
  return obj;
}
// Call a plugin method: always a Promise, never a synchronous throw.
export function call(P, method, opts) {
  try {
    if (!P || typeof P[method] !== 'function') return Promise.reject(new Error(method + ' is not available'));
    return Promise.resolve(P[method](opts || {}));
  } catch (e) { return Promise.reject(e); }
}
// Add a listener: resolves to the handle ({ remove }) or null; never throws,
// whether the shell's addListener returns a handle or a Promise of one.
export function listen(P, eventName, cb) {
  try {
    if (!P || typeof P.addListener !== 'function') return Promise.resolve(null);
    return Promise.resolve(P.addListener(eventName, cb)).catch(() => null);
  } catch { return Promise.resolve(null); }
}

// ── Share ───────────────────────────────────────────────────────────────────
// canShare / share keep share.js's own contract: share() resolves when the sheet
// was used and REJECTS when it was dismissed or refused, so share.js shows its
// fallback options exactly as before.
export function canShare() {
  if (isNative()) return !!plugin('Share');
  return !!(typeof navigator !== 'undefined' && navigator.share);
}
export function share(payload) {
  if (isNative()) {
    const p = payload || {};
    return call(plugin('Share'), 'share', { title: p.title, text: p.text, url: p.url, dialogTitle: p.title });
  }
  return navigator.share(payload);
}

// ── External pages ──────────────────────────────────────────────────────────
// The CPC funding hand-off and other https pages. Web: the exact call the
// analyzers made (window.open(url, '_blank', 'noopener')). App: the in-app
// browser, so the user returns to DealFit with one tap ("Done" / back).
export const PUBLIC_ORIGIN = 'https://dealfit.clearpathcapfunding.com';
let _rawOpen = null;   // the WebView's own window.open, kept when the app shim is installed
export function openExternal(url) {
  const w = W();
  if (!isNative()) return w ? w.open(url, '_blank', 'noopener') : null;
  const target = externalTarget(url);
  if (!target) return null;
  const B = plugin('Browser');
  if (target.kind === 'web' && B && typeof B.open === 'function') {
    call(B, 'open', { url: target.url, presentationStyle: 'popover' }).catch(() => {});
    return null;
  }
  // mailto:/tel:/sms:, or no Browser plugin: a main-frame navigation to a URL
  // outside the app, which the Capacitor shell hands to the system (Mail, the
  // dialer, Safari / Chrome) while the app page stays where it is.
  try { w.location.href = target.url; } catch {}
  return null;
}
// Where an app-side link should go (pure; exported for tests). A link into the
// app's OWN bundled pages (terms.html, privacy.html …) opens the PUBLISHED copy in
// the in-app browser, because a second WebView window cannot show a bundled page.
export function externalTarget(url, base) {
  let u;
  try { u = new URL(String(url), base || (W() && W().location ? W().location.href : PUBLIC_ORIGIN + '/')); } catch { return null; }
  if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') return { kind: 'system', url: u.href };
  if (u.protocol !== 'https:' && u.protocol !== 'http:' && u.protocol !== 'capacitor:') return null;   // javascript:, data:, file: …
  const own = W() && W().location && u.origin === W().location.origin;
  if (own || u.protocol === 'capacitor:') return { kind: 'web', url: PUBLIC_ORIGIN + u.pathname + u.search + u.hash };
  if (u.protocol !== 'https:') return null;                                 // never a cleartext page in the app
  return { kind: 'web', url: u.href };
}

// ── Payment pages (Stripe Checkout / Customer Portal) ───────────────────────
// Web: navigate exactly as before. App: no payment page is opened until the
// owner picks a store-compliant model (App Review 3.1.1 / Play Payments); the
// caller shows a neutral message that points nowhere (no steering copy).
export function paymentsInApp() { return !isNative(); }
export function openPaymentPage(url) {
  if (isNative()) return false;
  location.href = url;
  return true;
}
export const NATIVE_PAYMENT_MESSAGE = 'Plans can’t be changed in the app yet.';
// The plans sheet's purchase buttons, hidden in the app (no markup change: the
// plans sheet belongs to the sign-in / commercial work). Prices stay visible
// until the owner's store-payment decision.
export const NATIVE_HIDDEN_PURCHASE = '.btn-upgrade-investor,.btn-upgrade-pro,#manage-sub-btn';

// ── Install prompt ──────────────────────────────────────────────────────────
// Inside the app the PWA install ("Get the App") is meaningless: treat it as
// already installed (install.js hides the button, never prompts or toasts).
export function isInstalledApp() { return isNative(); }

// ── Deep links (Universal Links / App Links) ────────────────────────────────
// Pure mapping from an opened https link to a page INSIDE the bundle, or null.
// Only the app's own host is accepted, and only parameters the web page itself
// already handles on load are carried, so an opened link behaves exactly like
// the same visit in a browser. ?install= and ?checkout= are dropped in the app
// (no install prompt; no payment page in the app).
export const LINK_HOSTS = ['dealfit.clearpathcapfunding.com'];
const SHARE_TOKEN = /^[0-9a-f]{32}$/;      // the viewer's own token shape (sharedView.js)
export function deepLinkTarget(href, authParams) {
  let u;
  try { u = new URL(String(href)); } catch { return null; }
  if (u.protocol !== 'https:' || !LINK_HOSTS.includes(u.hostname)) return null;
  const path = u.pathname.replace(/\/+$/, '') || '/';
  if (path === '/shared.html' || path === '/shared') {
    const d = u.searchParams.get('d');
    return d && SHARE_TOKEN.test(d) ? 'shared.html?d=' + encodeURIComponent(d) : 'index.html';
  }
  if (path !== '/' && path !== '/index.html') return 'index.html';
  const q = new URLSearchParams();
  const tool = u.searchParams.get('tool');
  if (tool && /^[a-z-]{1,40}$/.test(tool)) q.set('tool', tool);
  // An emailed sign-in token keeps its web semantics: the page's own code decides
  // (today AUTH_LINK_ENABLED = false, so it is only removed from the address).
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  const frag = new URLSearchParams();
  for (const k of (authParams || [])) {
    if (h.has(k)) frag.set(k, h.get(k));
    else if (u.searchParams.has(k)) q.set(k, u.searchParams.get(k));
  }
  const qs = q.toString(), fs = frag.toString();
  return 'index.html' + (qs ? '?' + qs : '') + (fs ? '#' + fs : '');
}

// ── Init (native only; a no-op on the web) ─────────────────────────────────
// hooks: { canStepBack(): boolean, requiredSheetOpen(): boolean } from the view
// stack; authParams: the sign-in link parameter names (signinCode.js
// AUTH_LINK_PARAMS) for deepLinkTarget. Never throws.
let _inited = false;
export function initPlatform(hooks) {
  if (_inited || !isNative()) return false;
  _inited = true;
  try { setUp(hooks || {}); } catch (e) { try { console.warn('platform init', e); } catch {} }
  return true;
}
function setUp(h) {
  const w = W(), doc = w.document, id = platformId();
  try { doc.documentElement.setAttribute('data-platform', id); } catch {}
  try { (CAP().PluginHeaders || []).forEach(hd => hd && hd.name && plugin(hd.name)); } catch {}
  try {
    const st = doc.createElement('style');
    st.textContent = NATIVE_HIDDEN_PURCHASE + '{display:none!important}';
    (doc.head || doc.documentElement).appendChild(st);
  } catch {}

  // External links: window.open(…, '_blank') from any module (the analyzers'
  // CPC hand-off among them, unchanged) goes to the in-app browser.
  _rawOpen = (w.open && w.open.__dfRaw) || w.open;     // never wrap the shim twice
  const shim = function (url, target, features) {
    if (!target || target === '_blank') { openExternal(url); return null; }
    return _rawOpen.call(w, url, target, features);
  };
  shim.__dfRaw = _rawOpen;
  w.open = shim;
  // <a target="_blank"> (legal footer, guide sources, share fallbacks): same route.
  // Same-tab links (in-page anchors, the app's own pages) stay in the WebView.
  doc.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href');
    const t = externalTarget(href);
    if (!t || (a.target !== '_blank' && t.kind !== 'system')) return;
    e.preventDefault();
    openExternal(href);
  });

  // Android hardware Back → the view stack (the top sheet closes first, then the
  // previous tab). At the root — or while a required sheet that Back cannot
  // close is on top (the first-launch market picker) — it backgrounds the app
  // (Android's behaviour for a root activity): never a dead press, and never a
  // history entry from a previous page load.
  const App = plugin('App');
  listen(App, 'backButton', () => {
    const required = !!(h.requiredSheetOpen && h.requiredSheetOpen());
    if (!required && h.canStepBack && h.canStepBack()) { try { w.history.back(); } catch {} return; }
    call(App, 'minimizeApp').catch(() => {});
  });
  // Deep links: an opened link replaces the page with the mapped local page,
  // unless that page is already the one showing (a re-delivered link, or the
  // reload the link itself caused) — never a reload loop, even without
  // sessionStorage.
  const here = () => { try { const l = w.location; return (l.pathname.replace(/^.*\//, '') || 'index.html') + l.search + l.hash; } catch { return ''; } };
  const go = (href) => {
    const t = deepLinkTarget(href, h.authParams);
    if (!t || t === here()) return;
    try { w.location.replace(new URL(t, w.location.href).href); } catch {}
  };
  // A warm link (or one the shell retained across a cold start) is recorded as
  // applied, so the launch-URL read on the page it opens does not re-apply it.
  listen(App, 'appUrlOpen', (ev) => {
    const url = ev && ev.url;
    if (!url) return;
    try { w.sessionStorage.setItem('df.launchUrl', url); } catch {}
    go(url);
  });
  call(App, 'getLaunchUrl').then((r) => {
    const url = r && r.url;
    if (!url) return;
    let seen = null;
    try { seen = w.sessionStorage.getItem('df.launchUrl'); w.sessionStorage.setItem('df.launchUrl', url); } catch { seen = url; }   // no sessionStorage → never re-apply
    if (seen !== url) go(url);
  }).catch(() => {});

  // Status bar: light text on the dark app bar; the web content runs under it
  // (viewport-fit=cover + the safe-area padding the design wave already set).
  const SB = plugin('StatusBar');
  call(SB, 'setStyle', { style: 'DARK' }).catch(() => {});
  if (id === 'android') call(SB, 'setOverlaysWebView', { overlay: true }).catch(() => {});
  // Keyboard: keep the iOS accessory bar (its "Done" is the only way to close a
  // decimal keypad, which has no return key). Resize mode comes from
  // capacitor.config.json (Keyboard.resize = "native"), which the design wave's
  // visual-viewport watcher already handles.
  if (id === 'ios') call(plugin('Keyboard'), 'setAccessoryBarVisible', { isVisible: true }).catch(() => {});
}
// Test-only reset (Node suites re-run initPlatform with different fakes).
export function _resetForTests() { _inited = false; _fallbacks.clear(); _rawOpen = null; }
