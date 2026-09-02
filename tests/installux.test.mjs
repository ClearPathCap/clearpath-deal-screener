// ─── Install UX suite — "Get the App" native-first flow ──────────────────────
// Owner authorization 2026-09-02: where Chromium offers beforeinstallprompt,
// the CTA asks ONE question ("Install DealFit on this device?") and [Install]
// hands off to the browser-native dialog; instructions appear only when the
// native path is unavailable; iOS gets the honest three-tap walkthrough;
// standalone hides the CTA and never prompts. install.js imports nothing, so
// this runs bare: node tests/installux.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };
const tick = () => new Promise(r => setTimeout(r, 0));

// ── minimal DOM / browser shims ──────────────────────────────────────────────
const elements = new Map();
const mkEl = (id) => ({ id, innerHTML: '', textContent: '', style: {},
  classList: { _s: new Set(), add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); }, contains(c){ return this._s.has(c); } } });
const el = (id) => { if (!elements.has(id)) elements.set(id, mkEl(id)); return elements.get(id); };
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.document = { getElementById: el };
let standalone = false;
globalThis.matchMedia = () => ({ matches: standalone });
let ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
// Node's navigator global is getter-only — redefine instead of assigning.
Object.defineProperty(globalThis, 'navigator', {
  value: { get userAgent() { return ua; }, standalone: undefined },
  writable: true, configurable: true,
});
const listeners = {};
globalThis.addEventListener = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
const fire = (n, e) => (listeners[n] || []).forEach(f => f(e));
globalThis.window = globalThis;
const toasts = [];
globalThis.showToast = (m) => toasts.push(m);

// install.js is browser ESM with a .js extension and the repo pins
// "type":"commonjs" — load via data: URL (same trick as finance.test.mjs);
// it has zero imports, so the module is self-contained.
const inst = await import("data:text/javascript," + encodeURIComponent(src("docs/src/js/install.js")));

const openModals = () => ['modal-install', 'modal-install-confirm'].filter(id => el(id).classList.contains('active'));
const mkNative = () => {
  const n = { prevented: false, promptCalls: 0 };
  n.preventDefault = () => { n.prevented = true; };
  n.prompt = () => { n.promptCalls++; };
  n.userChoice = new Promise(res => { n.resolve = res; });
  return n;
};

// ── 1 · native prompt available → ONE question, ZERO instructions ────────────
const native = mkNative();
fire('beforeinstallprompt', native);
ok("capture: beforeinstallprompt is deferred (mini-infobar suppressed)", native.prevented === true);
inst.openInstall();
ok("native path opens the styled confirm", openModals().join() === 'modal-install-confirm');
ok("native path renders NO instructional steps", el('install-steps').innerHTML === '');

// ── 3 · user cancels OUR confirm → native prompt never spent ─────────────────
el('modal-install-confirm').classList.remove('active');   // Cancel = closeModal in markup
ok("cancel spends nothing — no native prompt was shown", native.promptCalls === 0);
inst.openInstall();
ok("after cancel, Get the App still offers the one-question confirm", openModals().join() === 'modal-install-confirm');

// ── 2/4 · accept → native prompt exactly once; no duplicates in flight ───────
inst.triggerInstall();
inst.triggerInstall();  // double-tap while the native dialog is up
ok("native browser prompt fired exactly ONCE (in-flight latch)", native.promptCalls === 1);
native.resolve({ outcome: 'accepted' });
await tick(); await tick();
ok("accept closes the confirm modal", openModals().length === 0);
ok("accept hides the Get the App CTA", el('btn-get-app').style.display === 'none');
inst.triggerInstall();
ok("spent prompt cannot re-fire (single-use law)", native.promptCalls === 1);

