// ─── DF-P1 Mobile quick read (2026-11-22) ────────────────────────────────────
// Owner direction: Fix & Flip on a phone — purchase price, ARV and repair budget
// first, the Min Profit Target editable and visible beside them, every other
// existing control behind progressive disclosure, and a result that says it is
// preliminary, lists the assumptions behind it with their source, separates
// missing information from a negative outcome and opens the full analysis.
// Layout + display only: the analyzer still runs the canonical computeFlip /
// computeFlipStress / flipVerdict with unchanged thresholds. This suite pins
// (§A) the form by source, (§B) the pure source-labelling model, (§C) the
// collapsed-section summaries, (§D) analyzer ↔ engine parity across the verdict,
// stress and failure boundaries by EXECUTING the real flip.js, (§E) the
// collapsed-section reveal for a blocking field, and (§F) scope guards.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/dfp1.test.mjs
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = pathToFileURL(join(ROOT, 'docs', 'src', 'js') + '/').href;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + msg); } };

let fundingCalls = 0;
globalThis.__dfp1Funding = () => { fundingCalls++; };
const STUBS = {
  'clearpath.js': `export const maybeShowFundingButton = (r) => globalThis.__dfp1Funding(r); export const getPipelineFundingButtonHTML = () => ''; export const handlePipelineFundingClick = () => {}; export const getFundingLabel = () => '';`,
};
registerHooks({
  resolve(spec, ctx, next) { const base = spec.split('/').pop(); if (STUBS[base] && ctx.parentURL && ctx.parentURL.includes('/docs/src/js/')) return { url: 'stub:' + base, shortCircuit: true }; return next(spec, ctx); },
  load(url, ctx, next) { if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true }; if (url.startsWith('file:') && url.includes('/docs/src/js/')) return { format: 'module', source: readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true }; return next(url, ctx); },
});

// ── minimal DOM built from the shipped index.html (inputs + selects) ─────────
const elements = new Map();
function makeEl(id) {
  const L = {};
  return { id, value: '', textContent: '', innerHTML: '', style: {}, checked: false, dataset: {}, attrs: {}, className: '', parentNode: null, validity: { badInput: false },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle() {} },
    setAttribute(n, v) { this.attrs[n] = String(v); }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }, removeAttribute(n) { delete this.attrs[n]; },
    addEventListener(t, f) { (L[t] || (L[t] = [])).push(f); }, dispatchEvent(ev) { (L[ev.type] || []).forEach(f => f.call(this, ev)); return true; },
    focus() {}, blur() {}, scrollIntoView() {}, closest() { return null; }, appendChild(c) { return c; }, querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; } };
}
const el = (id) => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
const html = src('docs/index.html');
for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
  const attrs = m[1]; const id = (attrs.match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id); const v = (attrs.match(/\bvalue="([^"]*)"/) || [])[1]; if (v !== undefined) e.value = v; e.defaultValue = v !== undefined ? v : '';
}
for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const id = (m[1].match(/\bid="([^"]+)"/) || [])[1]; if (!id) continue;
  const opts = [...m[2].matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(o => ({ value: o[1] !== undefined ? o[1] : o[2].trim() }));
  const e = el(id); e.options = opts; e.value = opts.length ? opts[0].value : '';
}
globalThis.document = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: t => makeEl('_' + t + '_' + Math.random()), body: makeEl('body'), addEventListener() {} };
globalThis.window = globalThis; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const flip = await import(JS + 'flip.js');
const FIN = await import(JS + 'finance.js');
const FMT = await import(JS + 'format.js');

