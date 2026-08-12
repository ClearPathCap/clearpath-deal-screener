// ─── PWA install logic ────────────────────────────────────────────────────────

let deferredInstallPrompt = null;

// Local modal helpers
const openModal  = id => document.getElementById(id).classList.add('active');
const closeModal = id => document.getElementById(id).classList.remove('active');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

export function openInstall() {
  const ua           = navigator.userAgent;
  const isIOS        = /iPad|iPhone|iPod/.test(ua);
  const isAndroid    = /Android/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const installBtn   = document.getElementById('btn-install-prompt');
  installBtn.style.display = 'none';

  let html;
  if (isStandalone) {
    html = "<strong>You're already running the installed app.</strong><br>Look on your home screen for the DealFit icon.";
  } else if (isIOS) {
    html = '<strong>On iPhone / iPad:</strong><ol><li>Tap the <strong>Share</strong> icon at the bottom of Safari (square with arrow)</li><li>Scroll down and tap <strong>"Add to Home Screen"</strong></li><li>Tap <strong>Add</strong> in the top right</li></ol>The app will launch full-screen from your home screen.';
  } else if (isAndroid) {
    html = '<strong>On Android:</strong><ol><li>Tap the <strong>three-dot menu</strong> in Chrome (top right)</li><li>Tap <strong>"Install app"</strong> or <strong>"Add to home screen"</strong></li><li>Confirm</li></ol>';
    if (deferredInstallPrompt) installBtn.style.display = 'block';
  } else {
    html = '<strong>On desktop:</strong><ol><li>Look for the <strong>install icon</strong> in your browser address bar (usually a small monitor or download icon)</li><li>Click it and confirm to install</li></ol>You can also pin this URL as a tab or bookmark for quick access.';
  }
  document.getElementById('install-steps').innerHTML = html;
  openModal('modal-install');
}

export function triggerInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      closeModal('modal-install');
    });
  }
}

export function initInstallHint() {
  window.addEventListener('load', () => {
    const seen         = localStorage.getItem('install_hint_seen');
    // Don't fire over the forced first-launch market picker — it would float a
    // toast pointing at the install icon while that icon is behind the modal.
    const onboarding   = !localStorage.getItem('primaryMarket');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!seen && !onboarding && !isStandalone && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      setTimeout(() => {
        window.showToast && window.showToast('Tap ↓ above the tabs to install as app');
        localStorage.setItem('install_hint_seen', '1');
      }, 1800);
    }
  });
}
