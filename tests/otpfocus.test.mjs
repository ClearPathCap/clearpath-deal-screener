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
const fnBody = (name) => { const i = mj.indexOf('function ' + name + '('); if (i < 0) return ''; const j = mj.indexOf('\n}\n', i); return mj.slice(i, j + 2); };

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
  ok(/function changeSignInEmail\(\) \{\s*clearPending\(_signinStore\);\s*closeCodeStep\(\);/.test(mj), 'V7 "Use a different email" leaves the focused view');
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
  ok(/if \(!isSignedIn\(\)\) \{ _refreshSheetOnSignIn = true; return; \}/.test(r) && /classList\?\.contains\('active'\)\) configureUpgradeModal\(_lastUpgradeTrigger\);/.test(r)
     && (mj.match(/refreshSheetAfterSignIn\(\);/g) || []).length >= 3 && /if \(_refreshSheetOnSignIn\) refreshSheetAfterSignIn\(\);/.test(fnBody('updateAccountUI')),
     'H1 a completed sign-in re-titles the open sheet for the signed-in state (no "Sign in or create" heading above "Signed in as")');
}

console.log(`otpfocus: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