// ── §A the form, by source ───────────────────────────────────────────────────
console.log('— §A Fix & Flip form: quick inputs first, everything else preserved behind disclosure ─');
const page = html.slice(html.indexOf('id="page-flip"'), html.indexOf('id="page-rental"'));
const pos = (needle) => page.indexOf(needle);
{
  const ORIGINAL_IDS = ['flip-slots', 'flip-review-banner', 'self-reno', 'f-addr', 'f-city', 'f-state', 'f-ptype', 'f-units', 'f-ask', 'f-arv',
    'repair-result', 'repair-est', 'use-est-btn', 'sqft', 'f-rep', 'f-hold', 'f-loan', 'f-rate', 'f-points', 'f-cc1', 'f-cc2', 'f-carry', 'f-target',
    'flip-guide', 'fg-range', 'fg-labor', 'fg-basis', 'fg-soft', 'fg-adopt', 'hold-cost-label', 'carry-total-row', 'carry-total-text',
    'flip-results', 'flip-stale', 'flip-verdict', 'fvtag', 'fvlabel', 'fvsub', 'fv-whatif', 'flip-metrics', 'flip-funding-btn', 'flip-breakdown',
    'flip-deal-name', 'flip-save-btn', 'flip-notes', 'flip-save-confirm'];
  const missing = ORIGINAL_IDS.filter(id => (html.match(new RegExp('id="' + id + '"', 'g')) || []).length !== 1);
  ok(missing.length === 0, 'A1 every pre-DF-P1 Fix & Flip id still ships exactly once (no field removed or duplicated): ' + missing.join(','));
  const firstAnalyze = pos('<button class="btn-analyze" onclick="analyzeFlip()">Analyze This Deal</button>');
  ok(firstAnalyze > -1 && ['id="f-ask"', 'id="f-arv"', 'id="f-rep"', 'id="f-target"'].every(n => pos(n) > -1 && pos(n) < firstAnalyze),
     'A2 purchase price, ARV, repair budget and Min Profit Target all precede the primary Analyze button');
  ok(['id="f-ask"', 'id="f-arv"', 'id="f-rep"', 'id="f-target"'].every(n => pos(n) < pos('<details')),
     'A3 none of the four quick inputs sits inside a collapsible section');
  ok(/id="f-target"[^>]*value="40,000"/.test(page) && /id="f-target-source"[^>]*>[^<]*pre-filled from your market \(about 9% of its median ARV\), or \$40,000 by default; you can change it/.test(page),
     'A4 the Min Profit Target keeps its $40,000 shell default and its pre-fill source is stated beside it (SEO wave-2 wording)');
  ok(!/no market (is )?selected/.test(html), 'A4b independent review M1: the app no longer says "with no market selected" (matches SEO wave-2 W6)');
  const sections = [...page.matchAll(/<details class="more-section" id="([^"]+)">([\s\S]*?)<\/details>/g)].map(m => ({ id: m[1], body: m[2] }));
  ok(sections.map(s => s.id).join() === 'flip-more-repair,flip-more-fin,flip-more-costs,flip-more-prop', 'A5 four refine sections in order: repair, financing, costs, property');
  const inSection = (sid, ids) => { const s = sections.find(x => x.id === sid); return !!s && ids.every(i => s.body.includes('id="' + i + '"')); };
  ok(inSection('flip-more-repair', ['self-reno', 'sqft', 'repair-est', 'use-est-btn']), 'A6 renovation scope + repair estimator live in the repair section');
  ok(inSection('flip-more-fin', ['f-loan', 'f-rate', 'f-points']), 'A7 loan, rate and points live in the financing section');
  ok(inSection('flip-more-costs', ['f-hold', 'f-carry', 'f-cc1', 'f-cc2', 'carry-total-row']), 'A8 hold, monthly hold cost, buy/sell costs and the carry total live in the costs section');
  ok(inSection('flip-more-prop', ['f-addr', 'f-city', 'f-state', 'f-ptype', 'f-units']), 'A9 address, city/state, type and units live in the property section');
  ok(sections.every(s => !/\bopen\b/.test(page.slice(page.indexOf('id="' + s.id + '"') - 40, page.indexOf('id="' + s.id + '"')))) &&
     sections.every(s => new RegExp('<summary>[\\s\\S]*?id="flip-sum-' + s.id.replace('flip-more-', '') + '"').test(s.body)),
     'A10 sections start collapsed and each summary carries a live current-values line');
  const analyzeButtons = page.match(/<button class="btn-analyze[^"]*" onclick="analyzeFlip\(\)">/g) || [];
  ok(analyzeButtons.length === 2 && pos('btn-analyze-refine') > pos('id="flip-more-prop"') && pos('btn-analyze-refine') < pos('id="flip-results"'),
     'A11 a second Analyze (same handler) follows the refine sections; no other trigger was added');
  ok((page.match(/>Analyze This Deal<\/button>/g) || []).length === 2, 'A11b both triggers say "Analyze This Deal" (no "Re-analyze" before any analysis — browser finding 4)');
  const iErr = pos('id="flip-input-errors"');
  ok(iErr > pos('<button class="btn-analyze" onclick="analyzeFlip()">') && iErr < pos('<details'), 'A11c range / incomplete messages render under the primary Analyze, above the refine sections (browser finding 2)');
  ok(!/id="f-target"[^>]*aria-describedby/.test(page), 'A11d f-target carries no aria-describedby a blocking run could overwrite and drop (review L2)');
  const res = page.slice(pos('id="flip-results"'));
  const iM = res.indexOf('id="flip-metrics"'), iQ = res.indexOf('id="flip-firstlook"'), iF = res.indexOf('id="flip-funding-btn"'), iB = res.indexOf('id="flip-breakdown"');
  ok(iM > -1 && iQ > iM && iF > iQ && iB > iF, 'A12 the quick-read panel follows the metric tiles and precedes the funding CTA and breakdown (A8 order kept)');
  ok(/onclick="openFlipDetails\(\)"/.test(res) && /window|Object\.assign/.test(src('docs/src/js/main.js')) && /openFlipDetails,\s+\/\/ DF-P1/.test(src('docs/src/js/main.js')),
     'A13 the quick read offers the route to the full analysis, exposed to the inline handler');
  ok(!/first look/i.test(html + src('docs/src/js/flip.js') + src('docs/src/css/styles.css')), 'A14 no "first look" wording (prohibited funding-priority phrase, tier law)');
  { const mainSrc = src('docs/src/js/main.js');
    const fnBody = (name) => { const i = mainSrc.indexOf('function ' + name + '('); return i < 0 ? '' : mainSrc.slice(i, mainSrc.indexOf('\n}', i)); };
    ok(/selfEl\.checked = type === 'flip' \? !!data\.self[^\n]*\r?\n\s*if \(selfEl && type === 'flip' && selfEl\.dataset\) selfEl\.dataset\.reviewPrefill = '1';/.test(mainSrc)
       && /delete s\.dataset\.reviewPrefill/.test(fnBody('releaseReviewProtection'))
       && /delete s\.dataset\.reviewPrefill/.test(fnBody('updateSelfReno'))
       && /delete s\.dataset\.reviewPrefill/.test(fnBody('clearNewDeal')),
       'A15 main.js marks the reviewed self-renovating toggle as prefilled and releases it on review end, user toggle and Clear & New Deal (independent review L2)'); }
}