// ── 5 · iOS fallback: honest three-tap walkthrough with the real glyph ───────
el('btn-get-app').style.display = '';
ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
inst.openInstall();
const ios = el('install-steps').innerHTML;
ok("iOS falls back to the instruction modal", openModals().join() === 'modal-install');
ok("iOS shows exactly the three real taps", /Share/.test(ios) && /Add to Home Screen/.test(ios) && /Tap <strong>Add<\/strong>/.test(ios));
ok("iOS shows the recognizable share glyph", /ios-share-glyph/.test(ios));
ok("iOS never implies DealFit can install itself", !/automatic|installs itself|one tap/i.test(ios));
el('modal-install').classList.remove('active');

// ── 6/7 · desktop + Android fallbacks intact ─────────────────────────────────
ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120';
inst.openInstall();
ok("desktop fallback names the address-bar install icon", /address bar/.test(el('install-steps').innerHTML));
el('modal-install').classList.remove('active');
ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobi';
inst.openInstall();
ok("Android fallback keeps the menu walkthrough", /Install app/.test(el('install-steps').innerHTML));
el('modal-install').classList.remove('active');

// ── 8 · already installed / standalone: hidden, never prompted ───────────────
standalone = true;
const freshNative = mkNative();
fire('beforeinstallprompt', freshNative);
inst.openInstall();
ok("standalone opens NO modal and shows NO prompt", openModals().length === 0 && freshNative.promptCalls === 0);
ok("standalone hides the CTA", el('btn-get-app').style.display === 'none');
// boot-time visibility via the load handler:
standalone = false;
inst.initInstallHint();
fire('load');
ok("load handler restores the CTA outside standalone", el('btn-get-app').style.display === '');
standalone = true;
fire('load');
ok("load handler hides the CTA inside standalone", el('btn-get-app').style.display === 'none');
standalone = false;

// ── 9 · appinstalled event ───────────────────────────────────────────────────
el('btn-get-app').style.display = '';
fire('appinstalled');
ok("appinstalled hides the CTA and confirms via toast",
   el('btn-get-app').style.display === 'none' && toasts.some(t => /installed/.test(t)));

// ── hint copy names the new CTA ──────────────────────────────────────────────
store.clear(); store.set('primaryMarket', 'x');
standalone = false; ua = 'Mozilla/5.0 (iPhone) Mobi';
fire('load');
await new Promise(r => setTimeout(r, 1900));
ok("install hint names 'Get the App'", toasts.some(t => /"Get the App"/.test(t)));

// ── source/markup law pins ───────────────────────────────────────────────────
const html = src("docs/index.html");
const js   = src("docs/src/js/install.js");
const css  = src("docs/src/css/styles.css");
ok("CTA is the labeled 'Get the App' button", /id="btn-get-app"[^>]*onclick="openInstall\(\)"/.test(html) && />\s*Get the App\s*<\/button>/.test(html.slice(html.indexOf('btn-get-app'))));
ok("confirm modal asks the governed question with Cancel/Install",
   /Install DealFit on this device\?/.test(html) &&
   /closeModal\('modal-install-confirm'\)">Cancel</.test(html) &&
   /onclick="triggerInstall\(\)">Install</.test(html));
ok("instruction modal survives as the fallback (regression)",
   /id="modal-install"/.test(html) && /id="install-steps"/.test(html) && />Got it</.test(html));
ok("the old hidden Install-Now button is gone from the instruction modal", !/btn-install-prompt/.test(html));
ok("install.js delegates modals to the lock-aware window helpers (Track A2)",
   /window\.openModal\s*\|\|/.test(js) && /window\.closeModal\s*\|\|/.test(js));
ok("CTA styles exist (accent chip + focus ring)",
   /\.get-app-btn\{[^}]*height:34px/.test(css) && /\.get-app-btn:focus-visible\{outline:2px solid var\(--accent\)/.test(css));
ok("wave-a1 stub surface unchanged — same three exports",
   /export function openInstall/.test(js) && /export function triggerInstall/.test(js) && /export function initInstallHint/.test(js) &&
   /import \{ openInstall, triggerInstall, initInstallHint \}/.test(src("docs/src/js/main.js")));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`installux: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('Get-the-App install law holds ✓');
