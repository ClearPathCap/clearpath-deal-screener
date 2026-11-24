// ─── Overnight wave 2026-11-24, Workstream A: sign-in UX + bounded plan check ──
// Pure rules (signinCode.js) and the REAL auth.js against the scripted Supabase stub.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/authux.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], visibilityState: 'visible', addEventListener() {} };
globalThis.window = globalThis; globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
console.warn = () => {};

const S = await import('../docs/src/js/signinCode.js');

console.log('— §N code normalisation ─');
ok(S.normalizeOtp('123456') === '123456' && S.normalizeOtp(' 123 456 ') === '123456' && S.normalizeOtp('123-456') === '123456' && S.normalizeOtp('12345678') === '12345678',
   'N1 digits survive; spaces and dashes inside the code are removed');
ok(S.normalizeOtp('Your DealFit code is 482913. It expires in 1 hour.') === '482913' && S.normalizeOtp('Code: 4829 1307') === '48291307',
   'N2 a pasted sentence yields the code (the 6–10 digit run), not the "1" from "1 hour"');
ok(S.normalizeOtp('12a3') === '123' && S.normalizeOtp('') === '' && S.normalizeOtp(null) === '' && S.normalizeOtp('abc') === '',
   'N3 while typing, non-digits are dropped; empty / null stay empty');
ok(S.looksComplete('123456') && S.looksComplete('1234567890') && !S.looksComplete('12345') && !S.looksComplete('12345678901'), 'N4 a code is 6–10 digits (the provider setting range)');

console.log('— §V auto-verify only when a whole code arrives at once ─');
ok(S.shouldAutoVerify({ inputType: 'insertFromPaste', prevLength: 0, value: '482913' }) && S.shouldAutoVerify({ inputType: 'insertReplacementText', prevLength: 0, value: '482913' })
   && S.shouldAutoVerify({ inputType: undefined, prevLength: 0, value: '482913' }), 'V1 paste, keyboard / OS suggestion (insertReplacementText) and inputType-less autofill verify by themselves');
ok(!S.shouldAutoVerify({ inputType: 'insertText', prevLength: 5, value: '482913' }) && !S.shouldAutoVerify({ inputType: 'insertFromPaste', prevLength: 0, value: '4829' }),
   'V2 typing the last digit does NOT auto-submit (length unknown); an incomplete paste does not either');

console.log('— §L emailed sign-in link (prepared, inert) ─');
const L1 = S.readAuthLink('https://dealfit.clearpathcapfunding.com/?auth_th=pkce_abcdef0123456789&auth_type=email#x');
ok(L1 && L1.tokenHash === 'pkce_abcdef0123456789' && L1.type === 'email', 'L1 the token hash and type are read from the link');
ok(S.stripAuthLink('https://dealfit.clearpathcapfunding.com/?tool=flip&auth_th=pkce_abcdef0123456789&auth_type=email#x') === '/?tool=flip#x',
   'L2 the token is removed from the address (other parameters and the hash kept)');
ok(S.readAuthLink('https://x.test/?auth_th=<script>') === null && S.readAuthLink('https://x.test/?auth_th=abcdefgh123&auth_type=recovery') === null && S.readAuthLink('https://x.test/') === null,
   'L3 malformed tokens and unsupported types (recovery) are ignored');

console.log('— §P "code sent" memory survives a page the phone unloaded ─');
const mem = new Map(); const ss = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
S.writePending(ss, ' qa@local.test ', 1000);
ok(S.readPending(ss, 1000 + 60000).email === 'qa@local.test' && !/\d{6}/.test(mem.get(S.PENDING_KEY)), 'P1 the email (trimmed) and time are kept — never a code');
ok(S.readPending(ss, 1000 + S.PENDING_TTL_MS + 1) === null && !mem.has(S.PENDING_KEY), 'P2 after 15 minutes it is forgotten (and removed)');
mem.set(S.PENDING_KEY, '{bad'); ok(S.readPending(ss, 0) === null, 'P3 corrupt storage is ignored');
const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
let threw = false; try { S.writePending(broken, 'a@b.c'); S.readPending(broken); S.clearPending(broken); } catch { threw = true; }
ok(!threw, 'P4 a blocked sessionStorage (private mode) never throws');
ok(S.resendWaitSeconds(0, 30000) === 30 && S.resendWaitSeconds(0, 60000) === 0 && S.resendWaitSeconds(undefined) === 0, 'P5 resend cooldown counts down 60 seconds');

