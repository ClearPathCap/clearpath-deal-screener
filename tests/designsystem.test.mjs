// Design-system and native-interaction wave (2026-11-24) — regression suite.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/designsystem.test.mjs
//
// Pins the new structure so later work cannot quietly undo it:
//   §A tokens + the documented system (DESIGN_SYSTEM.md);
//   §B the five banked UX items (compact app bar + bottom tab bar, the task
//      first, upsell timing, example placeholders, sentence-case labels);
//   §C the shared empty / loading / error component and the 375px Pipeline
//      overflow fix;
//   §D the History-API view stack, EXECUTED against a scripted history (pages,
//      sheets, Back, Escape, required sheets, close-then-open in one tick) and
//      the keyboard helpers;
//   §E what this wave must NOT touch (engines, sign-in, tier law).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');
let pass = 0, fail = 0; const fails = [];
const ok = (v, label) => { if (v) pass++; else { fail++; fails.push(label); } };

const css = src('docs/src/css/styles.css');
const html = src('docs/index.html');
const mainJs = src('docs/src/js/main.js');
const pipeJs = src('docs/src/js/pipeline.js');
const rule = (sel) => (css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}')) || [''])[0];

// ─── §A tokens and documentation ─────────────────────────────────────────────
console.log('— §A tokens —');
for (const t of ['--fs-eyebrow', '--fs-caption', '--fs-footnote', '--fs-label', '--fs-body', '--fs-callout', '--fs-title3', '--fs-title2', '--fs-title1'])
  ok(new RegExp(t + ':\\d+px').test(css), `A1 type-scale token ${t} defined in px`);
for (const t of ['--sp-1:4px', '--sp-2:8px', '--sp-3:12px', '--sp-4:16px', '--sp-5:20px', '--sp-6:24px', '--sp-8:32px'])
  ok(css.includes(t), `A2 4px spacing grid token ${t}`);
for (const t of ['--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-pill', '--tap:44px', '--control-h:44px', '--control-h-lg:52px', '--appbar-h', '--tabbar-h'])
  ok(css.includes(t), `A3 shape / touch / chrome token ${t}`);
for (const t of ['--dur-instant', '--dur-fast', '--dur-base', '--dur-sheet', '--ease-standard', '--ease-sheet'])
  ok(css.includes(t + ':'), `A4 motion token ${t}`);
