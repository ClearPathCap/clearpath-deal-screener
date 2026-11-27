// signinsheet — DF-SIGNIN-SHEET (2026-11-27): the sign-in / create-account sheet, presentation only.
// Owner observation (C2 real-iPhone UAT, 2026-11-26): crowded, sits too high, too many words.
// What changed: a one-line reason to sign in; a visible label and hint on the email field and a visible
// label on the code field; one filled (primary) button per step; the paid plans folded behind one quiet
// "Compare paid plans" control while signed out; the phone sheet presentation every other sheet uses;
// the sheet joins the focus law (sheetfocus.js). What must NOT change: sign-in, the emailed code, session
// persistence, account isolation, the pending save, checkout confirmation, prices, plan copy, tier law.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const html = rd('docs/index.html'), css = rd('docs/src/css/styles.css'), mj = rd('docs/src/js/main.js'), sf = rd('docs/src/js/sheetfocus.js');
const fnBody = (src, name) => { let i = src.indexOf('\nfunction ' + name + '('); if (i < 0) i = src.indexOf('\nasync function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\n}\n', i + 1); return src.slice(i + 1, j + 2); };
const sheet = html.slice(html.indexOf('id="modal-upgrade"'), html.indexOf('id="modal-market-confirm"'));
const pos = (s) => sheet.indexOf(s);

console.log('— §A labels and words —');
ok(/<label class="sheet-field-label" id="signin-label" for="signin-email">Email<\/label>/.test(sheet) && pos('id="signin-label"') < pos('id="signin-email"'),
   'A1 #signin-email has a visible label (not placeholder-only, not screen-reader-only), above the field');
ok(/id="signin-email"[^>]*aria-describedby="signin-hint"/.test(sheet) && /<p id="signin-hint" class="signin-hint">No password\. We'll email you a code to sign in\.<\/p>/.test(sheet),
   'A2 one short hint says what happens next, and the field points to it');
ok(/<label class="sheet-field-label" for="redeem-code-input">Have a code\?<\/label>/.test(sheet) && pos('for="redeem-code-input"') < pos('id="redeem-code-input"'),
   'A3 #redeem-code-input has a visible label, in the same sentence-case style as Email');
ok(/<label for="signin-code" class="sr-only">Sign-in code from your email<\/label>/.test(sheet) && /id="signin-code-title" class="signin-code-title" hidden>Enter the code from your email</.test(sheet),
   'A4 the code field keeps its name and the visible heading of its step');