// ── §B pure source-labelling model ───────────────────────────────────────────
console.log('— §B flipFirstLookModel: every assumption is named, with an honest source ─');
const D = { 'f-hold': '5', 'f-cc1': '2', 'f-cc2': '5', 'f-carry': '900', 'f-target': '40,000', 'f-rate': '10', 'f-points': '3' };
const base = (over = {}) => ({
  used: { hold: 5, cc1: 2, cc2: 5, carry: 2900, target: 38000, rate: 10, points: 3, loan: 0, rep: 60000, self: false, financed: false },
  raw: { ...D, 'f-carry': '2,900', 'f-target': '38,000' }, defaults: D, userEdited: {}, presetText: { 'f-carry': '2,900', 'f-target': '38,000' }, repSource: 'manual',
  cls: 'hot', addr: '', state: '', ptype: '', ...over,
});
const item = (m, k) => m.items.find(i => i.key === k);
{
  const m = flip.flipFirstLookModel(base());
  ok(item(m, 'target').source === 'Market estimate' && item(m, 'carry').source === 'Market estimate', 'B1 market-preset target and hold cost are labelled market estimates');
  ok(['hold', 'cc1', 'cc2', 'fin'].every(k => item(m, k).source === 'DealFit default' && item(m, k).assumed), 'B2 untouched hold, buy/sell costs and all-cash financing are DealFit defaults');
  ok(m.assumed === 6 && /plus 6 assumed inputs/.test(m.lead), 'B3 the lead counts the assumed inputs (6)');
  ok(/^This strong signal relies partly on assumed inputs/.test(m.lead), 'B4 a strong signal built on assumptions says so first');
  ok(!item(m, 'rep'), 'B5 a typed repair budget is not listed as an assumption');
  const est = flip.flipFirstLookModel(base({ repSource: 'estimator' }));
  ok(item(est, 'rep').source === 'Planning estimate' && est.assumed === 7, 'B6 an estimator-filled repair budget is a planning estimate (assumed)');
  const typed = flip.flipFirstLookModel(base({ userEdited: { 'f-target': true, 'f-carry': true, 'f-hold': true }, raw: { ...D, 'f-hold': '6', 'f-carry': '1,800', 'f-target': '45,000', 'f-cc1': '1.5', 'f-cc2': '6' },
    used: { hold: 6, cc1: 1.5, cc2: 6, carry: 1800, target: 45000, rate: 11, points: 2, loan: 200000, rep: 60000, self: true, financed: true } }));
  ok(['target', 'carry', 'hold', 'cc1', 'cc2', 'loan'].every(k => item(typed, k).source === 'Your entry'), 'B7 values the user typed are labelled their entry');
  ok(item(typed, 'rate').source === 'DealFit default' && item(typed, 'points').source === 'DealFit default', 'B8 a financed run still flags untouched rate / points as defaults');
  ok(item(typed, 'self') && /75% of ARV/.test(item(typed, 'self').value), 'B9 self-renovating is disclosed with its Max Offer effect');
  const zero = flip.flipFirstLookModel(base({ raw: { ...D, 'f-carry': '2,900', 'f-target': '38,000', 'f-cc2': '0' }, userEdited: {} }));
  ok(item(zero, 'cc2').source === 'DealFit default' && item(zero, 'cc2').value === '5%', 'B10 a 0 the analyzer replaced with its fallback is reported as the default it became (never "your entry")');
  const noMarket = flip.flipFirstLookModel(base({ presetText: {}, raw: D, used: { ...base().used, carry: 900, target: 40000 } }));
  ok(item(noMarket, 'target').source === 'DealFit default' && item(noMarket, 'carry').source === 'DealFit default', 'B11 with no market, target and hold cost are DealFit defaults');
  const adopted = flip.flipFirstLookModel(base({ adoptedTarget: '39,000', raw: { ...D, 'f-carry': '2,900', 'f-target': '39,000' } }));
  ok(item(adopted, 'target').source === 'DealFit suggestion you adopted' && !item(adopted, 'target').assumed, 'B12 an adopted DealFit midpoint is the user\'s choice, labelled as such');
  const pass1 = flip.flipFirstLookModel(base({ cls: 'pass' }));
  ok(/Nothing required is missing: this verdict reflects the economics of the numbers shown, not missing information\./.test(pass1.lead) && !/strong signal/.test(pass1.lead),
     'B13 a NOT A DEAL verdict states it is economics, not missing information');
  const warm = flip.flipFirstLookModel(base({ cls: 'warm' }));
  ok(!/strong signal/.test(warm.lead) && !/Nothing required is missing/.test(warm.lead), 'B14 a NEEDS REVIEW verdict carries neither the strong-signal nor the negative-outcome line');
  ok(/property address, state, property type/.test(m.missingText) && /does not change these numbers/.test(m.missingText), 'B15 optional facts not yet given are listed as missing information, separately');
  const full = flip.flipFirstLookModel(base({ addr: '1 Main St', state: 'NC', ptype: 'SFR' }));
  ok(full.missingText === '', 'B16 nothing is listed missing once address, state and type are given');
  const allMine = flip.flipFirstLookModel(base({ userEdited: { 'f-target': true, 'f-carry': true, 'f-hold': true }, raw: { ...D, 'f-hold': '4', 'f-carry': '1,000', 'f-target': '30,000', 'f-cc1': '3', 'f-cc2': '6', 'f-rate': '9', 'f-points': '2' },
    used: { hold: 4, cc1: 3, cc2: 6, carry: 1000, target: 30000, rate: 9, points: 2, loan: 100000, rep: 50000, self: false, financed: true } }));
  ok(allMine.assumed === 0 && /Every input listed below is your own entry/.test(allMine.lead) && !/strong signal relies/.test(allMine.lead), 'B17 with no assumptions the lead says so and adds no caveat');
  ok(!/(approv|qualif|guarantee|pre-?approv|lender will)/i.test([m, pass1, warm, est, allMine].map(x => x.lead + x.missingText + x.items.map(i => i.label + i.value).join('')).join(' ')),
     'B18 broker compliance: no approval / qualification / guarantee language in any quick-read copy');
  // Review M1: a saved deal's prefilled values are protected (userEdited) AND marked
  // reviewPrefill — they must never be claimed as typed by the user.
  const PF = { 'f-hold': true, 'f-carry': true, 'f-target': true, 'f-cc1': true, 'f-cc2': true, 'f-rate': true, 'f-points': true };
  const saved = flip.flipFirstLookModel(base({ userEdited: { ...PF }, prefilled: { ...PF }, raw: { ...D, 'f-carry': '2,900', 'f-target': '31,000' } }));
  ok(['target', 'hold', 'carry', 'cc1', 'cc2'].every(k => item(saved, k).source === 'From your saved deal'), 'B19 every review-prefilled value reads "From your saved deal" — one provenance, one label (review M1)');
  ok(!saved.items.some(i => i.source === 'Your entry') && /5 values come from your saved deal — confirm they still apply\./.test(saved.lead), 'B20 none is labelled "Your entry"; the lead asks the user to confirm them');
  const retyped = flip.flipFirstLookModel(base({ userEdited: { ...PF }, prefilled: { ...PF, 'f-hold': false }, raw: { ...D, 'f-hold': '7', 'f-carry': '2,900', 'f-target': '31,000' } }));
  ok(item(retyped, 'hold').source === 'Your entry' && item(retyped, 'carry').source === 'From your saved deal', 'B21 a value the user retyped during the review becomes their entry');
  // Review M2: "Market estimate" only while the field still holds the preset's own text.
  const gone = flip.flipFirstLookModel(base({ raw: D, used: { ...base().used, carry: 900, target: 40000 } }));
  ok(item(gone, 'target').source === 'DealFit default' && item(gone, 'carry').source === 'DealFit default', 'B22 after a preset ran, the HTML defaults back on the form read "DealFit default", not "Market estimate" (review M2)');
  // Review L1: an adopted midpoint wins over a stale userEdited mark; absent adoption, it does not apply.
  const adoptEd = flip.flipFirstLookModel(base({ adoptedTarget: '39,000', userEdited: { 'f-target': true }, raw: { ...D, 'f-carry': '2,900', 'f-target': '39,000' } }));
  ok(item(adoptEd, 'target').source === 'DealFit suggestion you adopted', 'B23 adopting after typing still reads as the adopted suggestion');
  ok(/You can add them under Property details/.test(m.missingText) && !/before you save/.test(m.missingText), 'B24 the missing-facts line does not claim saving requires them (review L4)');
  // Independent review L2 + L3: saved-deal loan and self-renovating rows; "(est.)" on every loan figure.
  const fin = { used: { ...base().used, loan: 150000, rate: 11, points: 2, financed: true, self: true }, raw: { ...D, 'f-carry': '2,900', 'f-target': '38,000', 'f-rate': '11', 'f-points': '2' } };
  const savedFin = flip.flipFirstLookModel(base({ ...fin, prefilled: { 'f-loan': true, 'self-reno': true, 'f-rate': true, 'f-points': true }, userEdited: { 'f-rate': true, 'f-points': true } }));
  ok(['loan', 'rate', 'points', 'self'].every(k => item(savedFin, k).source === 'From your saved deal'), 'B25 a saved deal\'s loan, rate, points and self-renovating rows read "From your saved deal" (independent review L2)');
  const typedFin = flip.flipFirstLookModel(base(fin));
  ok(item(typedFin, 'loan').source === 'Your entry' && item(typedFin, 'self').source === 'Your entry', 'B26 a typed loan and a user-toggled self-renovating stay "Your entry"');
  ok(['loan', 'rate', 'points'].every(k => /\(est\.\)$/.test(item(typedFin, k).value)) && item(typedFin, 'loan').value === '$150,000 (est.)', 'B27 every loan figure in the quick read carries "(est.)" (independent review L3, law §5)');
}

