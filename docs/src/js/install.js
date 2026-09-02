// ─── PWA install logic ────────────────────────────────────────────────────────
// INSTALL UX (owner authorization 2026-09-02): installing should take as little
// thought as the browser allows. Where Chromium offers the native install
// prompt (beforeinstallprompt — LIVE-VERIFIED firing on desktop Chrome against
// the production manifest, no service worker required), "Get the App" opens a
// one-question styled confirm and [Install] hands off to the browser's native
// dialog, which performs the actual home-screen/desktop install itself. No
// instructional steps on that path. Everywhere else (iOS above all — Apple
// provides NO install API to any website) the guided instructions remain, cut
// to the three real taps. Already-installed/standalone hides the CTA entirely.

let deferredInstallPrompt = null;
let nativePromptInFlight  = false;

// Track A2 law: modals route through the central lock-aware helpers published
// by main.js; the bare-class fallback keeps Node test harnesses working.
const openModal  = id => (window.openModal  || (i => document.getElementById(i).classList.add('active')))(id);
const closeModal = id => (window.closeModal || (i => document.getElementById(i).classList.remove('active')))(id);

const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  window.navigator.standalone === true;

// "Get the App" is pointless inside the installed app — hide it there, and
// after a successful install. Safe no-op when the button isn't in the DOM.
function updateGetAppVisibility() {
  const btn = document.getElementById('btn-get-app');
  if (btn) btn.style.display = isStandalone() ? 'none' : '';
}

window.addEventListener('beforeinstallprompt', e => {
  // Chrome fires this when the app qualifies; deferring it is what lets our
  // own confirm own the moment instead of the mini-infobar.
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('btn-get-app');
  if (btn) btn.style.display = 'none';
  window.showToast && window.showToast('DealFit installed — find it on your home screen');
});

// The recognizable iOS share glyph (square with the up arrow), drawn inline so
// the instruction reads like the button the user is about to tap.
const IOS_SHARE_SVG =
  '<svg class="ios-share-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<path d="M6 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1"/>' +
  '<polyline points="8 5 12 1.5 16 5"/><line x1="12" y1="1.5" x2="12" y2="14"/></svg>';

export function openInstall() {
  // Already running installed: the CTA should not exist, and we never prompt.
  if (isStandalone()) { updateGetAppVisibility(); return; }

  // Native path: the browser can do the entire install itself — one question,
  // zero instructions (owner law).
  if (deferredInstallPrompt) {
    openModal('modal-install-confirm');
    return;
  }

  // Fallback path: guided instructions, per platform.
  const ua        = navigator.userAgent;
  const isIOS     = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  let html;
  if (isIOS) {
    // Apple platform limitation, accepted: a page cannot install itself on
    // iPhone/iPad. Three real taps, shown with the real glyph — and no
    // wording that implies DealFit can do it automatically.
    html = '<strong>Three taps in Safari:</strong><ol>' +
      '<li>Tap the <strong>Share</strong> button ' + IOS_SHARE_SVG + ' at the bottom</li>' +
      '<li>Tap <strong>Add to Home Screen</strong></li>' +
      '<li>Tap <strong>Add</strong></li></ol>' +
      'DealFit then launches full-screen from your home screen like any app.';
  } else if (isAndroid) {
    html = '<strong>On Android:</strong><ol><li>Tap the <strong>three-dot menu</strong> in Chrome (top right)</li><li>Tap <strong>"Install app"</strong> or <strong>"Add to home screen"</strong></li><li>Confirm</li></ol>';
  } else {
    html = '<strong>On desktop:</strong><ol><li>Look for the <strong>install icon</strong> in your browser address bar</li><li>Click it and confirm to install</li></ol>You can also pin this URL as a tab or bookmark for quick access.';
  }
  document.getElementById('install-steps').innerHTML = html;
  openModal('modal-install');
}

// [Install] in the styled confirm → the browser-native PWA prompt. The native
// event object is single-use: once prompt() runs, Chrome will not accept it
// again (a fresh beforeinstallprompt arrives on a later visit if the user
// dismissed). Cancel in OUR confirm never spends it — "Get the App" keeps
// working immediately. The in-flight latch prevents duplicate native prompts.
export function triggerInstall() {
  if (!deferredInstallPrompt || nativePromptInFlight) return;
  nativePromptInFlight = true;
  const native = deferredInstallPrompt;
  native.prompt();
  native.userChoice.then(choice => {
    nativePromptInFlight  = false;
    deferredInstallPrompt = null;                  // spent either way
    closeModal('modal-install-confirm');
    if (choice && choice.outcome === 'accepted') {
      const btn = document.getElementById('btn-get-app');
      if (btn) btn.style.display = 'none';
    }
  }).catch(() => { nativePromptInFlight = false; });
}

export function initInstallHint() {
  window.addEventListener('load', () => {
    updateGetAppVisibility();
    const seen         = localStorage.getItem('install_hint_seen');
    // Don't fire over the forced first-launch market picker — it would float a
    // toast pointing at the install CTA while that CTA is behind the modal.
    const onboarding   = !localStorage.getItem('primaryMarket');
    if (!seen && !onboarding && !isStandalone() && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      setTimeout(() => {
        window.showToast && window.showToast('Tap "Get the App" above the tabs to install DealFit');
        localStorage.setItem('install_hint_seen', '1');
      }, 1800);
    }
  });
}
