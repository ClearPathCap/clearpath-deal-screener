// otpfocus — iPhone UAT follow-up to N1124 (owner, real iPhone + Gmail, 2026-11-24).
// Owner-observed: the email arrived; no code suggestion appeared; the keyboard offered AutoFill
// Contact and saved email addresses; copying the code from the Gmail notification was awkward.
// Causes in source: the code box was focused only AFTER the send request returned (iOS Safari
// ignores focus outside the tap, so the keyboard stayed on the email box), and the email box,
// plan cards and "Have a code?" box stayed on screen during code entry.
// Pure rules (signinCode.js) are executed; UI wiring is pinned in source and exercised in the
// browser check recorded with this change.
import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const S = await import('../docs/src/js/signinCode.js');
const mj = rd('docs/src/js/main.js'), idx = rd('docs/index.html'), css = rd('docs/src/css/styles.css');
const fnBody = (name) => { let i = mj.indexOf('\nfunction ' + name + '('); if (i < 0) i = mj.indexOf('\nasync function ' + name + '('); if (i < 0) return ''; const j = mj.indexOf('\n}\n', i + 1); return mj.slice(i + 1, j + 2); };

console.log('— §P pure rules ─');
ok(S.looksLikeEmail('aaron@example.com') && S.looksLikeEmail('  a.b+x@sub.example.co  ') && !S.looksLikeEmail('aaron@example') && !S.looksLikeEmail('aaron example.com')
   && !S.looksLikeEmail('') && !S.looksLikeEmail(null) && !S.looksLikeEmail('a@b.c'), 'P1 an obviously incomplete address is caught before anything is sent');
ok(S.clipboardReadable({ clipboard: { readText() {} } }, true) && !S.clipboardReadable({ clipboard: { readText() {} } }, false) && !S.clipboardReadable({ clipboard: {} }, true)
   && !S.clipboardReadable({}, true) && !S.clipboardReadable(null, true), 'P2 "Paste code" is offered only where the browser can read the clipboard (secure context + readText)');
{ const a = S.codeSentMessage('a@local.test', true), b = S.codeSentMessage('a@local.test', false);
  ok(a.includes('a@local.test') && /tap Paste code/.test(a) && /press and hold the box and tap Paste/.test(b) && /or type it/.test(a) && /or type it/.test(b),
     'P3 the sent message names the address and the one next step (Paste code, or press-and-hold Paste where the button is not offered)');
  ok(![a, b, S.PASTE_NO_CODE_MSG, S.PASTE_UNREADABLE_MSG].some(m => /suggest|keyboard|automatic|AutoFill/i.test(m)), 'P4 no message promises an iPhone keyboard suggestion (outside DealFit’s control)');
}