// ── §C summaries ─────────────────────────────────────────────────────────────
console.log('— §C collapsed-section summaries mirror the analyzer\'s own fallbacks ─');
{
  const s = flip.flipSectionSummaries({ self: false, sqft: '', loan: '', rate: '10', points: '3', hold: '5', carry: '2,900', cc1: '2', cc2: '5', addr: '', state: '' });
  ok(s.repair === 'Hired labor' && s.fin === 'All-cash view — no loan cost modeled' && s.costs === '5 mo hold · $2,900/mo · buy 2% · sell 5%' && s.prop === 'Address not entered', 'C1 default summaries');
  const t = flip.flipSectionSummaries({ self: true, sqft: '1400', loan: '150,000', rate: '11.5', points: '2', hold: '7', carry: '1,250', cc1: '1.5', cc2: '6', addr: '412 Oak St, Charlotte NC', state: 'NC' });
  ok(t.repair === 'Self-renovating labor · 1,400 sf' && t.fin === '$150,000 loan · 11.5% · 2 pts (est.)' && t.costs === '7 mo hold · $1,250/mo · buy 1.5% · sell 6%' && t.prop === '412 Oak St, NC', 'C2 edited summaries');
  const z = flip.flipSectionSummaries({ hold: '', carry: '', cc1: '0', cc2: '', rate: '', points: '', loan: '100,000' });
  ok(z.costs === '5 mo hold · $900/mo · buy 2% · sell 5%' && z.fin === '$100,000 loan · 10% · 3 pts (est.)', 'C3 blank / zero fields summarise as the fallback the analyzer would use; loan terms carry (est.) (independent review L3)');
  // Independent review L1: a half-typed number (validity.badInput → value '') is never summarised as the fallback.
  const half = flip.flipSectionSummaries({ hold: '', cc1: '', cc2: '2', rate: '', points: '3', loan: '100,000', sqft: '', self: false,
    badInput: { hold: true, cc1: true, rate: true, sqft: true } });
  ok(half.costs === 'hold needs a number · $900/mo · buy % needs a number · sell 2%' && half.fin === '$100,000 loan · rate needs a number · 3 pts (est.)'
     && half.repair === 'Hired labor · square footage needs a number' && !/5 mo hold|buy 2%|10%/.test(half.costs + half.fin),
     'C6 half-typed hold / buy % / rate / sqft read "needs a number", never the 5 mo / 2% / 10% fallback (independent review L1)');
  const bad = flip.flipSectionSummaries({ loan: '12a', carry: '9OO', hold: '5', cc1: '2', cc2: '5' });
  ok(bad.fin === 'Loan amount needs a valid dollar amount' && /monthly cost needs a valid amount/.test(bad.costs) && !/\$12|\$9\//.test(bad.fin + bad.costs),
     'C4 a malformed loan / hold cost is never summarised as a parsed dollar amount (browser finding 1, review L3)');
  const tierSt = flip.flipSectionSummaries({ self: false, sqft: '1600', tier: 'Full Gut', addr: '12 Test Ln, Rock Hill SC', state: 'sc' });
  ok(tierSt.repair === 'Hired labor · 1,600 sf · Full Gut estimate' && tierSt.prop === '12 Test Ln, SC', 'C5 the repair summary names the estimator tier; the state displays upper-case');
}