const reduced = (css.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/) || [''])[0];
ok(/--dur-base:1ms/.test(reduced) && /animation-duration:1ms!important/.test(reduced), 'A5 reduced motion collapses every duration and animation');
ok(/--font:'Syne',sans-serif;--mono:'DM Mono',monospace;/.test(css) && /--accent:#22c55e/.test(css), 'A6 palette and font families unchanged (brand law)');
const doc = existsSync(join(root, 'DESIGN_SYSTEM.md')) ? src('DESIGN_SYSTEM.md') : '';
for (const h of ['Type scale', 'Spacing', 'Buttons', 'Inputs', 'Cards', 'Sheets', 'Chips', 'States', 'Motion', 'Navigation'])
  ok(new RegExp('^#+ .*' + h, 'mi').test(doc), `A7 DESIGN_SYSTEM.md documents ${h}`);
ok(/\(est\.\)/.test(doc) && /broker/i.test(doc), 'A8 the design doc carries the compliance rules ("(est.)", broker not lender)');

// ─── §B the five banked UX items ─────────────────────────────────────────────
console.log('— §B banked UX items —');
// B1 · compact header + bottom tab bar
const body = html.slice(html.indexOf('<body>'));
ok(!/<div class="nav">/.test(html) && /<header class="appbar">/.test(html), 'B1 one app bar replaces the top tab strip');
ok(!/header-brand/.test(html) && (html.match(/class="cpc-logo"/g) || []).length === 1, 'B1 the brand appears once (app bar), not on every page');
const appbar = body.slice(body.indexOf('<header class="appbar">'), body.indexOf('</header>'));
ok(/id="auth-chip"/.test(appbar) && /openShareApp\(\)/.test(appbar) && /id="btn-get-app"/.test(appbar), 'B1 auth chip, share and install live in the app bar');
const tabbar = body.slice(body.indexOf('<nav class="tabbar"'), body.indexOf('</nav>'));
ok((tabbar.match(/class="nav-btn/g) || []).length === 4 && /aria-label="Primary"/.test(tabbar), 'B1 the bottom tab bar holds the four primary tabs');
ok((tabbar.match(/<svg class="tab-icon"[^>]*aria-hidden="true"/g) || []).length === 4 && (tabbar.match(/class="tab-label"/g) || []).length === 4, 'B1 each tab has a decorative icon and a visible text label');
ok(/aria-current="page"/.test(tabbar) && /setAttribute\('aria-current', 'page'\)/.test(mainJs), 'B1 the current tab is announced (aria-current)');
ok(/body\.kb-open \.tabbar\{transform:translate\(-50%,100%\)/.test(css), 'B1 the tab bar steps aside while the keyboard is up');
// B2 · the first screen is the task
const flipPage = html.slice(html.indexOf('id="page-flip"'), html.indexOf('id="page-rental"'));
ok(flipPage.indexOf('id="guc-entry"') > flipPage.indexOf('id="flip-results"') && flipPage.indexOf('id="f-ask"') < flipPage.indexOf('id="guc-entry"'), 'B2 the ground-up note follows the analyzer — the first input comes first');
ok(/purpose=ground_up#submit/.test(flipPage.slice(flipPage.indexOf('id="guc-entry"'))) && /does not size ground-up construction/.test(flipPage), 'B2 the moved note keeps its broker handoff and copy');
// B3 · upsell timing
const slotsFn = mainJs.slice(mainJs.indexOf('function renderMarketSlots'), mainJs.indexOf('function renderAllSlots'));
const stripLineComments = (s) => s.replace(/\/\/[^\n]*/g, '');
const slotsCode = stripLineComments(slotsFn);
ok(!/slot-locked/.test(slotsCode) && !/🔒 Region/.test(slotsCode), 'B3 no locked Region tiles are drawn');
ok(/class="slot-more" onclick="handleLockedSlot\(\$\{unlocked \+ 1\}\)"\$\{hasAnalyzedOnce\(\) \|\| heldBeyond \? '' : ' hidden'\}/.test(slotsFn), 'B3 one quiet "More regions" line, hidden until a first analysis, opening the same region upgrade path');
for (const [t, g] of [['flip', 'getLastFlipResult'], ['rental', 'getLastRentalResult'], ['ltr', 'getLastLtrResult'], ['brrr', 'getLastBrrrResult']])
  ok(new RegExp(`syncStaleWatch\\('${t}', ${g}\\(\\)\\);\\s*markAnalyzedOnce\\(${g}\\(\\)\\);`).test(mainJs), `B3 a ${t} analysis marks the first analysis`);
ok(/function markAnalyzedOnce\(result\) \{\s*if \(!result \|\| hasAnalyzedOnce\(\)\) return;/.test(mainJs), 'B3 only a produced result counts as a first analysis');
ok(!/funding|loan|rate|terms/i.test((slotsFn.match(/More regions with[^`]*/) || [''])[0]), 'B3 the line sells an app feature only (tier law)');
// B4 · example placeholders
const exampleless = [];
for (const tag of html.match(/<input\b[^>]*>/g) || []) {
  if (/\bvalue="/.test(tag)) continue;
  const p = (tag.match(/placeholder="([^"]*)"/) || [])[1];
  if (p && /^[0-9$]/.test(p)) exampleless.push(p);
}
ok(exampleless.length === 0, 'B4 every pure-example numeric placeholder says "e.g." (' + exampleless.join(', ') + ')');
ok(/placeholder="e\.g\. 185,000"/.test(html) && /placeholder="e\.g\. 340,000"/.test(html) && /placeholder="e\.g\. 60,000"/.test(html), 'B4 the three flip examples from the UX review are marked');
ok(/\.page input::placeholder,\.page textarea::placeholder\{font-family:var\(--font\);font-weight:var\(--fw-regular\)/.test(css), 'B4 analyzer placeholders render in the UI face, values stay DM Mono');
ok(/input::placeholder,textarea::placeholder\{color:var\(--placeholder\)!important/.test(css) && /--placeholder:#8a8a8a/.test(css), 'B4 placeholder tone is one token (5.3:1 on --surface)');
// B5 · sentence-case labels
const notSentence = [];
for (const m of html.matchAll(/<label(?![^>]*class="toggle)[^>]*>([^<]+)/g)) {
  const words = m[1].trim().split(/\s+/).slice(1);
  if (words.some(w => /^[A-Z][a-z]/.test(w) && !/^(CapEx|Airbnb)/.test(w))) notSentence.push(m[1].trim());
}
ok(notSentence.length === 0, 'B5 every field label is sentence case (' + notSentence.join(' | ') + ')');
ok(!/text-transform/.test(rule('.field label')), 'B5 field labels carry no text transform');
ok(/text-transform:uppercase/.test(rule('.slabel')), 'B5 uppercase is kept for section eyebrows');
ok(/<label>Asking price<\/label>/.test(pipeJs) && !/<label>Asking Price/.test(pipeJs), 'B5 the pipeline edit form follows the same rule');

// ─── §C states and the 375px overflow ────────────────────────────────────────
console.log('— §C states —');
const renderFn = pipeJs.slice(pipeJs.indexOf('export function renderPipeline'), pipeJs.indexOf('export function renderPipeline') + 2400);
const renderCode = stripLineComments(renderFn);
ok(!/btn-redeem/.test(renderCode) && !/empty-state/.test(renderCode), 'C1 the pipeline states use the shared component (no nowrap .btn-redeem — the 4px overflow at 375px)');
ok(/skeletonHtml\(\{ cards: 3, label: 'Loading your saved deals…' \}\)/.test(renderFn), 'C2 loading is a skeleton with the same announced text');
ok(/kind: 'error'/.test(renderFn) && /retryConnection\(\)/.test(renderFn) && /Nothing was changed; your deals stay with your account/.test(renderFn), 'C3 the failed load keeps its truthful copy and Retry');
const btnRule = rule('.btn');
ok(/white-space:normal/.test(btnRule) && /max-width:100%/.test(btnRule) && /min-height:var\(--control-h\)/.test(btnRule), 'C4 a system button wraps inside its column and keeps a 44px target');
const { stateHtml, skeletonHtml } = await import('../docs/src/js/states.js');
const e = stateHtml({ kind: 'error', icon: '📡', title: 'T', body: 'B', action: { label: 'Retry', kind: 'secondary', onclick: 'retryConnection()' } });
ok(/role="status"/.test(e) && /class="btn btn--secondary state-action" onclick="retryConnection\(\)">Retry</.test(e) && /aria-hidden="true">📡/.test(e), 'C5 stateHtml: an error is announced, its icon is decorative, one action');
const em = stateHtml({ kind: 'empty', title: 'No deals saved yet' });
ok(!/role=/.test(em) && !/<button/.test(em), 'C6 an empty state is quiet and actionless unless given one');
const sk = skeletonHtml({ cards: 2, label: 'Loading x' });
ok((sk.match(/skeleton-card/g) || []).length === 2 && /<span class="sr-only">Loading x<\/span>/.test(sk) && /role="status"/.test(sk), 'C7 the skeleton is announced once, cards hidden from assistive tech');

// ─── §D view stack, executed ─────────────────────────────────────────────────
// The scripted history behaves like a browser's: back()/go() are ASYNCHRONOUS —
// the index and history.state change only when the traversal is applied, in a
// later task, right before popstate fires. (Review finding 7: a synchronous
// mock hid the pending-traversal bugs.) Traversals queue in order.
console.log('— §D view stack —');
const listeners = { window: {}, document: {} };
const entries = [{ state: null }]; let idx = 0;
const clone = (s) => (s == null ? s : JSON.parse(JSON.stringify(s)));
const fire = (target, type, ev) => (listeners[target][type] || []).forEach(f => f(ev));
let traversals = 0, pops = 0, popDelay = 0, failPush = false, swallowGo = false;
globalThis.history = {
  scrollRestoration: 'auto',
  get state() { return entries[idx].state; },
  get length() { return entries.length; },
  pushState(s) { if (failPush) throw new Error('SecurityError: too many calls'); entries.splice(idx + 1); entries.push({ state: clone(s) }); idx++; },
  replaceState(s) { entries[idx] = { state: clone(s) }; },
  go(d) {
    traversals++;
    if (swallowGo) return;
    setTimeout(() => {
      const to = Math.max(0, Math.min(entries.length - 1, idx + d));
      if (to === idx) return;
      idx = to; pops++;
      fire('window', 'popstate', { state: clone(entries[idx].state) });
    }, popDelay);
  },
  back() { this.go(-1); },
  forward() { this.go(1); },
};
let sY = 0;
const bodyClasses = new Set();
globalThis.window = {
  get scrollY() { return sY; }, scrollTo(x, y) { sY = y; },
  addEventListener(t, f) { (listeners.window[t] ||= []).push(f); },
  matchMedia: () => ({ matches: false }),
};
globalThis.document = {
  addEventListener(t, f) { (listeners.document[t] ||= []).push(f); },
  querySelectorAll: () => [],
  body: { classList: { add: c => bodyClasses.add(c), remove: c => bodyClasses.delete(c) } },
};
const vs = await import('../docs/src/js/viewstack.js');
// A tiny app with main.js's contract: showPage records (with the leaving page's
// scroll), openModal/closeModal record, closing is the same call from any path.
const app = { page: 'flip', open: [], required: new Set() };
const showPage = (id) => { const prev = app.page, prevY = sY; app.page = id; if (prev !== id) vs.recordPage(id, prevY); sY = 0; };
const openModal = (id) => { if (!app.open.includes(id)) { app.open.push(id); vs.recordSheetOpen(id); } };
const closeModal = (id) => { const i = app.open.indexOf(id); if (i > -1) { app.open.splice(i, 1); vs.recordSheetClose(id); } };
vs.initViewStack({ showPage, closeModal, currentPage: () => app.page, isRequired: (id) => app.required.has(id) });
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, popDelay + 2)); };
const pressBack = async () => { history.back(); await settle(); };
const pressForward = async () => { history.forward(); await settle(); };
const key = (k, extra = {}) => { const ev = { key: k, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; fire('document', 'keydown', ev); return ev; };
const top = () => history.state || {};
const sheets = () => entries.slice(0, idx + 1).map(e => e.state && e.state.sheet).filter(Boolean);

ok(top().df === 1 && top().page === 'flip' && history.scrollRestoration === 'manual', 'D1 init seeds the root entry (URL untouched) and takes over scroll restoration');
sY = 640; showPage('pipeline');
ok(history.length === 2 && top().page === 'pipeline' && entries[0].state.y === 640, 'D2 a tab switch is one entry; the leaving page keeps its scroll position');
await pressBack();
ok(app.page === 'flip' && sY === 640, 'D3 Back returns to the previous tab at the scroll position it was left at');
showPage('guide');
ok(history.length === 2 && top().page === 'guide', 'D4 a new switch after Back replaces the forward entry (no history growth)');
openModal('modal-share-app');
ok(top().sheet === 'modal-share-app' && history.length === 3, 'D5 presenting a sheet adds one entry');
await pressBack();
ok(app.open.length === 0 && app.page === 'guide' && !top().sheet, 'D6 Back closes the top sheet first and stays on the tab');
openModal('modal-share-app'); closeModal('modal-share-app'); await settle();
ok(app.open.length === 0 && !top().sheet && top().page === 'guide' && idx === 1, 'D7 a UI close consumes the sheet entry (Back will not reopen or skip)');
let t0 = traversals;
openModal('modal-delete'); await settle();
closeModal('modal-delete'); openModal('modal-share-deal');
await settle();
ok(app.open.join() === 'modal-share-deal' && top().sheet === 'modal-share-deal' && traversals === t0 + 1 && sheets().join() === 'modal-share-deal', 'D8 close-then-open in one task: the new entry lands after the consumed one, nothing stale beneath');
await pressBack();
ok(app.open.length === 0 && !top().sheet, 'D9 … and Back then closes the new sheet');
// Review finding 2: two closes in one task → ONE go(-2), not one lost back().
openModal('modal-a'); await settle(); openModal('modal-b'); await settle();
t0 = traversals;
closeModal('modal-b'); closeModal('modal-a'); await settle();
ok(app.open.length === 0 && !top().sheet && sheets().length === 0 && traversals === t0 + 1, 'D10 two closes in one task coalesce into one traversal and leave no stale sheet entry');
// A lower sheet closed under another: its entry is skipped by the next Back.
openModal('modal-a'); await settle(); openModal('modal-b'); await settle();
closeModal('modal-a'); await settle();
ok(app.open.join() === 'modal-b' && top().sheet === 'modal-b', 'D11 closing a sheet under another leaves the top sheet and its entry');
await pressBack();
ok(app.open.length === 0 && !top().sheet && app.page === 'guide', 'D12 one Back closes the top sheet AND skips the dead entry below — no dead Back press');
// Review finding 4: Forward into a closed sheet is a no-op, not a phantom.
openModal('modal-share-app'); await settle();
await pressBack();
await pressForward();
ok(app.open.length === 0 && !top().sheet, 'D13 Forward into a closed sheet returns to where the visitor was (no phantom entry)');
// Escape.
openModal('modal-a'); await settle(); openModal('modal-b'); await settle();
let ev = key('Escape');
ok(app.open.join() === 'modal-a' && ev.defaultPrevented, 'D14 Escape closes only the top sheet');
ev = key('Escape', { isComposing: true });
ok(app.open.join() === 'modal-a' && !ev.defaultPrevented, 'D15 Escape that ends an IME composition does not close the sheet');
key('Escape'); await settle();
ok(app.open.length === 0 && !top().sheet, 'D16 Escape again closes the next one; entries are consumed');
// Required sheets.
app.required.add('modal-market-picker'); openModal('modal-market-picker'); await settle();
ev = key('Escape');
ok(app.open.includes('modal-market-picker') && !ev.defaultPrevented, 'D17 Escape never dismisses a required sheet');
await pressBack();
ok(app.open.includes('modal-market-picker') && top().sheet === 'modal-market-picker', 'D18 Back never dismisses a required sheet — its entry is put back');
app.required.delete('modal-market-picker'); closeModal('modal-market-picker'); await settle();
ok(!top().sheet && app.open.length === 0, 'D19 closing it through its own control consumes the entry normally');
// Review finding 3: a slow traversal (past the safety timer) is still ours.
popDelay = 3300;
openModal('modal-market-confirm');
await new Promise(r => setTimeout(r, 20));
closeModal('modal-market-confirm'); openModal('modal-market-picker');
await new Promise(r => setTimeout(r, 3600));
popDelay = 0; await settle();
ok(app.open.join() === 'modal-market-picker', 'D20 a traversal that lands after the safety timer is not mistaken for the user\'s Back (the new sheet stays open)');
closeModal('modal-market-picker'); await settle();

// Round-2 review N1: two closes in separate tasks while our traversal is in flight.
popDelay = 40;
openModal('modal-a'); await settle(); openModal('modal-b'); await settle();
closeModal('modal-b');
await new Promise(r => setTimeout(r, 5));
closeModal('modal-a'); openModal('modal-c');
await settle();
popDelay = 0;
ok(app.open.join() === 'modal-c' && top().sheet === 'modal-c' && sheets().join() === 'modal-c', 'D21a two in-flight traversals are both recognised as ours (each by the entry it lands on): the sheet opened after them stays');
closeModal('modal-c'); await settle();
// Round-2 review N3: queued lower and top sheets closed in one task leave nothing behind.
openModal('modal-f'); await settle();
closeModal('modal-f'); openModal('modal-g'); openModal('modal-h'); closeModal('modal-g'); closeModal('modal-h');
await settle();
ok(app.open.length === 0 && !top().sheet && sheets().length === 0, 'D21b queued sheets closed in the same task never reach history and leave no dead current entry');
// Round-2 review N4: Forward is not blocked by a dead entry.
showPage('rental'); await settle();
openModal('modal-s'); await settle();
showPage('pipeline'); await settle();
closeModal('modal-s'); await settle();
await pressBack();
ok(app.page === 'rental' && app.open.length === 0, 'D21c Back from a tab skips the dead sheet entry beneath it');
await pressForward();
ok(app.page === 'pipeline', `D21d Forward skips the dead entry UPWARD and reaches the next tab (now ${app.page})`);
// Round-2 review N2: a refused pushState is not kept in the model …
failPush = true; openModal('modal-x'); failPush = false;
closeModal('modal-x'); await settle();
openModal('modal-y'); await settle();
ok(top().sheet === 'modal-y', 'D21e a pushState the browser refuses is dropped from the model (later entries still land)');
await pressBack();
ok(app.open.length === 0 && !top().sheet, 'D21f … and Back still closes the next sheet');
// … and a traversal that never lands does not stall the view stack.
openModal('modal-z'); await settle();
swallowGo = true; closeModal('modal-z'); openModal('modal-w');
await new Promise(r => setTimeout(r, 3200));
swallowGo = false;
ok(top().sheet === 'modal-w' && app.open.join() === 'modal-w', 'D21g after the safety timeout the queued entry is flushed');
openModal('modal-v');
ok(top().sheet === 'modal-v' && app.open.join() === 'modal-w,modal-v', 'D21g2 an entry opened AFTER the safety timeout reaches history at once (round-2 N2: no stall until reload)');
closeModal('modal-v'); await settle();
await pressBack(); await pressBack();
ok(app.open.length === 0, 'D21h at most one Back press is absorbed by the late allowance; the sheet then closes');
// Round-3 review R3-2: the first of two in-flight traversals never reports; the
// second's landing retires both expectations, so the user's next Back is honoured.
await settle(); await new Promise(r => setTimeout(r, 3100));
openModal('modal-p'); await settle(); openModal('modal-q'); await settle();
let dropFirst = true; const go0 = history.go;
history.go = function (d) { if (dropFirst) { dropFirst = false; traversals++; idx += d; return; } return go0.call(this, d); };
closeModal('modal-q');
await new Promise(r => setTimeout(r, 5));
closeModal('modal-p');
await settle();
history.go = go0;
openModal('modal-r'); await settle();
ok(top().sheet === 'modal-r', 'D21h1 after a dropped traversal, the next sheet reaches history at once (no stale expectation keeps it queued)');
await pressBack();
ok(app.open.length === 0 && !top().sheet, 'D21h2 a traversal whose popstate never came is retired by the next landing; the user’s Back then closes the sheet');
// Reload support: pagehide keeps the current entry's scroll position.
await settle();
sY = 333; fire('window', 'pagehide', {});
ok(top().y === 333 && !top().sheet, `D21i pagehide records the current entry's scroll for a reload (y=${top().y})`);
sY = 0;
// (Last of the history cases: a synthetic popstate does not move the scripted history.)
// An entry from before this page load (or whose state another module replaced
// with null before init) maps to the root page.
showPage('rental'); await settle();
fire('window', 'popstate', { state: null }); await settle();
ok(app.page === 'flip', `D21 a traversal to an entry with no view-stack state maps to the root page (now ${app.page})`);

// Keyboard watcher (review finding 1), executed.
const kbWin = { innerHeight: 800, visualViewport: { height: 800, offsetTop: 0, scale: 1 } };
const field = { tagName: 'INPUT', type: 'text', scrolled: 0, attrs: {}, closest: () => null, getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; },
  getBoundingClientRect: () => ({ top: 600, bottom: 644 }), scrollIntoView() { this.scrolled++; } };
const kbDoc = { body: { classList: { add: c => bodyClasses.add(c), remove: c => bodyClasses.delete(c) } }, activeElement: field };
bodyClasses.clear();
const w = vs.makeKeyboardWatcher(kbWin, kbDoc);
w.focusIn(field);
ok(bodyClasses.has('kb-open'), 'D22 focusing a text field steps the tab bar aside at once');
kbWin.visualViewport.height = 480; w.viewport();
ok(bodyClasses.has('kb-open') && field.scrolled === 1, 'D23 the keyboard coming up re-centres a field it covers, once');
kbWin.visualViewport.height = 470; w.viewport();
ok(field.scrolled === 1, 'D24 later viewport changes with the keyboard up (browser chrome) never yank the page');
kbWin.visualViewport.height = 800; w.viewport();
ok(!bodyClasses.has('kb-open'), 'D25 the keyboard hidden WITHOUT a blur (Android Back) brings the tab bar back');
kbWin.visualViewport.height = 740; w.viewport();
ok(!bodyClasses.has('kb-open') && field.scrolled === 1, 'D26 a small resize (URL bar) with focus kept is not a keyboard: no hide, no scroll');
kbWin.visualViewport.height = 480; kbWin.visualViewport.scale = 2; w.viewport();
ok(!bodyClasses.has('kb-open'), 'D27 pinch-zoom is not mistaken for a keyboard');
kbDoc.activeElement = null; w.focusOut();
// Round-2 review N5: engines where the keyboard shrinks innerHeight too (Firefox Android, WebView adjustResize).
{
  const rc = { innerWidth: 375, innerHeight: 800, visualViewport: { height: 800, offsetTop: 0, scale: 1 } };
  const doc2 = { body: kbDoc.body, activeElement: field };
  bodyClasses.clear();
  const w3 = vs.makeKeyboardWatcher(rc, doc2);
  w3.focusIn(field);
  rc.innerHeight = 480; rc.visualViewport.height = 480; w3.viewport();
  const shown = bodyClasses.has('kb-open');
  rc.innerHeight = 800; rc.visualViewport.height = 800; w3.viewport();
  ok(shown && !bodyClasses.has('kb-open'), 'D28a resizes-content engines: the keyboard is detected against the tallest height seen, and its hiding brings the tab bar back');
  rc.innerWidth = 812; rc.innerHeight = 375; rc.visualViewport.height = 375; w3.viewport();
  ok(!bodyClasses.has('kb-open'), 'D28b a rotation is not mistaken for a keyboard (each width keeps its own reference)');
// Round-3 review R3-5: a window made shorter while no field is focused becomes the new reference.
{
  const rs = { innerWidth: 600, innerHeight: 900, visualViewport: { height: 900, offsetTop: 0, scale: 1 } };
  const d3 = { body: kbDoc.body, activeElement: null };
  bodyClasses.clear();
  const w4 = vs.makeKeyboardWatcher(rs, d3);
  rs.innerHeight = 600; rs.visualViewport.height = 600; w4.viewport();
  d3.activeElement = field; w4.focusIn(field);
  rs.visualViewport.height = 300; w4.viewport();
  const upNow = bodyClasses.has('kb-open');
  rs.visualViewport.height = 600; w4.viewport();
  ok(upNow && !bodyClasses.has('kb-open'), 'D28c a window made shorter while no field is focused is the new reference: the keyboard hiding still brings the tab bar back');
  d3.activeElement = null; w4.focusOut();
}
  doc2.activeElement = null; w3.focusOut();
}
ok(!bodyClasses.has('kb-open'), 'D28 leaving the field clears the state');
ok(vs.isTextEntry({ tagName: 'INPUT', type: 'text' }) && vs.isTextEntry({ tagName: 'TEXTAREA' }) && !vs.isTextEntry({ tagName: 'INPUT', type: 'checkbox' }) && !vs.isTextEntry({ tagName: 'SELECT' }), 'D29 keyboard awareness counts only text entry (not toggles or selects)');

// Enter = Next, executed on a tiny page.
const mk = (id, inPage = true) => {
  const f = { id, tagName: 'INPUT', type: 'text', focused: 0, blurred: 0, attrs: {}, focus() { this.focused++; }, blur() { this.blurred++; },
    getClientRects: () => [1], getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; } };
  f.closest = (sel) => (sel === '.page' && inPage ? page : null);
  return f;
};
const page = { querySelectorAll: () => fields };
const fields = [mk('a'), mk('b'), mk('c')];
const enter = (target, extra = {}) => { const e = { key: 'Enter', target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; return [vs.onEnter(e), e]; };
let [handled, e1] = enter(fields[0]);
ok(handled && e1.defaultPrevented && fields[1].focused === 1, 'D30 Enter in an analyzer field moves to the next field');
[handled] = enter(fields[2]);
ok(handled && fields[2].blurred === 1, 'D31 Enter in the last field dismisses the keyboard');
const modalField = mk('signin-email', false);
[handled, e1] = enter(modalField);
ok(!handled && !e1.defaultPrevented, 'D32 Enter in a modal field (sign-in, code) is left to its own handler');
[handled] = enter(fields[0], { isComposing: true });
ok(!handled, 'D33 Enter that commits an IME composition is left alone');
const w2 = vs.makeKeyboardWatcher({ innerHeight: 800, visualViewport: { height: 800, offsetTop: 0, scale: 1 } }, { body: kbDoc.body, activeElement: null });
w2.focusIn(fields[2]); w2.focusIn(fields[0]);
ok(fields[2].attrs.enterkeyhint === 'done' && fields[0].attrs.enterkeyhint === 'next', 'D34 focus sets enterkeyhint: "next", or "done" on the last field (also for fields rendered later)');

const vsSrc = src('docs/src/js/viewstack.js');
const vsCode = vsSrc.replace(/\/\/[^\n]*/g, '');
ok(!/pushState\([^)]*,\s*'[^']*',/.test(vsCode) && !/location\.(href|hash)\s*=/.test(vsCode), 'D35 the view stack never changes the URL');
ok(!/localStorage|supabase|getDeals|tier|fetch\(/i.test(vsCode), 'D36 the view stack reads and writes no deal, account, tier or network state');
// main.js wiring
ok(mainJs.indexOf('initViewStack({') > mainJs.indexOf('takeAuthLinkFromUrl();   //') && mainJs.indexOf('initViewStack({') < mainJs.indexOf('\ninitOnboarding();'), 'D37 the view stack starts after the URL clean-ups and before anything can open a sheet');
ok(/if \(wasOpen\) recordSheetClose\(id\);/.test(mainJs) && /recordSheetOpen\(id\);/.test(mainJs), 'D38 every open/close path goes through the view stack (one law)');
ok(/const prev = currentPageId\(\), prevY = window\.scrollY \|\| 0;/.test(mainJs) && /recordPage\(id, prevY\)/.test(mainJs), 'D39 showPage records the leaving scroll before the swap');
// Review corrections (finding 6, 9 and nits), pinned.
ok(/label: 'purchase price'/.test(mainJs) && !/label: 'Purchase Price'/.test(mainJs) && /'Monthly rent'/.test(mainJs) && !/: 'Monthly Rent'/.test(mainJs), 'D40 validation messages and the band label use the sentence-case field names');
ok(/if \(lab\.textContent === 'Monthly Rent'\) lab\.textContent = 'Monthly rent';/.test(mainJs), 'D41 the engine-written rent label is re-cased in place (ltr.js / brrr.js untouched)');
ok(/for \(let i = unlocked; i < 6; i\+\+\) if \(getMarketForSlot\(i\)\) \{ heldBeyond = true; break; \}/.test(mainJs) && /hasAnalyzedOnce\(\) \|\| heldBeyond \? '' : ' hidden'/.test(mainJs) && !/hasAnalyzedOnce\(\) \|\| heldBeyond \? '' : ' hidden'/.test('anything at all'), 'D42 a downgraded account that still holds markets in locked slots sees the line at once');
ok(/padding-top:env\(safe-area-inset-top\)/.test((css.match(/(^|\n)body\{[^}]*\}/) || [''])[0]) && /margin-top:calc\(-1 \* var\(--safe-top\)\);padding:var\(--safe-top\)/.test(rule('.appbar')) && !/:has\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'D43 legal, SEO and shared pages keep the status-bar inset on <body>; the app bar pulls over it and carries it as padding (no :has() dependency)');
ok(/body\.kb-open \.tabbar\{[^}]*visibility:hidden/.test(css), 'D44 the stepped-aside tab bar leaves the focus and screen-reader order');
ok(/\.modal-backdrop:not\(#modal-upgrade\)\[data-required\] > \.modal::before\{display:none\}/.test(css), 'D45 a required sheet shows no grabber');

// ─── §E what this wave does not touch ───────────────────────────────────────
console.log('— §E boundaries —');
let base = null;
// The production commit this branch is built on (re-based 2026-11-24 from b47a9aa onto dfb7a4d, the
// sign-in paste-button removal). Re-point it when the branch is re-based again.
const PROD_BASE = 'dfb7a4d086a16b9b340201ea7c30810c760c9262';
try { execFileSync('git', ['-C', root, 'cat-file', '-e', PROD_BASE + '^{commit}'], { stdio: 'ignore' }); base = PROD_BASE; } catch {}
if (base) {
  const changed = execFileSync('git', ['-C', root, 'diff', '--name-only', base, '--', 'docs', 'supabase'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const forbidden = changed.filter(f => /\/(finance|flip|ltr|brrr|strFinance|rental|auth|signinCode|supabaseClient|tiers|storage|marketSync|clearpath)\.js$/.test(f) || /^supabase\//.test(f) || /^docs\/vendor\//.test(f) || /(privacy|terms)\.html$/.test(f));
  // RE-PINNED in Commercial C1 (same-commit law): clearpath.js may differ from production by exactly the one
  // business-purpose copy line on the funding button (pinned by tests/commercialc1 F1). Any other change fails.
  const c1Only = (f) => {
    if (!/\/clearpath\.js$/.test(f)) return false;
    const d = execFileSync('git', ['-C', root, 'diff', '-U0', base, '--', f], { encoding: 'utf8' }).replace(/\r/g, '');
    const lines = d.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
    return lines.length === 2 && lines[0].startsWith('-') && lines[1].startsWith('+')
      && lines[1].replace('Business-purpose, non-owner-occupied investment property only. ', '') === '+' + lines[0].slice(1);
  };
  const forbiddenNow = forbidden.filter(f => !c1Only(f));
  ok(forbiddenNow.length === 0, 'E1 engines, sign-in, Supabase, vendor, tier/storage and legal files are byte-identical to production (' + forbiddenNow.join(', ') + ')');
  const acct = (h) => { const a = h.indexOf('id="account-block"'); return h.slice(a, h.indexOf('id="redeem-block"', a)); };
  const baseHtml = execFileSync('git', ['-C', root, 'show', base + ':docs/index.html'], { encoding: 'utf8' });
  ok(acct(baseHtml).replace(/\r/g, '') === acct(html).replace(/\r/g, ''), 'E2 the sign-in markup (#account-block) is unchanged');
  const sig = (c) => (c.match(/^[^\n]*signin[^\n]*$/gm) || []).join('\n').replace(/\r/g, '');
  const baseCss = execFileSync('git', ['-C', root, 'show', base + ':docs/src/css/styles.css'], { encoding: 'utf8' });
  ok(sig(baseCss) === sig(css), 'E3 every sign-in CSS line is unchanged');
} else {
  ok(true, 'E1–E3 skipped: production base commit not in this clone');
}
ok(/\.modal-backdrop:not\(#modal-upgrade\)/.test(css), 'E4 the sign-in / plans sheet keeps its presentation this wave (owned by the sign-in redesign)');
ok(/PAID_PLANS_LEAD/.test(mainJs) && /funding stays free on every tier/.test(mainJs), 'E5 tier law copy is untouched');

console.log('— §F accessibility (375px audit, 2026-11-24) —');
{   // §F block scope: its helpers must not collide with earlier sections
// F1–F3 contrast: every text tone clears WCAG AA 4.5:1 on every surface it can sit on.
const hex6 = (h) => { h = h.replace('#', ''); return h.length === 3 ? h.split('').map(c => c + c).join('') : h; };
const lumi = (h) => { h = hex6(h); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
const cr = (a, b) => { const x = lumi(a), y = lumi(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const tokv = (n) => (css.match(new RegExp('--' + n + ':(#[0-9a-fA-F]{3,6})[;}\\s]')) || [])[1];
const surfaces = ['bg', 'surface', 'surface2', 'surface3'].map(tokv);
ok(surfaces.every(Boolean), 'F1a the four surface tokens are readable from the stylesheet');
for (const t of ['text', 'text-2', 'placeholder', 'muted']) {
  const v = tokv(t);
  ok(!!v && surfaces.every(s => s && cr(v, s) >= 4.5), `F1 --${t} clears 4.5:1 on --bg/--surface/--surface2/--surface3 (${surfaces.map(s => (v && s) ? cr(v, s).toFixed(2) : '?').join(' / ')})`);
}
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/(^|[;{\s])color:var\(--muted2\)/.test(cssNC), 'F2 no text is coloured --muted2 (#444 is 2.0:1); it is a border tone only');
ok(!/6b6b6b/i.test(cssNC), 'F3 the old #6b6b6b grey is gone everywhere, the select caret included');

// F4–F8 touch: every flagged control offers at least --tap (44px).
ok(/--tap:44px/.test(css), 'F4a --tap is 44px');
const after = (cssNC.match(/#auth-chip::after,\.util-bar \.icon-btn::after,\.get-app-btn::after\{[^}]*\}/) || [''])[0];
ok(/position:absolute/.test(after) && /height:var\(--tap\)/.test(after) && /width:max\(100%,var\(--tap\)\)/.test(after) && /translate\(-50%,-50%\)/.test(after),
   'F4 the app-bar controls (sign-in chip, Share, Get the App) get a centred hit area of at least 44x44');
ok(/#auth-chip,\.util-bar \.icon-btn,\.get-app-btn\{position:relative\}/.test(cssNC), 'F4b the hit area is anchored to its own control');
const host = (sel) => (cssNC.match(new RegExp('(^|[}\\s])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}', 'g')) || []).join('');
ok(!/overflow:hidden/.test(host('.icon-btn') + host('.get-app-btn') + host('.util-bar') + host('.appbar')) && !/overflow:hidden/.test((html.match(/id="auth-chip"[^>]*>/) || [''])[0]),
   'F5 no host of a hit-area pseudo clips it (no overflow:hidden on the chip, Share, Get the App, util bar or app bar)');
ok(/height:34px/.test(host('.get-app-btn')) && /height:34px/.test(host('.icon-btn')), 'F5b the controls keep their compact 34px look (installux pins it)');
const lastSlot = (cssNC.match(/(^|[}\s])\.market-slot\{[^}]*\}/g) || []).pop() || '';
ok(/min-height:var\(--tap\)/.test(lastSlot) && /height:auto/.test(lastSlot), 'F6 market slots (which clip their label) grow to 44px instead of a pseudo hit area');
ok(/#sqft\{height:var\(--control-h\)!important\}/.test(cssNC) && /id="sqft"[^>]*style="height:38px"/.test(html), 'F7 the square-footage field is 44px high (CSS beats its inline 38px; the markup is untouched)');
ok(/\.legal-footer a\{[^}]*min-height:var\(--tap\)/.test(cssNC) && /\.legal-footer a,\.sign-out-link\{[^}]*min-height:24px/.test(cssNC),
   'F8 Terms / Privacy are 44px targets; the shared 24px floor rule (Sign out) is unchanged');

// F9–F20 sheet focus law (sheetfocus.js) against a minimal DOM.
const sf = await import('../docs/src/js/sheetfocus.js');
const fdoc = { activeElement: null, listeners: [], byId: {}, getElementById(id) { return this.byId[id] || null; }, addEventListener(t, f) { this.listeners.push([t, f]); } };
class FEl {
  constructor(name, { focusable = false, cls = [], role = null, id = null, tag = 'DIV', type = null, disabled = false, attrs = {} } = {}) {
    this.name = name; this.focusable = focusable; this.kids = []; this.parent = null; this.attrs = { ...attrs }; this.visible = true;
    this.tagName = tag; this.disabled = disabled; this.id = id || '';
    if (role) this.attrs.role = role;
    if (type) this.attrs.type = type;
    this.classList = { s: new Set(cls), contains(c) { return this.s.has(c); }, add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); } };
    if (id) fdoc.byId[id] = this;
  }
  add(...k) { k.forEach(c => { c.parent = this; this.kids.push(c); }); return this; }
  all() { return this.kids.flatMap(k => [k, ...k.all()]); }
  contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; }
  matches(sel) { if (sel === '[role="dialog"]') return this.attrs.role === 'dialog'; throw new Error('unexpected matches ' + sel); }
  getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; }
  querySelector(sel) {
    if (sel === '[role="dialog"]') return this.all().find(k => k.attrs.role === 'dialog') || null;
    if (sel === 'h1, h2, h3, .picker-title') return this.all().find(k => /^H[123]$/.test(k.tagName) || k.classList.contains('picker-title')) || null;
    if (sel === '.modal, .modal-picker') return this.all().find(k => k.classList.contains('modal') || k.classList.contains('modal-picker')) || null;
    throw new Error('unexpected selector ' + sel);
  }
  // Mirrors the real FOCUSABLE selector's rules (asserted below): native controls unless disabled — a tabindex=-1
  // control still MATCHES the selector, as in a browser — plus any element whose tabindex is not -1.
  querySelectorAll(sel) {
    if (sel !== sf.FOCUSABLE || !/button:not\(\[disabled\]\)/.test(sel) || !/\[tabindex\]:not\(\[tabindex="-1"\]\)/.test(sel)) throw new Error('unexpected selector ' + sel);
    return this.all().filter(k => (k.focusable && !k.disabled) || ('tabindex' in k.attrs && k.attrs.tabindex !== '-1'));
  }
  getClientRects() { let n = this; while (n) { if (!n.visible) return []; n = n.parent; } return [1]; }
  hasAttribute(a) { return a in this.attrs; }
  setAttribute(a, v) { this.attrs[a] = String(v); }
  focus() { if (this.getClientRects().length) fdoc.activeElement = this; }
  blur() { if (fdoc.activeElement === this) fdoc.activeElement = fdoc.body; }
  get isConnected() { return true; }
}
fdoc.body = new FEl('body');
fdoc.activeElement = fdoc.body;
const page = new FEl('page'); const opener = new FEl('opener', { focusable: true }); const other = new FEl('other', { focusable: true });
page.add(opener, other); fdoc.body.add(page);
const mkSheet = (id, n, { role = null, backRole = null, headId = null, surfAttrs = {}, extra = [] } = {}) => {
  const back = new FEl(id + '-backdrop', { cls: ['modal-backdrop'], id, role: backRole });
  const surf = new FEl(id + '-surface', { cls: ['modal'], role, attrs: surfAttrs });
  const head = new FEl(id + '-h3', { tag: 'H3', id: headId });
  const items = Array.from({ length: n }, (_, i) => new FEl(id + '-item' + i, { focusable: true, tag: 'BUTTON' }));
  surf.add(head, ...items, ...extra); back.add(surf); fdoc.body.add(back);
  return { back, surf, head, items };
};
const A = mkSheet('modal-a', 3), B = mkSheet('modal-b', 2), U = mkSheet('modal-upgrade', 2), Z = mkSheet('modal-z', 0), D = mkSheet('modal-d', 1, { role: 'dialog' });
const open = (S, id) => { S.back.classList.add('active'); sf.sheetOpened(S.back, id, fdoc); };
const close = (S, id) => { S.back.classList.remove('active'); sf.sheetClosed(S.back, id, fdoc); };
const tab = (shift = false) => { const e = { key: 'Tab', shiftKey: shift, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; const r = sf.onSheetTab(e, fdoc); return [r, e]; };
const at = () => fdoc.activeElement && fdoc.activeElement.name;

sf._resetSheetFocus();
opener.focus(); open(A, 'modal-a');
ok(at() === 'modal-a-surface', 'F9 opening a sheet moves focus to its surface (not to an input, which would raise the keyboard)');
ok(A.surf.attrs.tabindex === '-1', 'F9b the surface is made programmatically focusable (tabindex -1, out of the Tab order)');
let r, e;
A.items[2].focus(); [r, e] = tab();
ok(r === true && e.defaultPrevented && at() === 'modal-a-item0', 'F10 Tab on the last control wraps to the first');
[r, e] = tab(true);
ok(r === true && at() === 'modal-a-item2', 'F11 Shift+Tab on the first control wraps to the last');
A.surf.focus(); [r, e] = tab(true);
ok(r === true && at() === 'modal-a-item2', 'F11b Shift+Tab from the sheet surface goes to the last control, not out of the sheet');
A.items[1].focus(); [r, e] = tab();
ok(r === false && !e.defaultPrevented, 'F12 Tab between inner controls is left to the browser');
other.focus(); [r, e] = tab();
ok(r === true && at() === 'modal-a-item0', 'F13 focus that escaped the sheet is brought back in on Tab');
close(A, 'modal-a');
ok(at() === 'opener', 'F14 closing returns focus to the control that opened the sheet');

sf._resetSheetFocus();
opener.focus(); open(A, 'modal-a'); A.items[1].focus(); open(B, 'modal-b');
ok(at() === 'modal-b-surface', 'F15 a sheet opened over another takes focus');
B.items[1].focus(); [r, e] = tab();
ok(at() === 'modal-b-item0', 'F15b Tab cycles in the top sheet only');
close(B, 'modal-b');
ok(at() === 'modal-a-item1', 'F15c closing the top sheet returns focus to the control in the sheet below that opened it');
close(A, 'modal-a');
ok(at() === 'opener', 'F15d closing the last sheet returns focus to the page control');

sf._resetSheetFocus();
opener.focus(); open(A, 'modal-a'); A.items[0].focus(); open(A, 'modal-a');
ok(at() === 'modal-a-item0', 'F16 re-opening an open sheet keeps the focus already inside it');
close(A, 'modal-a');
ok(at() === 'opener', 'F16b ... and keeps the original opener as the return target');

sf._resetSheetFocus();
opener.focus(); open(A, 'modal-a'); page.visible = false; close(A, 'modal-a');
ok(at() === 'body', 'F17 when the opener is no longer on screen focus leaves the hidden sheet instead of jumping somewhere arbitrary');
page.visible = true;

sf._resetSheetFocus();
opener.focus(); open(A, 'modal-a'); other.focus(); close(A, 'modal-a');
ok(at() === 'other', 'F18 focus the code already moved elsewhere on purpose is left alone on close');

sf._resetSheetFocus();
opener.focus(); open(U, 'modal-upgrade');
ok(at() === 'opener' && !('tabindex' in U.surf.attrs), 'F19 the sign-in / plans sheet is excluded: no focus move, no tabindex (its focus belongs to the sign-in flow)');
open(A, 'modal-a'); A.items[2].focus(); [r, e] = tab();
ok(r === false && !e.defaultPrevented, 'F19b while the sign-in sheet is open no Tab is trapped');
close(U, 'modal-upgrade'); [r, e] = tab();
ok(r === true && at() === 'modal-a-item0', 'F19c once it closes the sheet below traps Tab again');
close(A, 'modal-a');

sf._resetSheetFocus();
opener.focus(); open(Z, 'modal-z'); [r, e] = tab();
ok(r === true && e.defaultPrevented && at() === 'modal-z-surface', 'F20 a sheet with no controls keeps focus on its surface');
close(Z, 'modal-z');
sf._resetSheetFocus();
opener.focus(); open(D, 'modal-d');
ok(at() === 'modal-d-surface' && D.surf.attrs.tabindex === '-1', 'F20b an element with role="dialog" is the surface that takes focus');
close(D, 'modal-d');
for (const k of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
  sf._resetSheetFocus(); open(A, 'modal-a'); A.items[2].focus();
  const ev = { key: 'Tab', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...k };
  ok(sf.onSheetTab(ev, fdoc) === false, 'F20c a modified Tab (' + Object.keys(k)[0] + ') is not intercepted');
  close(A, 'modal-a');
}
sf._resetSheetFocus();

// F21 wiring in main.js and the module's purity.
const sfSrc = src('docs/src/js/sheetfocus.js');
ok(!/^\s*import\s/m.test(stripLineComments(sfSrc)), 'F21 sheetfocus.js is pure DOM with no imports');
ok(/FOCUS_EXCLUDED = new Set\(\['modal-upgrade'\]\)/.test(sfSrc), 'F21b #modal-upgrade is the one excluded sheet');
const om = (mainJs.match(/function openModal\(id\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const cm = (mainJs.match(/function closeModal\(id\)\s*\{[\s\S]*?\n\}/) || [''])[0];
ok(om.indexOf("el.classList.add('active')") > -1 && om.indexOf('sheetOpened(el, id)') > om.indexOf("el.classList.add('active')"), 'F21c openModal moves focus after the sheet is shown');
ok(cm.indexOf("el.classList.remove('active')") > -1 && /if \(wasOpen\) sheetClosed\(el, id\)/.test(cm) && cm.indexOf('sheetClosed(el, id)') > cm.indexOf("el.classList.remove('active')"), 'F21d closeModal returns focus only for a sheet that was open, after hiding it');
ok(/\ninitSheetFocus\(\);/.test(mainJs.replace(/\r/g, '')), 'F21e the Tab handler is installed at boot');
// F22 fail-safe (found by the full matrix: five suites' stub elements have no hasAttribute and openModal threw).
sf._resetSheetFocus();
const bare = { classList: { contains: () => true } };            // an element with almost no DOM surface
const bareDoc = { activeElement: null, body: {}, getElementById: () => bare };
let threw = false;
try { sf.sheetOpened(bare, 'modal-bare', bareDoc); sf.onSheetTab({ key: 'Tab', preventDefault() {} }, bareDoc); sf.sheetClosed(bare, 'modal-bare', bareDoc); sf.initSheetFocus({}); } catch { threw = true; }
ok(!threw, 'F22 focus handling never throws into openModal / closeModal / keydown, even on a partial DOM');
sf._resetSheetFocus();
opener.focus(); open(A, 'modal-a'); close(A, 'modal-a');
ok(at() === 'opener', 'F22b ... and the open list is not stranded by an earlier failure');
sf._resetSheetFocus();

// F23 screen-reader semantics (review round 1, finding 1): the surface is announced as a modal dialog named by its heading.
opener.focus(); open(A, 'modal-a');
ok(A.surf.attrs.role === 'dialog' && A.surf.attrs['aria-modal'] === 'true', 'F23 an opened sheet\'s surface is role="dialog" aria-modal="true"');
ok(A.head.id === 'modal-a-title' && A.surf.attrs['aria-labelledby'] === 'modal-a-title', 'F23b ... labelled by its heading (an id is given to a heading that has none)');
close(A, 'modal-a'); sf._resetSheetFocus();
const H = mkSheet('modal-h', 1, { headId: 'own-title' });
open(H, 'modal-h');
ok(H.head.id === 'own-title' && H.surf.attrs['aria-labelledby'] === 'own-title', 'F23c an existing heading id is reused, not replaced');
close(H, 'modal-h'); sf._resetSheetFocus();
const L = mkSheet('modal-l', 1, { surfAttrs: { 'aria-label': 'Named', role: 'alertdialog' } });
open(L, 'modal-l');
ok(L.surf.attrs.role === 'alertdialog' && !('aria-labelledby' in L.surf.attrs), 'F23d markup that already names or types the dialog is respected');
close(L, 'modal-l'); sf._resetSheetFocus();
const R = mkSheet('modal-r2', 1, { backRole: 'dialog' });
opener.focus(); open(R, 'modal-r2');
ok(at() === 'modal-r2-backdrop' && !('role' in R.surf.attrs), 'F23e when the backdrop itself is the dialog it is the surface (no nested dialog role)');
close(R, 'modal-r2'); sf._resetSheetFocus();

// F24 (finding 3): a text field that opened a sheet is not re-focused on close (that would raise the phone keyboard).
const field = new FEl('field', { focusable: true, tag: 'INPUT', type: 'number' }); page.add(field);
field.focus(); open(A, 'modal-a'); close(A, 'modal-a');
ok(at() === 'body', 'F24 closing a sheet does not re-focus a text field opener');
const chk = new FEl('chk', { focusable: true, tag: 'INPUT', type: 'checkbox' }); page.add(chk);
sf._resetSheetFocus(); chk.focus(); open(A, 'modal-a'); close(A, 'modal-a');
ok(at() === 'chk', 'F24b a non-text input (checkbox) opener does get focus back');
ok(typeof sf.isTextField === 'function' && sf.isTextField({ tagName: 'TEXTAREA' }) && sf.isTextField({ tagName: 'INPUT', getAttribute: () => 'email' }) && !sf.isTextField({ tagName: 'INPUT', getAttribute: () => 'radio' }) && !sf.isTextField({ tagName: 'BUTTON' }), 'F24c isTextField: textarea and email are text; radio and button are not');
sf._resetSheetFocus();

// F25 (nit 6): the Tab cycle skips disabled controls and controls taken out of the Tab order.
const dis = new FEl('dis', { focusable: true, tag: 'BUTTON', disabled: true });
const neg = new FEl('neg', { focusable: true, tag: 'BUTTON', attrs: { tabindex: '-1' } });
const T = mkSheet('modal-t', 2, { extra: [dis, neg] });
open(T, 'modal-t'); T.items[1].focus(); [r, e] = tab();
ok(r === true && at() === 'modal-t-item0', 'F25 Tab wraps from the last tabbable control, skipping a disabled one and a tabindex=-1 one');
[r, e] = tab(true);
ok(r === true && at() === 'modal-t-item1', 'F25b Shift+Tab from the first lands on the last tabbable control');
close(T, 'modal-t'); sf._resetSheetFocus();

// F26 (finding 2): the picker's "No results found" row is a message at full contrast, not a faded control.
// F27 (review round 2): the market picker keeps its accessible name through the state drill-down.
{
  const setTitle = (mainJs.match(/function _pickerSetTitle\(text\) \{[\s\S]*?\n\}/) || [''])[0];
  const setBack = (mainJs.match(/function _pickerSetBack\(code\) \{[\s\S]*?\n\}/) || [''])[0];
  ok(/class="picker-title" id="picker-headline"/.test(setTitle) && /class="picker-title" id="picker-headline"/.test(setBack) && /id="picker-headline"/.test(html),
     'F27 every picker title render (initial markup, title, drill-down) carries id="picker-headline", the sheet\'s aria-labelledby target');
}
ok(/\.picker-item\.disabled\{opacity:1\}/.test(cssNC) && /\.picker-item\.disabled \.picker-item-label\{color:var\(--text-2\)/.test(cssNC), 'F26 the market picker\'s No results row is not faded (was opacity .35, about 2.9:1)');
}

console.log(`\ndesignsystem: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