ok(!/Free account — we'll email you a sign-in code/.test(html), 'A5 the uppercase "Free account — we\'ll email you a sign-in code" line is gone (the title already says free)');
{ const m = mj.match(/subhead:\s*'Save the deals you analyze and pick them up on any device\.'/);
  ok(!!m && !/Your pipeline lives with your free account\. Sign in or create one/.test(mj), 'A6 the signed-out subhead is one line on what the account is for'); }

console.log('— §B one primary action per step —');
const acct = sheet.slice(pos('id="account-block"'), pos('id="redeem-block"'));
const redeem = sheet.slice(pos('id="redeem-block"'), pos('class="modal-actions"'));
ok((acct.match(/class="btn-redeem btn-redeem-fixed"/g) || []).length === 2, 'B1 the email step and the code step each have one filled button (Send code / Verify), unchanged');
ok(/<button class="btn-redeem btn-redeem-quiet" onclick="redeemTierCode\(\)">Redeem<\/button>/.test(redeem), 'B2 Redeem is a quiet secondary button (same action)');
ok(/\.btn-redeem-quiet\{background:var\(--surface2\);border:1px solid var\(--border-strong\);color:var\(--text\)\}/.test(css) && css.indexOf('.btn-redeem-quiet{') > css.indexOf('.btn-redeem{'),
   'B3 the quiet style is declared after .btn-redeem so it wins (not accent-filled)');
ok(/<button type="button" class="plans-toggle" id="upgrade-plans-toggle" aria-expanded="false" aria-controls="upgrade-plans-lead upgrade-compare" onclick="togglePaidPlans\(\)">Compare paid plans<\/button>/.test(sheet)
   && pos('id="upgrade-subhead"') < pos('id="upgrade-plans-toggle"') && pos('id="upgrade-plans-toggle"') < pos('id="upgrade-plans-lead"'),
   'B4 one quiet, labelled disclosure button precedes the plans lead-in and cards it controls');
ok(/\.modal-upgrade\.account-first:not\(\.plans-open\) #upgrade-plans-lead,\.modal-upgrade\.account-first:not\(\.plans-open\) #upgrade-compare\{display:none!important\}/.test(css),
   'B5 signed out, the plans (funding lead-in + cards) are folded until opened — the lead-in always travels with the cards');
ok(/\.plans-toggle\{display:none;/.test(css) && /\.modal-upgrade\.account-first \.plans-toggle\{display:flex\}/.test(css), 'B6 the control exists only in the signed-out view; signed in, the plans show as before');
ok(/\.signin-focus #signin-hint,\.signin-focus #upgrade-plans-toggle\{display:none!important\}/.test(css), 'B7 while a code is pending the hint and the plans control leave the code-only view');

console.log('— §C phone presentation —');
ok(!/:not\(#modal-upgrade\)/.test(css), 'C1 the sign-in sheet is no longer excluded from the phone sheet rules');
{ const phone = css.slice(css.indexOf('@media (max-width:600px){\n  .modal-backdrop{align-items:flex-end'), css.indexOf('@media (max-width:600px){\n  .modal-backdrop{align-items:flex-end') + 4000);
  ok(/body\.kb-open #modal-upgrade\{align-items:flex-start\}/.test(phone.slice(0, phone.indexOf('\n}'))),
     'C1b with the phone keyboard up (body.kb-open) the sheet rises to the top, so its field stays above the keyboard (review M1)'); }
{ const phone = css.slice(css.indexOf('@media (max-width:600px){\n  .modal-backdrop{align-items:flex-end'));
  ok(phone.length > 0 && /#modal-maxoffer \.modal-actions,#modal-upgrade \.modal-actions\{bottom:calc\(-22px - var\(--safe-bottom\)\);padding-bottom:calc\(14px \+ var\(--safe-bottom\)\)\}/.test(phone),
     'C2 on a phone the sheet rises from the bottom and its sticky "Not Now" row clears the home indicator'); }
{ const narrow = (css.match(/@media \(max-width:480px\)\{[\s\S]*?\n\}/g) || []).find(b => b.includes('#signin-email,#signin-code{font-size:16px}')) || '';
  ok(/#signin-email,#signin-email-step \.btn-redeem-fixed,#signin-code-step \.btn-redeem-fixed\{height:48px\}/.test(narrow) && /#signin-email,#signin-code\{font-size:16px\}/.test(narrow),
     'C3 on a narrow phone the field and its button are 48px tall; 16px text still prevents iOS zoom'); }
ok(/\.signin-help \.signin-sent\{display:block\}/.test(css) && /<span class="signin-sent">Sent to <strong id="signin-sent-to"><\/strong><\/span><span class="signin-actions">/.test(sheet),
   'C4 the code step\'s helper reads as two lines: where the code went, then its two actions');

console.log('— §D keyboard and screen readers —');
ok(/class="modal modal-upgrade" id="upgrade-modal-body" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title"/.test(html), 'D1 the sheet is announced as a modal dialog named by its title');
ok(/export const FOCUS_EXCLUDED = new Set\(\);/.test(sf), 'D2 the sheet is in the focus law: focus moves in, Tab stays in, focus returns to the opener (executed in designsystem F19)');
{ const k = fnBody(mj, 'keepSheetFocus');
  ok(/getClientRects\(\)\.length > 0\) return;/.test(k) && /sheet\.focus\(\{ preventScroll: true \}\)/.test(k) && !/\.select\(|signin-email|signin-code/.test(k),
     'D3 a control the sheet just hid hands focus to the sheet itself, never to a text field (no keyboard pops up)');
  ok(/openModal\('modal-upgrade'\);\n\s*keepSheetFocus\(\);/.test(fnBody(mj, 'openUpgrade')) && /configureUpgradeModal\(_lastUpgradeTrigger\); keepSheetFocus\(\);/.test(fnBody(mj, 'refreshSheetAfterSignIn')),
     'D4 ... after every open and after sign-in completes with the sheet open'); }
ok(/onkeydown="if\(event\.key==='Enter'\)sendSignInCode\(\)"/.test(acct) && /onkeydown="if\(event\.key==='Enter'\)verifySignInCode\(\)"/.test(acct) && /onkeydown="if\(event\.key==='Enter'\)redeemTierCode\(\)"/.test(redeem),
   'D5 Enter still submits each field');

console.log('— §E behaviour of the new helpers (real functions, fake page) —');
{ const names = ['setPaidPlansOpen', 'togglePaidPlans', 'keepSheetFocus', 'applyAccountPriority'];
  const src = names.map(n => fnBody(mj, n)).join('\n');
  ok(names.every(n => fnBody(mj, n)), 'E0 the helpers exist');
  const mkDoc = () => {
    const els = {};
    const mk = (id, extra = {}) => { const cls = new Set(); const attrs = {}; const e = { id, parentNode: null, children: [], visible: true,
      classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); return !!on; }, contains: (c) => cls.has(c) },
      setAttribute(a, v) { attrs[a] = String(v); }, getAttribute: (a) => (a in attrs ? attrs[a] : null), hasAttribute: (a) => a in attrs, attrs,
      getClientRects() { return e.visible ? [1] : []; }, focus() { doc.activeElement = e; },
      contains(x) { for (let n = x; n; n = n.parentNode) if (n === e) return true; return false; },
      insertBefore(node, ref) { const kids = e.children; const from = kids.indexOf(node); if (from > -1) kids.splice(from, 1); kids.splice(kids.indexOf(ref), 0, node); node.parentNode = e; },
      ...extra }; return (els[id] = e); };
    const doc = { activeElement: null, getElementById: (id) => els[id] || null };
    const shell = mk('upgrade-modal-body');
    for (const id of ['upgrade-modal-title', 'upgrade-subhead', 'upgrade-plans-toggle', 'upgrade-plans-lead', 'upgrade-compare', 'upgrade-toptier-note', 'manage-sub-btn', 'account-block', 'redeem-block']) {
      const c = mk(id); c.parentNode = shell; shell.children.push(c);
    }
    return { doc, els, shell, order: () => shell.children.map(c => c.id) };
  };
  const make = (doc) => new Function('document', src + '\nreturn { ' + names.join(', ') + ' };')(doc);
  { const { doc, els, shell } = mkDoc(); const f = make(doc);
    f.setPaidPlansOpen(false);
    ok(!shell.classList.contains('plans-open') && els['upgrade-plans-toggle'].getAttribute('aria-expanded') === 'false', 'E1 folded: no plans-open class, aria-expanded="false"');
    f.togglePaidPlans();
    ok(shell.classList.contains('plans-open') && els['upgrade-plans-toggle'].getAttribute('aria-expanded') === 'true', 'E2 one tap opens the plans and says so');
    f.togglePaidPlans();
    ok(!shell.classList.contains('plans-open') && els['upgrade-plans-toggle'].getAttribute('aria-expanded') === 'false', 'E3 a second tap folds them again'); }
  { const { doc, order } = mkDoc(); const f = make(doc);
    f.applyAccountPriority(true);
    ok(order().join(',') === 'upgrade-modal-title,upgrade-subhead,account-block,upgrade-plans-toggle,upgrade-plans-lead,upgrade-compare,upgrade-toptier-note,manage-sub-btn,redeem-block',
       'E4 signed out, the free account sits under the title and subhead, above the whole plans group');
    f.applyAccountPriority(false);
    ok(order().join(',') === 'upgrade-modal-title,upgrade-subhead,upgrade-plans-toggle,upgrade-plans-lead,upgrade-compare,upgrade-toptier-note,manage-sub-btn,account-block,redeem-block',
       'E5 signed in, the authored order returns exactly'); }
  { const { doc, els, shell } = mkDoc(); const f = make(doc);
    const btn = els['upgrade-compare']; btn.visible = false; doc.activeElement = btn;
    f.keepSheetFocus();
    ok(doc.activeElement === shell && shell.getAttribute('tabindex') === '-1', 'E6 focus on a control the sheet just hid moves to the sheet');
    const vis = els['upgrade-plans-toggle']; doc.activeElement = vis; f.keepSheetFocus();
    ok(doc.activeElement === vis, 'E7 focus on a visible control is left alone');
    const outside = { id: 'page-button', parentNode: null, getClientRects: () => [] }; doc.activeElement = outside; f.keepSheetFocus();
    ok(doc.activeElement === outside, 'E8 focus outside the sheet is never touched'); }
}
ok(/applyAccountPriority\(layout\.accountFirst\);\n(\s*\/\/[^\n]*\n)*\s*setPaidPlansOpen\(_lastUpgradeTrigger === 'region'\);/.test(fnBody(mj, 'configureUpgradeModal')),
   'E9 every open folds the plans, except a paid-feature tap (trigger \'region\'), which opens them (review L1)');
ok(/togglePaidPlans,/.test(mj.slice(mj.indexOf('Object.assign(window, {'))), 'E10 the control\'s handler is published for its onclick');

console.log('— §F what must not change (vs live 66bfeec) —');
const BASE = '66bfeec';
let have = false; try { execFileSync('git', ['-C', root, 'cat-file', '-e', BASE + '^{commit}'], { stdio: 'ignore' }); have = true; } catch {}
if (have) {
  const show = (p) => execFileSync('git', ['-C', root, 'show', BASE + ':' + p], { encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\r\n/g, '\n');
  const changed = execFileSync('git', ['-C', root, 'diff', '--name-only', BASE, '--', 'docs', 'supabase', 'native'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const ALLOWED = ['docs/index.html', 'docs/src/css/styles.css', 'docs/src/js/main.js', 'docs/src/js/sheetfocus.js'];
  ok(changed.every(f => ALLOWED.includes(f)), 'F1 only the sheet\'s markup, CSS, main.js and sheetfocus.js differ from 66bfeec — auth.js, signinCode.js, supabaseClient.js, sessionStore.js, resumeIntent.js, payments, tiers, storage, pipeline, engines, Supabase and the native shell are byte-identical (' + changed.filter(f => !ALLOWED.includes(f)).join(', ') + ')');
  const bmj = show('docs/src/js/main.js');
  const SAME = ['sendSignInCode', 'resendSignInCode', 'changeSignInEmail', 'verifySignInCode', 'applyPastedCode', 'wireSigninCodeField', 'resumePendingSignIn', 'showLinkNotice',
    'takeAuthLinkFromUrl', 'showPendingAuthLink', 'finishLinkSignIn', 'doSignOut', 'updateAccountUI', 'setSigninFocus', 'codeStepOpen', 'closeCodeStep', 'showCodeStep',
    'renderResendState', 'resetStaleCodeStep', 'cancelResume', 'cancelResumeAndPlan', 'armResumeAfterSignIn', 'resumeAfterSignIn', 'continuePlanCheckout', 'renderPlanContinue',
    'startCheckout', 'manageSubscription', 'redeemTierCode', 'openModal', 'closeModal', 'authChipUI', 'handleAuthChipClick', 'refreshTierUI', 'saveDeal'];
  const diffFns = SAME.filter(n => fnBody(bmj, n) !== fnBody(mj, n));
  ok(diffFns.length === 0, 'F2 every sign-in, code, session, resume, checkout, redeem and sheet open/close function is byte-identical to 66bfeec (' + diffFns.join(', ') + ')');
  { const b = fnBody(bmj, 'configureUpgradeModal').split('\n'), c = fnBody(mj, 'configureUpgradeModal').split('\n');
    const added = c.filter(l => !b.includes(l)), removed = b.filter(l => !c.includes(l));
    const code = added.filter(l => !/^\s*\/\//.test(l));
    ok(removed.length === 0 && code.length === 2 && /^\s*setPaidPlansOpen\(_lastUpgradeTrigger === 'region'\);/.test(code[0])
       && code[1].trim() === "if (plansLead) { plansLead.textContent = PAID_PLANS_LEAD; plansLead.style.display = ''; }",
       'F3 configureUpgradeModal gains exactly two statements (fold or open the plans; the funding sentence on the remembered-plan sheet) and loses none'); }
  { const b = fnBody(bmj, 'upgradeModalLayout'), c = fnBody(mj, 'upgradeModalLayout');
    const strip = (s) => s.replace(/\n\s*\/\/ DF-SIGNIN-SHEET[^\n]*/, '').replace(/subhead:\s*'[^']*',/, "subhead: '',");
    ok(strip(b.replace(/subhead:\s*'Your pipeline[^']*',/, "subhead: '',")) === strip(c), 'F4 upgradeModalLayout changes only the signed-out subhead (titles, plans lead-in, ordering flag unchanged)'); }
  { const tag = (h, id) => (h.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>')) || [''])[0];
    const bh = show('docs/index.html');
    ok(tag(bh, 'signin-email').replace(' aria-describedby="signin-hint"', '') === tag(html, 'signin-email') .replace(' aria-describedby="signin-hint"', '') && tag(html, 'signin-email').includes('aria-describedby="signin-hint"'),
       'F5 the email field keeps every attribute (type, autocomplete="email", inputmode, Enter) — it only gains its hint');
    ok(tag(bh, 'signin-code') === tag(html, 'signin-code') && tag(bh, 'redeem-code-input') === tag(html, 'redeem-code-input'),
       'F6 the code field (autocomplete="one-time-code", numeric) and the redeem field are byte-identical');
    const cmp = (h) => h.slice(h.indexOf('id="upgrade-compare"'), h.indexOf('id="upgrade-toptier-note"'));
    ok(cmp(bh) === cmp(html), 'F7 prices, plan lines, the BEST VALUE badge and both Subscribe actions are byte-identical'); }
  { const bsf = show('docs/src/js/sheetfocus.js');
    const code = (s) => s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    ok(code(bsf).replace("new Set(['modal-upgrade'])", 'new Set()') === code(sf), 'F8 sheetfocus.js changes only the exclusion list (now empty) and its comment'); }
} else {
  ok(true, 'F1–F8 skipped: 66bfeec not in this clone');
}
ok(/funding stays free on every tier/.test(mj) && /const PAID_PLANS_LEAD =/.test(mj), 'F9 the funding sentence still travels with the plans');

console.log(`\nsigninsheet: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