// ── §D analyzer ↔ canonical engine parity, by execution ──────────────────────
console.log('— §D the real analyzer still equals computeFlip / computeFlipStress / flipVerdict (no new engine) ─');
const set = (id, v) => { el(id).value = v; };
function runFlip(f) {
  set('f-addr', f.addr || ''); set('f-city', ''); set('f-state', '');
  set('f-ask', f.ask); set('f-arv', f.arv); set('f-rep', f.rep); set('f-hold', f.hold ?? '5'); set('f-cc1', f.cc1 ?? '2'); set('f-cc2', f.cc2 ?? '5');
  set('f-carry', f.carry ?? '900'); set('f-target', f.target ?? '40,000'); set('sqft', ''); set('f-loan', f.loan ?? ''); set('f-rate', f.rate ?? '10'); set('f-points', f.points ?? '3');
  el('self-reno').checked = !!f.self; set('f-ptype', ''); set('f-units', '');
  el('flip-results').style.display = 'none'; el('flip-firstlook').style.display = 'none';
  flip.analyzeFlip();
  return flip.getLastFlipResult();
}
function engine(f) {
  const n = (s) => FMT.parseComma(String(s));
  const ask = n(f.ask), arv = n(f.arv), rep = n(f.rep), hold = +(f.hold ?? 5) || 5, cc1 = (+(f.cc1 ?? 2) || 2) / 100, cc2 = (+(f.cc2 ?? 5) || 5) / 100;
  const carry = n(f.carry ?? '900') || 900, target = n(f.target ?? '40,000') || 40000, loan = f.loan ? n(f.loan) : 0, rate = (+(f.rate ?? 10) || 10) / 100, points = (+(f.points ?? 3) || 3) / 100;
  const self = !!f.self, financed = loan > 0;
  const c = FIN.computeFlip({ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self });
  const s = FIN.computeFlipStress({ ask, arv, rep, cc1, cc2, carry, hold, financed, loan, rate, points, target });
  const nego = FIN.flipNegotiationGuidance({ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self, target });
  const v = FIN.flipVerdict({ profit: c.profit, roi: c.roi, target, maxOffer: c.maxOffer, marginOfSafety: s.marginOfSafety, stressedProfit: s.stressedProfit, self, ask, nego });
  return { ...c, ...s, ...v };
}
const FIXTURES = [
  { name: 'strong, all-cash', ask: '185,000', arv: '340,000', rep: '60,000', carry: '2,900', target: '38,000' },
  { name: 'financed, mid', ask: '225,000', arv: '425,000', rep: '75,000', hold: '6', loan: '240,000', rate: '11', points: '2', target: '45,000' },
  { name: 'thin margin', ask: '250,000', arv: '340,000', rep: '40,000' },
  { name: 'works but misses the target (needs review)', ask: '200,000', arv: '300,000', rep: '40,000' },
  { name: 'stress fails (base positive)', ask: '280,000', arv: '360,000', rep: '30,000', carry: '1,500' },
  { name: 'loss', ask: '300,000', arv: '320,000', rep: '50,000' },
  { name: 'max offer ≤ 0', ask: '50,000', arv: '100,000', rep: '90,000' },
  { name: 'self-renovating', ask: '150,000', arv: '300,000', rep: '55,000', self: true },
  { name: 'zero buy cost falls back', ask: '185,000', arv: '340,000', rep: '60,000', cc1: '0' },
  { name: 'target exactly at profit boundary', ask: '185,000', arv: '340,000', rep: '60,000', carry: '2,900', target: '59,800' },
];
const KEYS = ['profit', 'roi', 'maxOffer', 'buyCost', 'sellCost', 'holdCost', 'cashIn', 'totalIn', 'stressedProfit', 'marginOfSafety', 'cls', 'verdict'];
const seenCls = new Set(), seenMos = new Set();
for (const f of FIXTURES) {
  const r = runFlip(f), e = engine(f);
  const diffs = r ? KEYS.filter(k => r[k] !== e[k]) : ['no result'];
  ok(diffs.length === 0, `D ${f.name}: analyzer result equals the canonical engine (${diffs.map(k => k + ' ' + (r && r[k]) + '≠' + e[k]).join('; ')})`);
  ok(el('flip-firstlook').style.display === '' && el('fl-lead').textContent.length > 0, `D ${f.name}: the quick read rendered`);
  if (r) { seenCls.add(r.cls); seenMos.add(r.marginOfSafety); }
}
ok(seenCls.has('hot') && seenCls.has('warm') && seenCls.has('pass'), 'D* fixtures cover all three verdicts (' + [...seenCls].join(',') + ')');
ok(seenMos.has('fails') && seenMos.has('strong'), 'D* fixtures cover stress failure and strong margin (' + [...seenMos].join(',') + ')');
{
  runFlip(FIXTURES[0]);
  const n = (k) => (el('fl-list').innerHTML.match(new RegExp(k, 'g')) || []).length;
  // No market preset runs in this harness, so the typed $38,000 target and
  // $2,900 hold cost are the user's entries; hold, buy, sell and financing are
  // the untouched defaults.
  ok(n('class="fl-src assumed"') === 4 && n('class="fl-src"') === 2 && /Financing/.test(el('fl-list').innerHTML) && /\$2,900\/mo/.test(el('fl-list').innerHTML),
     'D+ the rendered list marks exactly the 4 assumed rows and shows the hold cost the run used');
  ok(!/<script|onerror=/i.test(el('fl-list').innerHTML), 'D+ the rendered list is escaped text only');
  const before = fundingCalls; runFlip(FIXTURES[0]);
  ok(fundingCalls === before + 1, 'D+ the funding renderer is still called exactly once per analysis (gating untouched)');
  // validation abort: no result, no quick read
  el('flip-firstlook').style.display = 'none';
  const prev = flip.getLastFlipResult();
  runFlip({ ...FIXTURES[0], rate: '45', loan: '100,000' });
  ok(flip.getLastFlipResult() === prev && el('flip-firstlook').style.display === 'none' && el('flip-results').style.display === 'none', 'D+ an out-of-range input still blocks the run; no quick read renders');
  flip.resetFlip();
  ok(el('flip-firstlook').style.display === 'none' && flip.getLastFlipResult() === null, 'D+ resetFlip hides the quick read and drops the result');
}
console.log('— §D2 provenance across presets, adoption, reset and review (executed, real flip.js) ─');
{
  const rows = () => Object.fromEntries((el('fl-list').innerHTML.match(/<li>[\s\S]*?<\/li>/g) || []).map(li => {
    const t = li.replace(/<[^>]+>/g, '|').split('|').filter(Boolean); return [t[0], t[1]]; }));
  const fresh = (id, v) => { const e = el(id); e.value = v; delete e.dataset.userEdited; delete e.dataset.reviewPrefill; };
  ['f-hold', 'f-carry', 'f-target', 'f-cc1', 'f-cc2'].forEach(id => fresh(id, el(id).defaultValue));
  flip.setFlipPreset('charlotte-nc', null);
  const carryTxt = el('f-carry').value, targetTxt = el('f-target').value;
  set('f-ask', '185,000'); set('f-arv', '340,000'); set('f-rep', '60,000'); set('f-loan', ''); set('f-rate', '10'); set('f-points', '3'); el('self-reno').checked = false;
  el('flip-results').style.display = 'none'; flip.analyzeFlip();
  let r = rows();
  ok(carryTxt !== '900' && r['Monthly hold cost (excl. loan)'] === 'Market estimate' && r['Min Profit Target'] === 'Market estimate', 'D2-1 preset-written hold cost and target read "Market estimate" (' + carryTxt + ', ' + targetTxt + ')');
  // the market goes away and Clear & New Deal restores the HTML defaults (main.js writes them programmatically)
  fresh('f-carry', '900'); fresh('f-target', '40,000');
  el('flip-results').style.display = 'none'; flip.analyzeFlip(); r = rows();
  ok(r['Monthly hold cost (excl. loan)'] === 'DealFit default' && r['Min Profit Target'] === 'DealFit default', 'D2-2 after the preset values are gone the defaults read "DealFit default" (review M2, executed)');
  // adoption, then reset: the adopted marker must not survive
  flip.adoptDealFitTarget();
  const adoptedTxt = el('f-target').value; r = rows();
  ok(r['Min Profit Target'] === 'DealFit suggestion you adopted', 'D2-3 "Use DealFit midpoint" labels the target as the adopted suggestion (' + adoptedTxt + ')');
  ok(el('flip-guide').style.display === '', 'D2-4 the suggested-profit box is shown after an analysis');
  flip.resetFlip();
  ok(el('flip-guide').style.display === 'none', 'D2-5 resetFlip hides the suggested-profit box describing the previous deal (browser finding 3)');
  el('f-target').value = adoptedTxt; el('flip-results').style.display = 'none'; flip.analyzeFlip(); r = rows();
  ok(r['Min Profit Target'] !== 'DealFit suggestion you adopted', 'D2-6 after a reset the same target text is no longer called "adopted" (review L1, executed)');
  flip.adoptDealFitTarget(); flip.clearLastFlipResult();
  el('flip-results').style.display = 'none'; flip.analyzeFlip(); r = rows();
  ok(r['Min Profit Target'] !== 'DealFit suggestion you adopted', 'D2-7 entering a saved-deal review (clearLastFlipResult) also drops the adopted marker');
  // a review prefill: main.js reviewSetField marks userEdited + reviewPrefill
  for (const [id, v] of [['f-hold', '5'], ['f-carry', '2,900'], ['f-target', '31,000'], ['f-cc1', '2'], ['f-cc2', '5']]) { el(id).value = v; el(id).dataset.userEdited = '1'; el(id).dataset.reviewPrefill = '1'; }
  el('flip-results').style.display = 'none'; flip.analyzeFlip(); r = rows();
  ok(['Hold period', 'Monthly hold cost (excl. loan)', 'Min Profit Target', 'Buying costs', 'Selling costs'].every(k => r[k] === 'From your saved deal'), 'D2-8 review-prefilled values read "From your saved deal", never "Your entry" (review M1, executed)');
  ok(/5 values come from your saved deal/.test(el('fl-lead').textContent), 'D2-9 the lead asks the user to confirm the saved values');
  // independent review L2, executed: a review-prefilled loan and self-renovating toggle (main.js reviewDeal marks both)
  el('f-loan').value = '150,000'; el('f-loan').dataset.userEdited = '1'; el('f-loan').dataset.reviewPrefill = '1';
  el('self-reno').checked = true; el('self-reno').dataset.reviewPrefill = '1';
  el('flip-results').style.display = 'none'; flip.analyzeFlip(); r = rows();
  ok(r['Loan amount'] === 'From your saved deal' && r['Self-renovating labor'] === 'From your saved deal' && /\$150,000 \(est\.\)/.test(el('fl-list').innerHTML),
     'D2-10 a review-prefilled loan and self-renovating toggle read "From your saved deal"; the loan shows "(est.)" (executed)');
  delete el('self-reno').dataset.reviewPrefill; delete el('f-loan').dataset.reviewPrefill;
  el('flip-results').style.display = 'none'; flip.analyzeFlip(); r = rows();
  ok(r['Loan amount'] === 'Your entry' && r['Self-renovating labor'] === 'Your entry', 'D2-11 once the user toggles / retypes them they read "Your entry"');
  el('f-loan').value = ''; delete el('f-loan').dataset.userEdited; el('self-reno').checked = false;
  ['f-hold', 'f-carry', 'f-target', 'f-cc1', 'f-cc2'].forEach(id => fresh(id, el(id).defaultValue));
}

