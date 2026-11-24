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
ok(/body\.kb-open \.tabbar\{transform:translate\(-50%,100%\)\}/.test(css), 'B1 the tab bar steps aside while the keyboard is up');
// B2 · the first screen is the task
const flipPage = html.slice(html.indexOf('id="page-flip"'), html.indexOf('id="page-rental"'));
ok(flipPage.indexOf('id="guc-entry"') > flipPage.indexOf('id="flip-results"') && flipPage.indexOf('id="f-ask"') < flipPage.indexOf('id="guc-entry"'), 'B2 the ground-up note follows the analyzer — the first input comes first');
ok(/purpose=ground_up#submit/.test(flipPage.slice(flipPage.indexOf('id="guc-entry"'))) && /does not size ground-up construction/.test(flipPage), 'B2 the moved note keeps its broker handoff and copy');
// B3 · upsell timing
const slotsFn = mainJs.slice(mainJs.indexOf('function renderMarketSlots'), mainJs.indexOf('function renderAllSlots'));
const stripLineComments = (s) => s.replace(/\/\/[^\n]*/g, '');
const slotsCode = stripLineComments(slotsFn);
ok(!/slot-locked/.test(slotsCode) && !/🔒 Region/.test(slotsCode), 'B3 no locked Region tiles are drawn');
ok(/class="slot-more" onclick="handleLockedSlot\(\$\{unlocked \+ 1\}\)"\$\{hasAnalyzedOnce\(\) \? '' : ' hidden'\}/.test(slotsFn), 'B3 one quiet "More regions" line, hidden until a first analysis, opening the same region upgrade path');
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
console.log('— §D view stack —');
const listeners = { window: {}, document: {} };
const entries = [{ state: null }]; let idx = 0;
const clone = (s) => (s == null ? s : JSON.parse(JSON.stringify(s)));
const fire = (target, type, ev) => (listeners[target][type] || []).forEach(f => f(ev));
let backs = 0;
globalThis.history = {
  scrollRestoration: 'auto',
  get state() { return entries[idx].state; },
  get length() { return entries.length; },
  pushState(s) { entries.splice(idx + 1); entries.push({ state: clone(s) }); idx++; },
  replaceState(s) { entries[idx] = { state: clone(s) }; },
  back() { backs++; if (idx > 0) { idx--; setTimeout(() => fire('window', 'popstate', { state: entries[idx].state }), 0); } },
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
const tick = () => new Promise(r => setTimeout(r, 5));
const pressBack = async () => { history.back(); await tick(); await tick(); };
const key = (k) => { const ev = { key: k, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; fire('document', 'keydown', ev); return ev; };

ok(history.state && history.state.df === 1 && history.state.page === 'flip' && history.scrollRestoration === 'manual', 'D1 init seeds the root entry (URL untouched) and takes over scroll restoration');
sY = 640; showPage('pipeline');
ok(history.length === 2 && history.state.page === 'pipeline' && entries[0].state.y === 640, 'D2 a tab switch is one entry; the leaving page keeps its scroll position');
await pressBack();
ok(app.page === 'flip' && sY === 640, 'D3 Back returns to the previous tab at the scroll position it was left at');
showPage('guide');
ok(history.length === 2 && history.state.page === 'guide', 'D4 a new switch after Back replaces the forward entry (no history growth)');
openModal('modal-share-app');
ok(history.state.sheet === 'modal-share-app' && history.length === 3, 'D5 presenting a sheet adds one entry');
await pressBack();
ok(app.open.length === 0 && app.page === 'guide' && history.state.sheet === null, 'D6 Back closes the top sheet first and stays on the tab');
openModal('modal-share-app'); closeModal('modal-share-app'); await tick(); await tick();
ok(app.open.length === 0 && history.state.sheet === null && history.length === 3 && history.state.page === 'guide', 'D7 a UI close consumes the sheet entry (Back will not reopen or skip)');
const b0 = backs;
openModal('modal-delete'); closeModal('modal-delete'); openModal('modal-share-deal');
await tick(); await tick();
ok(app.open.join() === 'modal-share-deal' && history.state.sheet === 'modal-share-deal' && backs === b0 + 1, 'D8 close-then-open in one tick: the new sheet entry lands after the consumed one');
await pressBack();
ok(app.open.length === 0 && history.state.sheet === null, 'D9 … and Back then closes the new sheet');
openModal('modal-a'); openModal('modal-b');
let ev = key('Escape');
ok(app.open.join() === 'modal-a' && ev.defaultPrevented, 'D10 Escape closes only the top sheet');
key('Escape'); await tick(); await tick();
ok(app.open.length === 0 && history.state.sheet === null, 'D11 Escape again closes the next one; entries are consumed');
app.required.add('modal-market-picker'); openModal('modal-market-picker');
ev = key('Escape');
ok(app.open.includes('modal-market-picker') && !ev.defaultPrevented, 'D12 Escape never dismisses a required sheet');
await pressBack();
ok(app.open.includes('modal-market-picker') && history.state.sheet === 'modal-market-picker', 'D13 Back never dismisses a required sheet — its entry is put back');
app.required.delete('modal-market-picker'); closeModal('modal-market-picker'); await tick(); await tick();
ok(history.state.sheet === null, 'D14 closing it through its own control consumes the entry normally');
history.replaceState(null, '');                         // another module strips a URL parameter
showPage('rental'); await pressBack();
ok(app.page === 'guide' || app.page === 'flip', 'D15 an entry another module replaced with null still maps to a page (no crash)');
ok(vs.isTextEntry({ tagName: 'INPUT', type: 'text' }) && vs.isTextEntry({ tagName: 'TEXTAREA' }) && !vs.isTextEntry({ tagName: 'INPUT', type: 'checkbox' }) && !vs.isTextEntry({ tagName: 'SELECT' }), 'D16 keyboard awareness counts only text entry (not toggles or selects)');
const vsSrc = src('docs/src/js/viewstack.js');
ok(/!el\.closest\('\.page'\)\) return;/.test(vsSrc) && /Never inside a modal/.test(vsSrc), 'D17 Enter-as-Next is limited to analyzer pages — the sign-in and code fields keep their own Enter');
ok(!/pushState\([^)]*,\s*'[^']*',/.test(vsSrc.replace(/\/\/[^\n]*/g, '')) && !/location\.(href|hash)\s*=/.test(vsSrc), 'D18 the view stack never changes the URL');
ok(!/localStorage|supabase|getDeals|tier|fetch\(/i.test(vsSrc.replace(/\/\/[^\n]*/g, '')), 'D19 the view stack reads and writes no deal, account, tier or network state');
// main.js wiring
ok(mainJs.indexOf('initViewStack({') > mainJs.indexOf('takeAuthLinkFromUrl();   //') && mainJs.indexOf('initViewStack({') < mainJs.indexOf('\ninitOnboarding();'), 'D20 the view stack starts after the URL clean-ups and before anything can open a sheet');
ok(/if \(wasOpen\) recordSheetClose\(id\);/.test(mainJs) && /recordSheetOpen\(id\);/.test(mainJs), 'D21 every open/close path goes through the view stack (one law)');
ok(/const prev = currentPageId\(\), prevY = window\.scrollY \|\| 0;/.test(mainJs) && /recordPage\(id, prevY\)/.test(mainJs), 'D22 showPage records the leaving scroll before the swap');

// ─── §E what this wave does not touch ───────────────────────────────────────
console.log('— §E boundaries —');
let base = null;
try { execFileSync('git', ['-C', root, 'cat-file', '-e', 'b47a9aa963d4c190eadb30650648c4e9df8756b3^{commit}'], { stdio: 'ignore' }); base = 'b47a9aa963d4c190eadb30650648c4e9df8756b3'; } catch {}
if (base) {
  const changed = execFileSync('git', ['-C', root, 'diff', '--name-only', base, '--', 'docs', 'supabase'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const forbidden = changed.filter(f => /\/(finance|flip|ltr|brrr|strFinance|rental|auth|signinCode|supabaseClient|tiers|storage|marketSync|clearpath)\.js$/.test(f) || /^supabase\//.test(f) || /^docs\/vendor\//.test(f) || /(privacy|terms)\.html$/.test(f));
  ok(forbidden.length === 0, 'E1 engines, sign-in, Supabase, vendor, tier/storage and legal files are byte-identical to production (' + forbidden.join(', ') + ')');
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

console.log(`\ndesignsystem: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
