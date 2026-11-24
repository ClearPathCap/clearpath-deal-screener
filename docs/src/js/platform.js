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
//                        owner chooses a store-compliant payment path (see
//                        NATIVE_PAYMENTS_AND_SUBSCRIPTIONS.md) — no checkout code;
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
// NO-BUILD SHELL. DealFit has no bundler, so @capacitor/core (which defines
// Capacitor.registerPlugin) is not loaded. The native bridge still provides
// nativePromise / nativeCallback / PluginHeaders, which is all core's own
// registerPlugin uses; plugin() below builds the same minimal proxy from them and
// publishes it on Capacitor.Plugins (only where nothing is there yet), so the
// design wave's haptic() (viewstack.js) works unchanged inside the shell.
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

// ── Plugins (no-build) ──────────────────────────────────────────────────────
// Returns a plugin proxy, or null on the web or when the shell does not carry it.
const _proxies = new Map();
export function plugin(name) {
  if (!isNative()) return null;
  const c = CAP();
  if (c.Plugins && c.Plugins[name] && !_proxies.has(name)) return c.Plugins[name];   // @capacitor/core present, or a shell-registered proxy
  if (_proxies.has(name)) return _proxies.get(name);
  const header = Array.isArray(c.PluginHeaders) ? c.PluginHeaders.find(h => h && h.name === name) : null;
  if (!header || typeof c.nativePromise !== 'function') return null;
  const methods = new Map((header.methods || []).map(m => [m.name, m.rtype]));
  const call = (m) => (opts) => (methods.get(m) === 'promise'
    ? c.nativePromise(name, m, opts || {})
    : Promise.reject(new Error(name + '.' + m + ' is not available')));
  const proxy = {
    // Same contract as core's addListenerNative: resolves to { remove() }.
    addListener(eventName, cb) {
      if (typeof c.nativeCallback !== 'function') return Promise.reject(new Error('no native callbacks'));
      const id = c.nativeCallback(name, 'addListener', { eventName }, cb);
      return Promise.resolve({ remove: () => c.nativePromise(name, 'removeListener', { eventName, callbackId: id }) });
    },
  };
  for (const m of methods.keys()) if (m !== 'addListener' && m !== 'removeListener') proxy[m] = call(m);
  _proxies.set(name, proxy);
  try { if (c.Plugins && !c.Plugins[name]) c.Plugins[name] = proxy; } catch {}
  return proxy;
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
    const S = plugin('Share');
    if (!S || !S.share) return Promise.reject(new Error('share unavailable'));
    const p = payload || {};
    return S.share({ title: p.title, text: p.text, url: p.url, dialogTitle: p.title });
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
  if (target.kind === 'web' && B && B.open) {
    B.open({ url: target.url, presentationStyle: 'popover' }).catch(() => {});
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

// ── Install prompt ──────────────────────────────────────────────────────────
// Inside the app the PWA install ("Get the App") is meaningless: treat it as
// already installed (install.js hides the button, never prompts or toasts).
export function isInstalledApp() { return isNative(); }

// ── Haptics ─────────────────────────────────────────────────────────────────
// Light confirmation ticks only — never on a financial result (design law).
export function hapticTick() {
  const Hp = plugin('Haptics');
  try { if (Hp && Hp.selectionChanged) Hp.selectionChanged().catch(() => {}); } catch {}
}

// ── Deep links (Universal Links / App Links) ────────────────────────────────
// Pure mapping from an opened https link to a page INSIDE the bundle, or null.
// Only the app's own host is accepted, and only parameters the web page itself
// already handles on load are carried, so an opened link behaves exactly like
// the same visit in a browser. ?install= and ?checkout= are dropped in the app
// (no install prompt; no payment page in the app).
export const LINK_HOSTS = ['dealfit.clearpathcapfunding.com'];
const SHARE_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;
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
// hooks: { canStepBack(): boolean } from the view stack; authParams: the sign-in
// link parameter names (signinCode.js AUTH_LINK_PARAMS) for deepLinkTarget.
let _inited = false;
export function initPlatform(hooks) {
  if (_inited || !isNative()) return false;
  _inited = true;
  const w = W(), doc = w.document, id = platformId();
  const h = hooks || {};
  try { doc.documentElement.setAttribute('data-platform', id); } catch {}
  // Publish a proxy for every plugin the shell carries, so code that reads
  // Capacitor.Plugins directly (the design wave's haptic()) finds them.
  try { (CAP().PluginHeaders || []).forEach(hd => hd && hd.name && plugin(hd.name)); } catch {}

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
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href');
    const t = externalTarget(href);
    if (!t || (a.target !== '_blank' && t.kind !== 'system')) return;
    e.preventDefault();
    openExternal(href);
  });

  // Android hardware Back → the view stack (the top sheet closes first, then the
  // previous tab). At the root it backgrounds the app (Android's own behaviour
  // for a root activity), never a dead press and never a history entry from a
  // previous page load.
  const App = plugin('App');
  if (App && App.addListener) {
    App.addListener('backButton', () => {
      if (h.canStepBack && h.canStepBack()) { try { w.history.back(); } catch {} return; }
      if (App.minimizeApp) App.minimizeApp().catch(() => {});
    }).catch(() => {});
    // Deep links: a warm open replaces the page with the mapped local page; a cold
    // open is read once per launch URL (never a reload loop).
    const go = (href) => {
      const t = deepLinkTarget(href, h.authParams);
      if (t) { try { w.location.replace(new URL(t, w.location.href).href); } catch {} }
    };
    App.addListener('appUrlOpen', (ev) => go(ev && ev.url)).catch(() => {});
    if (App.getLaunchUrl) {
      App.getLaunchUrl().then((r) => {
        const url = r && r.url;
        if (!url) return;
        let seen = null;
        try { seen = w.sessionStorage.getItem('df.launchUrl'); w.sessionStorage.setItem('df.launchUrl', url); } catch {}
        if (seen !== url) go(url);
      }).catch(() => {});
    }
  }

  // Status bar: light text on the dark app bar; the web content runs under it
  // (viewport-fit=cover + the safe-area padding the design wave already set).
  const SB = plugin('StatusBar');
  if (SB) {
    try { SB.setStyle && SB.setStyle({ style: 'DARK' }).catch(() => {}); } catch {}
    if (id === 'android') { try { SB.setOverlaysWebView && SB.setOverlaysWebView({ overlay: true }).catch(() => {}); } catch {} }
  }
  // Keyboard: keep the iOS accessory bar (its "Done" is the only way to close a
  // decimal keypad, which has no return key). Resize mode comes from
  // capacitor.config.json (Keyboard.resize = "native"), which the design wave's
  // visual-viewport watcher already handles.
  const KB = plugin('Keyboard');
  if (KB && id === 'ios') { try { KB.setAccessoryBarVisible && KB.setAccessoryBarVisible({ isVisible: true }).catch(() => {}); } catch {} }
  return true;
}
// Test-only reset (Node suites re-run initPlatform with different fakes).
export function _resetForTests() { _inited = false; _proxies.clear(); _rawOpen = null; }