console.log('— §F focus on the tap (iOS Safari) ─');
{ const send = fnBody('sendSignInCode');
  const focusAt = send.indexOf('showCodeStep(email, Date.now());\n  input?.focus();'), awaitAt = send.indexOf('await sendOtpCode(email)');
  ok(focusAt > 0 && awaitAt > 0 && focusAt < awaitAt, 'F1 the code step opens and the code box takes focus INSIDE the tap, before the send request');
  ok(!/await[\s\S]*input\?\.focus\(\)/.test(send.slice(awaitAt)) , 'F2 nothing relies on focusing the code box after the network call');
  ok(/if \(!looksLikeEmail\(email\)\) \{[^\n]*return; \}/.test(send) && send.indexOf('looksLikeEmail(email)') < awaitAt, 'F3 an incomplete address never opens the code step or sends');
  ok(/else if \(wasOnCodeStep && readPending\(_signinStore\)\) \{[\s\S]*?_codeSentAt = prevSentAt;[\s\S]*?\} else \{\s*closeCodeStep\(\);/.test(send),
     'F4 a failed first send returns to the email step; a failed RESEND keeps the code step (the earlier code may still work)');
  ok(/if \(wait > 0\) \{[^}]*showCodeStep\(pend\.email, pend\.sentAt\); input\?\.focus\(\);/.test(send) && send.indexOf('if (wait > 0)') < send.indexOf('_sendInFlight = true'),
     'F5 "Send code" again inside the cooldown sends nothing and goes back to the code step');
}

console.log('— §V a focused code step ─');
{ const rule = (css.match(/\.signin-focus #upgrade-modal-title[^{]*\{display:none!important\}/) || [''])[0];
  ok(['#upgrade-modal-title', '#upgrade-subhead', '#upgrade-plans-lead', '#upgrade-compare', '#upgrade-toptier-note', '#manage-sub-btn', '#redeem-block', '#signin-label', '#signin-email-step']
     .every(id => rule.includes('.signin-focus ' + id)), 'V1 while a code is pending the sheet hides the title, plan pitch, plan cards, "Have a code?" box and the email box');
  ok(/\.signin-focus #signin-code\{[^}]*font-size:20px/.test(css) && /\.signin-paste\[hidden\]\{display:none\}|\.signin-code-title\[hidden\],\.signin-paste\[hidden\]\{display:none\}/.test(css), 'V2 the code box is large on the focused step; hidden controls stay hidden');
  ok(/<h4 id="signin-code-title" class="signin-code-title" hidden>/.test(idx) && /<button type="button" class="btn-redeem signin-paste" id="signin-paste-btn" hidden onclick="pasteSignInCode\(\)">Paste code<\/button>/.test(idx),
     'V3 markup: the step heading and "Paste code" are hidden until the code step opens');
  ok(/id="signin-code" inputmode="numeric" pattern="\[0-9\]\*" autocomplete="one-time-code"/.test(idx) && /id="signin-email" [^>]*autocomplete="email"/.test(idx),
     'V4 the field hints are unchanged (one-time-code on the code box; email only on the email box)');
  const focus = fnBody('setSigninFocus');
  ok(/classList\.toggle\('signin-focus', !!on\)/.test(focus) && /emailStep\.style\.display = on \? 'none' : ''/.test(focus) && /paste\.hidden = !\(on && canPasteCode\(\)\)/.test(focus),
     'V5 one switch drives the focused view (also hides the email row inline, so it holds without the stylesheet)');
  const upd = fnBody('updateAccountUI');
  ok(/if \(!signedIn && !readPending\(_signinStore\) && !_sendInFlight\) \{\s*closeCodeStep\(\);/.test(upd) && /if \(signedIn\) \{[^}]*setSigninFocus\(false\);/.test(upd),
     'V6 an auth refresh mid-send never hides the step; signing in ends the focused view');
  ok(/function changeSignInEmail\(\) \{\s*_sendGen\+\+;[^\n]*\n\s*clearPending\(_signinStore\);\s*closeCodeStep\(\);/.test(mj), 'V7 "Use a different email" leaves the focused view');
  ok(S.clipboardLooksLikeCode('482913') && S.clipboardLooksLikeCode(' 482 913 ') && S.clipboardLooksLikeCode('Your DealFit code is 482913.') && S.clipboardLooksLikeCode('Verification: 4829-1377')
     && !S.clipboardLooksLikeCode('Account 48291377') && !S.clipboardLooksLikeCode('Call 704 555 0101') && !S.clipboardLooksLikeCode('2026-11-24') && !S.clipboardLooksLikeCode('')
     && !S.clipboardLooksLikeCode('Zip code 28202, call 7045551234') && S.clipboardLooksLikeCode('Your code is 482 913. Sent 2026-11-24.'),
     'P5 review R4: the button auto-verifies only text that is a code, or names one (and the named number is the one picked)');
  ok(!/suggested above your keyboard/.test(mj), 'V8 the old message that promised a keyboard suggestion is gone');
}

console.log('— §C "Paste code" ─');
{ const paste = fnBody('pasteSignInCode'), apply = fnBody('applyPastedCode');
  ok(/navigator\.clipboard\.readText\(\)/.test(paste) && (mj.match(/clipboard\.readText\(/g) || []).length === 1, 'C1 the clipboard is read in exactly one place: the "Paste code" tap');
  ok(!/console\.|localStorage|sessionStorage|writePending|fetch\(/.test(paste + apply), 'C2 copied text is never logged, stored or sent; only the extracted code goes into the box');
  ok(/catch \{ showRedeemMsg\(msgEl, \{ ok: false, msg: PASTE_UNREADABLE_MSG \}\); return; \}/.test(paste) && /if \(!canPasteCode\(\)\)/.test(paste), 'C3 a refused or unsupported clipboard falls back to press-and-hold Paste');
  ok(/applyPastedCode\(text, false\);/.test(mj) && /applyPastedCode\(text == null \? '' : String\(text\), true\);/.test(paste), 'C4 the field paste and the button share one rule (F2 caret insertion for the field)');
  ok(/if \(_verifyInFlight\) return;/.test(paste) && /if \(confident \|\| !looksComplete\(code\)\) verifySignInCode\(\{ auto: true \}\);/.test(apply), 'C5 one verification at a time; an ambiguous copy never auto-verifies');
  ok(/\n  pasteSignInCode,\n/.test(mj), 'C6 the button handler is exposed to the inline onclick');
}

console.log('— §H the sheet after sign-in ─');
{ const r = fnBody('refreshSheetAfterSignIn');
  ok(/if \(!isSignedIn\(\)\) return;/.test(r) && /classList\?\.contains\('active'\)\) configureUpgradeModal\(_lastUpgradeTrigger\);/.test(r)
     && /setSigninFocus\(false\); refreshSheetAfterSignIn\(\); \}/.test(fnBody('updateAccountUI')),
     'H1 every signed-in refresh re-configures the open sheet (review R6: also after a late or failed plan check), so no "Sign in or create" heading sits above "Signed in as"');
}

console.log('— §L no session from the page address (login CSRF) ─');
{ const sc = rd('docs/src/js/supabaseClient.js');
  ok(/detectSessionInUrl: false,/.test(sc) && !/detectSessionInUrl: true/.test(sc), 'L1 the SDK never takes a session from the page address (implicit-flow #access_token links are not honoured)');
  const crafted = 'https://x.test/?tool=flip#access_token=aaa.bbb.ccc&refresh_token=rt&expires_in=3600&token_type=bearer&type=magiclink';
  ok(S.hasAuthLinkParams(crafted) && S.stripAuthLink(crafted) === '/?tool=flip' && S.stripAuthLink('https://x.test/#error=access_denied&error_code=otp_expired&error_description=x') === '/'
     && S.stripAuthLink('https://x.test/#keep=1&access_token=a.b.c') === '/#keep=1' && !S.hasAuthLinkParams('https://x.test/#type=flip') && S.stripAuthLink('https://x.test/#type=flip') === '/#type=flip',
     'L2 session tokens (and a provider error) are removed from the address without being used; unrelated fragments are kept');
  ok(S.AUTH_LINK_ENABLED === false, 'L3 the emailed-link path stays switched off');
  ok(S.stripAuthLink('https://x.test/#/route&access_token=a.b.c') === '/#/route' && S.stripAuthLink('https://x.test/?tool=flip&error=access_denied&error_code=otp_expired&error_description=x') === '/?tool=flip'
     && S.hasAuthLinkParams('https://x.test/?error=x&error_code=otp_expired'), 'L4 review R9: a non key=value fragment is kept byte for byte; a query-form provider error is removed too');
}

{ const L = S.sessionLinkKind;
  ok(L('https://x.test/#access_token=a.b.c&refresh_token=r&type=magiclink') === 'session' && L('https://x.test/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid') === 'error'
     && L('https://x.test/?error=x&error_code=otp_expired') === 'error' && L('https://x.test/#keep=1') === null && L('https://x.test/?tool=flip') === null && L('not a url') === null,
     'L5 a Supabase sign-in link (session or expired-link error) is recognised before its token is removed');
  const t = fnBody('takeAuthLinkFromUrl'), n = fnBody('showLinkNotice');
  ok(t.indexOf('_linkNotice = sessionLinkKind(href);') > 0 && t.indexOf('_linkNotice = sessionLinkKind(href);') < t.indexOf('history.replaceState')
     && /if \(!kind \|\| isSignedIn\(\)\) return false;/.test(n) && /LINK_NOT_USED_MSG/.test(n) && /if \(!p\) return showLinkNotice\(\);/.test(fnBody('resumePendingSignIn'))
     && !/verifyOtp|setSession|getSessionFromUrl/.test(n), 'L6 an opened sign-in link is explained ("use the code") instead of a silent signed-out landing; its token is never used; nothing shows when already signed in');
  ok(S.extractOtp('Your DealFit code is 4829 1377').code === '48291377' && S.extractOtp('48291377').confident && S.clipboardLooksLikeCode('4829 1377')
     && S.clipboardLooksLikeCode('Your Deal Screener sign-in code is 48291377') && S.looksComplete('48291377'),
     'L7 the LIVE code length is 8 (auth.email.otp_length, read 2026-11-24): 8-digit codes, plain or split 4+4, are found, complete and auto-verify');
}

console.log('— §B behaviour: the real sign-in functions from main.js against a fake page (review R7) ─');
{ const names = ['showRedeemMsg', 'canPasteCode', 'setSigninFocus', 'refreshSheetAfterSignIn', 'codeStepOpen', 'closeCodeStep', 'showCodeStep', 'renderResendState',
                 'sendSignInCode', 'resendSignInCode', 'changeSignInEmail', 'verifySignInCode', 'applyPastedCode', 'pasteSignInCode', 'openUpgrade', 'resetStaleCodeStep'];
  const src = names.map(n => { const b = fnBody(n); if (!b) throw new Error('missing ' + n); return b; }).join('\n');
  function harness() {
    const els = {}, log = [];
    const doc = { activeElement: null, getElementById(id) { return els[id] || (els[id] = mk(id)); } };
    function mk(id) { const cls = new Set(); const e = { id, style: { display: '' }, hidden: false, value: '', textContent: '', className: '', dataset: {},
      classList: { toggle(c, on) { if (on) cls.add(c); else cls.delete(c); return !!on; }, contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
      focus() { doc.activeElement = e; log.push('focus:' + id); }, select() {}, setSelectionRange() {}, setAttribute() {}, removeAttribute() {}, selectionStart: null, selectionEnd: null }; return e; }
    for (const id of ['signin-code-step', 'signin-code-help']) doc.getElementById(id).style.display = 'none';
    doc.getElementById('modal-upgrade').classList.add('active');
    const mem = {}; const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const st = { signedIn: false, sends: [], verifies: [], configured: [], clip: '' };
    const deferred = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
    const env = {
      document: doc, window: { isSecureContext: true }, navigator: { clipboard: { readText: async () => st.clip } },
      isSignedIn: () => st.signedIn,
      sendOtpCode: (email) => { const d = deferred(); st.sends.push({ email, focusAtSend: doc.activeElement && doc.activeElement.id, d }); log.push('send:' + email); return d.p; },
      verifyOtpCode: async (email, code) => { st.verifies.push(code); return code === '000000' ? { ok: false, msg: 'That code didn’t work' } : { ok: true, msg: 'Signed in' }; },
      configureUpgradeModal: (t) => { st.configured.push(t); st.api.resetStaleCodeStep(); }, openModal: () => {},
      _signinStore: store, setInterval: () => 0, clearInterval: () => {},
      extractOtp: S.extractOtp, normalizeOtp: S.normalizeOtp, looksComplete: S.looksComplete, looksLikeEmail: S.looksLikeEmail, clipboardReadable: S.clipboardReadable,
      codeSentMessage: S.codeSentMessage, readPending: S.readPending, writePending: S.writePending, clearPending: S.clearPending, resendWaitSeconds: S.resendWaitSeconds,
      PASTE_NO_CODE_MSG: S.PASTE_NO_CODE_MSG, PASTE_UNREADABLE_MSG: S.PASTE_UNREADABLE_MSG, PASTE_CHECK_MSG: S.PASTE_CHECK_MSG, clipboardLooksLikeCode: S.clipboardLooksLikeCode,
    };
    const keys = Object.keys(env);
    const body = "let _verifyInFlight = false, _sendInFlight = false, _lastTriedCode = '', _codePrevLen = 0, _resendTick = 0, _codeSentAt = 0, _sendGen = 0, _lastUpgradeTrigger = 'general';\n"
      + src + '\nreturn { ' + names.join(', ') + ' };';
    const api = new Function(...keys, body)(...keys.map((k) => env[k])); st.api = api;
    const el = (id) => doc.getElementById(id);
    const focused = () => el('upgrade-modal-body').classList.contains('signin-focus');
    return { api, st, el, doc, log, store, focused, flush: () => new Promise((r) => setTimeout(r, 0)) };
  }

  { const h = harness(); h.el('signin-email').value = 'a@local.test';
    const p = h.api.sendSignInCode();
    ok(h.st.sends.length === 1 && h.st.sends[0].focusAtSend === 'signin-code' && h.log.indexOf('focus:signin-code') < h.log.indexOf('send:a@local.test')
       && h.el('signin-code-step').style.display === '' && h.focused() && h.el('signin-email-step').style.display === 'none',
       'B1 Send code: the code box has focus and the focused step is open BEFORE the request is made (synchronously, inside the tap)');
    h.st.sends[0].d.res({ ok: true }); await p;
    ok(S.readPending(h.store).email === 'a@local.test' && /Code sent to a@local\.test/.test(h.el('signin-msg').textContent) && h.focused(), 'B2 on success the code is remembered and the step stays focused');
  }
  { const h = harness(); h.el('signin-email').value = 'a@local.test';
    const p = h.api.sendSignInCode(); h.st.sends[0].d.res({ ok: false, msg: 'Too many code requests.' }); await p;
    ok(h.el('signin-code-step').style.display === 'none' && !h.focused() && h.el('signin-email-step').style.display === '' && h.doc.activeElement.id === 'signin-email' && !S.readPending(h.store),
       'B3 a failed first send returns to the email step (focus on the email box, nothing remembered)');
  }
  { const h = harness(); h.el('signin-email').value = 'a@local.test';
    let p = h.api.sendSignInCode(); h.st.sends[0].d.res({ ok: true }); await p;
    const sentAt = S.readPending(h.store).sentAt; h.store.setItem(S.PENDING_KEY, JSON.stringify({ email: 'a@local.test', sentAt: sentAt - 61000 }));
    p = h.api.sendSignInCode(); h.st.sends[1].d.res({ ok: false, msg: 'Too many code requests.' }); await p;
    ok(h.el('signin-code-step').style.display === '' && h.focused() && !!S.readPending(h.store), 'B4 a failed resend keeps the code step and the earlier code');
  }
  { const h = harness(); h.el('signin-email').value = 'a@local.test';
    let p = h.api.sendSignInCode(); h.st.sends[0].d.res({ ok: true }); await p;
    h.store.setItem(S.PENDING_KEY, JSON.stringify({ email: 'a@local.test', sentAt: Date.now() - 61000 }));
    p = h.api.sendSignInCode();          // resend in flight …
    h.st.signedIn = true;                 // … while an earlier code signs the person in
    h.api.setSigninFocus(false);
    h.st.sends[1].d.res({ ok: true }); await p;
    ok(!h.focused() && !S.readPending(h.store) && h.el('signin-code-step').style.display === 'none', 'B5 review R2: a send that returns after sign-in never re-opens the code-only view on the signed-in sheet');
  }
  { const h = harness(); h.el('signin-email').value = 'a@local.test';
    const p = h.api.sendSignInCode();    // first send in flight …
    h.api.changeSignInEmail();            // … the person switches address
    h.el('signin-email').value = 'b@local.test';
    h.st.sends[0].d.res({ ok: true }); await p;
    ok(!h.focused() && h.el('signin-code-step').style.display === 'none' && h.el('signin-email-step').style.display === '' && !S.readPending(h.store),
       'B6 review R3: a send for the abandoned address changes nothing after "Use a different email"');
  }
  { const h = harness(); h.el('signin-email').value = 'a@local.test';
    const p = h.api.sendSignInCode(); h.st.sends[0].d.res({ ok: true }); await p;
    h.store.removeItem(S.PENDING_KEY);    // the 15-minute pending record has expired
    h.api.openUpgrade('region');
    ok(!h.focused() && h.el('signin-code-step').style.display === 'none' && h.el('signin-email-step').style.display === '' && h.st.configured.includes('region'),
       'B7 review R1: with no code pending, any trigger opens the normal sheet (no stale code-only view)');
    h.store.setItem(S.PENDING_KEY, JSON.stringify({ email: 'a@local.test', sentAt: Date.now() }));
    h.api.showCodeStep('a@local.test', Date.now()); h.api.openUpgrade('save');
    ok(h.focused() && h.el('signin-code-step').style.display === '', 'B8 while a code IS pending, reopening the sheet keeps the code step');
    h.store.removeItem(S.PENDING_KEY); h.el('signin-msg').textContent = 'Code sent to a@local.test. …';
    h.st.configured.length = 0;
    // the locked market slot and the tier badge call configureUpgradeModal + openModal directly
    h.api.resetStaleCodeStep();
    ok(!h.focused() && h.el('signin-code-step').style.display === 'none' && h.el('signin-email-step').style.display === '' && h.el('signin-msg').textContent === '',
       'B12 review R1 (re-verification): the shared reset also clears a stale code step for entry points that bypass openUpgrade, and its old message');
  }
  { const cfg = fnBody('configureUpgradeModal');
    ok(/_lastUpgradeTrigger = trigger \|\| 'general';\n  resetStaleCodeStep\(\);/.test(cfg)
       && /configureUpgradeModal\('region'\);/.test(fnBody('handleLockedSlot') || mj) && (mj.match(/configureUpgradeModal\(/g) || []).length >= 5,
       'B13 every entry point (openUpgrade, locked slot, tier badge, sign-in refresh) runs through configureUpgradeModal, which starts with the reset');
  }
  { const h = harness(); h.api.showCodeStep('a@local.test', Date.now());
    h.st.clip = 'Account 48291377'; await h.api.pasteSignInCode(); await h.flush();
    ok(h.st.verifies.length === 0 && h.el('signin-code').value === '48291377' && h.el('signin-msg').textContent === S.PASTE_CHECK_MSG,
       'B9 review R4: "Paste code" with unrelated copied digits fills the box and waits for Verify (nothing is sent)');
    h.el('signin-code').value = ''; h.st.clip = 'Your DealFit code is 482913. Sent 2026-11-24.'; await h.api.pasteSignInCode(); await h.flush();
    ok(h.st.verifies.length === 1 && h.st.verifies[0] === '482913', 'B10 "Paste code" with the code (or text naming it) verifies once by itself');
    h.st.clip = 'Your code is 000000'; await h.api.pasteSignInCode(); await h.flush();
    h.st.clip = '000 000'; await h.api.pasteSignInCode(); await h.flush();
    ok(h.st.verifies.length === 2 && h.st.verifies[1] === '000000', 'B11 a code that failed is never re-sent automatically by another paste');
    h.el('signin-code').value = ''; h.st.clip = 'Zip code 28202, call 7045551234'; await h.api.pasteSignInCode(); await h.flush();
    ok(h.st.verifies.length === 2 && h.el('signin-msg').textContent === S.PASTE_CHECK_MSG, 'B14 review R4 residual: a keyword next to a different number never auto-verifies the other number');
  }
}

console.log(`otpfocus: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