console.log('— §E messages ─');
ok(/expired|replaced/.test(S.friendlyAuthError({ code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' }, 'verify')) && /send a new code/.test(S.friendlyAuthError({ status: 403 }, 'verify')),
   'E1 an expired / wrong code says so and says how to get a new one');
ok(/Wait a minute/.test(S.friendlyAuthError({ code: 'over_email_send_rate_limit', status: 429 }, 'send')), 'E2 the provider rate limit says to wait');
ok(!/\d{6}/.test(S.friendlyAuthError({ message: 'Token 123456 bad' }, 'verify')), 'E3 no message echoes a code');

// ── the real auth.js against the stub SDK ─────────────────────────────────────
console.log('— §A auth.js: normalised verification, link path, bounded plan check ─');
const { supabase } = await import('../docs/src/js/supabaseClient.js');   // the scripted stub (register-stubs)
const auth = await import('../docs/src/js/auth.js');
const tiers = await import('../docs/src/js/tiers.js');
const calls = [];
supabase.auth.verifyOtp = async (args) => { calls.push(args); const c = globalThis.__stubSupabase || {}; return c.verifyResult ?? { data: { session: c.session ?? null }, error: null }; };
globalThis.__stubSupabase = { session: null };
let r = await auth.verifyOtpCode('qa@local.test', 'Your code is 482 913');
ok(r.ok && calls.length === 1 && calls[0].token === '482913' && calls[0].email === 'qa@local.test' && calls[0].type === 'email', 'A1 a pasted sentence / spaced code is sent as its digits (' + JSON.stringify(calls[0]) + ')');
calls.length = 0; r = await auth.verifyOtpCode('qa@local.test', '4829');
ok(!r.ok && calls.length === 0 && /incomplete/.test(r.msg), 'A2 an incomplete code is refused locally — no request');
calls.length = 0; r = await auth.verifyOtpCode('', '', { tokenHash: 'pkce_abcdef0123456789', type: 'email' });
ok(r.ok && calls.length === 1 && calls[0].token_hash === 'pkce_abcdef0123456789' && calls[0].type === 'email' && !('token' in calls[0]), 'A3 the link path verifies with token_hash only');
globalThis.__stubSupabase = { verifyResult: { data: { session: null }, error: { name: 'AuthApiError', status: 403, code: 'otp_expired', message: 'Email link is invalid or has expired' } } };
r = await auth.verifyOtpCode('', '', { tokenHash: 'pkce_abcdef0123456789' });
ok(!r.ok && /expired or was already used/.test(r.msg), 'A4 a spent / expired link says so and how to recover');

// Plan check bounded (lane-6 O3): a hanging current_tier no longer holds the auth chain.
auth.setEntitlementTimeout(60);
const SESSION_A = { user: { id: 'u-a', email: 'a@local.test' }, access_token: 'a' };
let release; const hang = new Promise(res => { release = res; });
globalThis.__stubSupabase = { session: SESSION_A, rpc: { current_tier: () => hang } };
const seen = [];
auth.onAuthChange((_s, ctx) => seen.push(ctx && ctx.reason));
await auth.initAuthAndEntitlement();
const cb = globalThis.__stubAuthCallback;
const t0 = Date.now();
const done = cb('SIGNED_IN', SESSION_A); let settled = false; done.then(() => { settled = true; });
await sleep(150);
ok(settled && Date.now() - t0 < 1000 && auth.entitlementStatus() === 'unverified' && tiers.getActiveTier() === 'starter',
   'T1 a plan check that never answers times out: the auth chain completes, the tier stays starter (fail closed), status unverified');
ok(seen.includes('auth:SIGNED_IN'), 'T2 …and the subscribers run (the app is usable while the plan is unverified)');
seen.length = 0; release({ data: 'pro', error: null, status: 200 }); await sleep(20);
ok(tiers.getActiveTier() === 'pro' && auth.entitlementStatus() === 'verified' && seen.includes('entitlement-late'),
   'T3 when that same request answers later for the same user, its verified tier applies and subscribers refresh (read-only)');
let release2; const hang2 = new Promise(res => { release2 = res; });
globalThis.__stubSupabase = { session: SESSION_A, rpc: { current_tier: () => hang2 } };
await cb('TOKEN_REFRESHED', SESSION_A);   // times out again
const SESSION_B = { user: { id: 'u-b', email: 'b@local.test' }, access_token: 'b' };
globalThis.__stubSupabase = { session: SESSION_B, rpc: { current_tier: () => ({ data: null, error: { message: 'internal' }, status: 500 }) } };
await cb('SIGNED_IN', SESSION_B);
seen.length = 0; release2({ data: 'pro', error: null, status: 200 }); await sleep(20);
ok(tiers.getActiveTier() === 'starter' && auth.entitlementStatus() === 'unverified' && !seen.includes('entitlement-late'),
   'T4 a late answer for the PREVIOUS account is ignored after a switch (B keeps B’s fail-closed state)');
globalThis.__stubSupabase = { session: SESSION_B, rpc: { current_tier: () => ({ data: 'investor', error: null, status: 200 }) } };
await cb('TOKEN_REFRESHED', SESSION_B);
ok(tiers.getActiveTier() === 'investor' && auth.entitlementStatus() === 'verified', 'T5 a prompt answer still verifies normally');
globalThis.__stubSupabase = { session: SESSION_B, rpc: { current_tier: () => ({ data: 'pro', error: { message: 'x' }, status: 500 }) } };
await cb('TOKEN_REFRESHED', SESSION_B);
ok(tiers.getActiveTier() === 'starter' && auth.entitlementStatus() === 'unverified', 'T6 an error answer never grants a tier (unchanged)');

console.log('— §U UI wiring (source pins; behaviour executed in the browser check) ─');
const mj = rd('docs/src/js/main.js'), idx = rd('docs/index.html');
ok(/id="signin-code" inputmode="numeric" pattern="\[0-9\]\*" autocomplete="one-time-code"/.test(idx) && /<label for="signin-code" class="sr-only">/.test(idx)
   && /aria-describedby="signin-msg"/.test(idx) && /id="signin-msg" class="redeem-msg" role="status" aria-live="polite"/.test(idx) && /maxlength="64"/.test(idx),
   'U1 the code field is numeric, labelled for screen readers, announces messages, and accepts a pasted sentence (maxlength 64, cleaned to digits)');
ok(/addEventListener\('paste'/.test(mj) && /shouldAutoVerify\(\{ inputType: e\.inputType/.test(mj) && /if \(_verifyInFlight\) return \{ status: 'busy' \};/.test(mj)
   && /opts\.auto && \(code === _lastTriedCode/.test(mj), 'U2 paste / autofill verify once; one verification at a time; a failed code is never re-sent automatically');
ok(/takeAuthLinkFromUrl\(\);/.test(mj) && mj.indexOf('takeAuthLinkFromUrl();') < mj.indexOf('\ninitOnboarding();') && mj.indexOf('takeAuthLinkFromUrl();') < mj.indexOf('initAuthAndEntitlement().then')
   && /history\.replaceState\(history\.state, '', stripAuthLink/.test(mj) && /if \(_pendingAuthLink \|\| _linkNotice \|\| readPending\(_signinStore\)\) return;/.test(mj),
   'U3 an emailed token leaves the address bar before anything else (and the first-visit picker waits); it is spent only by the button');
// Re-pinned 2026-11-24 (template-independence): the picker also waits when a Supabase sign-in link was opened (_linkNotice),
// because that visit shows the "use the code" explanation instead.
ok(/#signin-email\{text-transform:none\}/.test(rd('docs/src/css/styles.css')), 'U5 the email field shows the address as typed (not in capitals)');
ok(/writePending\(_signinStore, email, now\)/.test(mj) && /if \(!showPendingAuthLink\(\)\) resumePendingSignIn\(\);/.test(mj) && /clearPending\(_signinStore\)/.test(mj),
   'U4 a sent code is remembered for this tab; a reloaded page reopens the code step; success forgets it');

console.log('— §N24 corrections (independent review findings) ─');
{ const X = S.extractOtp;
  ok(X('On 11/24/2026 your DealFit code is 482913').code === '482913' && X('Your code is 482 913. Sent 2026-11-24.').code === '482913' && X('Your code is 482 913. Sent 2026-11-24.').confident
     && X('Call 555-0101. Your code: 482913').code === '482913' && X('Meeting 11.24.2026 code 482913.').code === '482913',
     'Z1 F3: dates and phone numbers in a pasted sentence are never taken for the code; a code at the end of a sentence is found');
  ok(X('123456 or 654321').confident === false && X('Ref 20261124 code 482913').code === '482913' && X('Ref 20261124 code 482913').confident,
     'Z2 F3: two candidates and no "code" keyword is ambiguous (never auto-verified); the one after "code" wins');
  ok(X('Sent 2026-11-24.').found === false && X('12a3').code === '123' && X('111').code === '111', 'Z3 F3: text with no code yields found=false (the paste is refused); typing keeps digits (a stray letter is dropped)');
}
ok(S.AUTH_LINK_ENABLED === false && S.readAuthLink('https://x.test/#auth_th=abcdefgh12345678&auth_type=email').tokenHash === 'abcdefgh12345678'
   && S.stripAuthLink('https://x.test/?tool=flip#auth_th=abcdefgh12345678&auth_type=email') === '/?tool=flip' && S.stripAuthLink('https://x.test/?auth_th=abcdefgh12345678#keep=1') === '/#keep=1'
   && S.hasAuthLinkParams('https://x.test/#auth_th=abcdefgh123'), 'Z4 F1/F13: the link path is SWITCHED OFF; the fragment form is read and stripped (query form too)');
ok(/if \(!AUTH_LINK_ENABLED\) return;/.test(mj) && mj.indexOf("history.replaceState(history.state, '', stripAuthLink(href));") < mj.indexOf('if (!AUTH_LINK_ENABLED) return;'),
   'Z5 F1: a link token is always removed from the address, and never offered or spent while switched off');
ok(/next = normalizeOtp\(v\.slice\(0, s\) \+ code \+ v\.slice\(en\)\);/.test(mj) && /if \(looksComplete\(code\) \|\| replaceAll\) next = code;/.test(mj) && /if \(confident \|\| !looksComplete\(code\)\) verifySignInCode\(\{ auto: true \}\);/.test(mj),
   'Z6 F2/F3: a partial paste INTO THE FIELD goes in at the caret (digits already typed are kept); there only a complete code replaces the field (the Paste code button always replaces it); an ambiguous paste never auto-verifies');
// Re-pinned (iPhone UAT follow-up): the rule now lives in applyPastedCode, shared by the field's own paste and the
// "Paste code" button; replaceAll is true only for the button, whose copied text stands for the whole code.
ok(/const wait = pend && pend\.email\.toLowerCase\(\) === email\.toLowerCase\(\) \? resendWaitSeconds\(pend\.sentAt\) : 0;\s*if \(wait > 0\)/.test(mj), 'Z7 F4: "Send code" honours the resend cooldown for the address a code was just sent to');
// F5: a fast plan answer that lands after a sign-out is never applied to the signed-out page.
auth.setEntitlementTimeout(5000);
globalThis.__stubSupabase = { session: SESSION_A, rpc: { current_tier: () => new Promise(r => setTimeout(() => r({ data: 'pro', error: null, status: 200 }), 40)) } };
const inflight = cb('SIGNED_IN', SESSION_A); await sleep(5);
globalThis.__stubSupabase = { session: null, rpc: {} };
await cb('SIGNED_OUT', null); await inflight; await sleep(60);
ok(tiers.getActiveTier() === 'starter' && auth.entitlementStatus() === 'signed-out', 'Z8 F5: a plan answer arriving after a sign-out never applies a paid tier to the signed-out page');

console.log(`\nauthux: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