// ── §E reveal opens a collapsed section ─────────────────────────────────────
console.log('— §E a blocking field inside a collapsed section is revealed ─');
{
  const section = { open: false };
  const f = el('f-rate'); const focus = []; f.closest = (sel) => sel === 'details' ? section : null; f.focus = (o) => focus.push(o);
  FMT.revealBlockingField('f-rate', 'Loan rate: must be between 0% and 30%.', 'flip', 'f-rate-issue');
  ok(section.open === true && focus.length === 1 && f.attrs['aria-invalid'] === 'true', 'E1 the section opens before the field is scrolled to and focused');
  const g = el('f-ask'); g.closest = () => null; let focused = 0; g.focus = () => { focused++; };
  FMT.revealBlockingField('f-ask', 'Required — enter Purchase Price', 'flip');
  ok(focused === 1, 'E2 a field outside any section reveals exactly as before');
  FMT.clearBlockingMarks('flip');
  // review L3: every blocking field's section opens, not only the revealed one
  const sCarry = { open: false }, sLoan = { open: false }, sRate = { open: false };
  el('f-carry').closest = (q) => q === 'details' ? sCarry : null;
  el('f-loan').closest = (q) => q === 'details' ? sLoan : null;
  el('f-rate').closest = (q) => q === 'details' ? sRate : null;
  FMT.markBlockingField(el('f-carry'), 'flip');
  ok(sCarry.open === true, 'E3 a blocking field that is not the revealed one still gets its section opened (markBlockingField)');
  FMT.renderInputIssues('flip', [{ field: 'f-rate', label: 'Loan rate', message: 'x' }, { field: 'f-loan', label: 'Loan', message: 'y' }], []);
  ok(sRate.open === true && sLoan.open === true, 'E4 renderInputIssues opens the section of every erroring field');
  FMT.clearBlockingMarks('flip');
  ['f-carry', 'f-loan', 'f-rate'].forEach(id => { el(id).closest = () => null; });
}

// ── §F scope guards ──────────────────────────────────────────────────────────
console.log('— §F scope: engine, thresholds, billing and other analyzers untouched ─');
{
  const flipSrc = src('docs/src/js/flip.js');
  ok(/computeFlip\(\{ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self \}\)/.test(flipSrc) && /computeFlipStress\(\{/.test(flipSrc) && /flipVerdict\(\{/.test(flipSrc),
     'F1 flip.js still runs the canonical engine calls');
  ok(!/function compute[A-Z]\w*\(/.test(flipSrc.slice(flipSrc.indexOf('DF-P1 Mobile') > -1 ? flipSrc.indexOf('DF-P1 Mobile') : flipSrc.indexOf('DF-P1 mobile'))), 'F2 the DF-P1 code defines no compute* function (no second engine)');
  ok(/const target = parseComma\(document\.getElementById\('f-target'\)\.value\) \|\| 40000;/.test(flipSrc), 'F3 the analyzer\'s $40,000 target fallback is unchanged');
  ok(!/details/.test(src('docs/src/js/rental.js') + src('docs/src/js/ltr.js') + src('docs/src/js/brrr.js')), 'F4 STR / LTR / BRRRR analyzers carry no DF-P1 change');
}

console.log(`\ndfp1: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
