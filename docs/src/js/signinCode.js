// ─── Sign-in code helpers (pure; no network, no DOM writes) ───────────────────
// Overnight wave 2026-11-24, Workstream A. Owner-observed defect (Aaron, production,
// one phone): no convenient code suggestion appeared, and he had to switch between his
// email and DealFit, entering about three digits at a time. Causes found in source:
//   • a pasted or autofilled code was never verified on arrival — the user still had to
//     find and tap Verify;
//   • pasted text with spaces or words ("123 456", "Your code is 123456") was sent as-is
//     and rejected as invalid;
//   • if the phone unloaded the page while the user was in the mail app, the code step
//     was gone on return (the sheet closed; the email had to be typed again);
//   • raw provider error text, no resend, no way to change the email.
// These helpers keep the rules testable. The UI wiring lives in main.js.

// The code inside whatever the user pasted, typed or the OS autofilled. Supabase email
// one-time codes are numeric; their length is a project setting (6 by default, up to 10),
// so nothing here assumes a fixed length.
// N24 review F3: a pasted sentence can hold other numbers (a date, a phone number). Only
// code-like groups are joined ("123 456", "1234-5678": two groups of 3–4 digits, one space or
// hyphen), never date-like ones ("2026-11-24", "11/24/2026"). With one 6–10 digit candidate,
// or one right after the word "code", the result is CONFIDENT; otherwise it is a best guess
// that must not be verified automatically.
export function extractOtp(raw) {
  const s = String(raw == null ? '' : raw);
  const joined = s.replace(/(?<!\d)(\d{3,4})[ \u00a0-](\d{3,4})(?!\d)/g, '$1$2');
  // A date or number separator (/ . -) counts only when a digit follows it: '482913.' ends a sentence.
  const runs = [...joined.matchAll(/(?<!\d|\d[/.-])\d{6,10}(?!\d|[/.-]\d)/g)].map(m => ({ v: m[0], i: m.index }));
  if (!runs.length) {
    // No code-like number: keep the digits (typing; a stray letter is just dropped). found=false tells
    // the paste handler that text with words held no code, so it never glues a sentence's digits together.
    return { code: s.replace(/\D+/g, '').slice(0, 10), confident: !/[A-Za-z]/.test(s), found: false };
  }
  if (runs.length === 1) return { code: runs[0].v, confident: true, found: true };
  const near = runs.filter(r => /(code|passcode|verification|otp)\W{0,20}$/i.test(joined.slice(Math.max(0, r.i - 30), r.i)));
  if (near.length === 1) return { code: near[0].v, confident: true, found: true };
  return { code: runs[0].v, confident: false, found: true };
}
export function normalizeOtp(raw) { return extractOtp(raw).code; }

// A code long enough to try (provider minimum length is 6).
export function looksComplete(code) { return /^\d{6,10}$/.test(code || ''); }

// Should a change to the code field verify on its own? Only when a complete code arrived
// in ONE step — a paste, an OS / keyboard autofill suggestion, or a drop — never while the
// user is typing digit by digit (the length setting is unknown, so typing waits for
// Enter / Verify). `inputType` is InputEvent.inputType (undefined on some autofills).
export function shouldAutoVerify({ inputType, prevLength = 0, value = '' }) {
  if (!looksComplete(value)) return false;
  if (inputType === 'insertFromPaste' || inputType === 'insertReplacementText' || inputType === 'insertFromDrop' || inputType === 'insertFromYank') return true;
  // Autofill paths that report no inputType (or 'insertText' with the whole code at once).
  return value.length - prevLength >= 4;
}

// Plain, actionable messages for the provider's error codes. Never echoes the code.
export function friendlyAuthError(err, phase) {
  const code = (err && (err.code || err.error_code)) || '';
  const status = err && (err.status ?? err.statusCode);
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return phase === 'send'
      ? 'Too many code requests. Wait a minute, then send a new code.'
      : 'Too many attempts. Wait a minute, then try again.';
  }
  if (phase === 'verify' && (code === 'otp_expired' || code === 'otp_disabled' || status === 403 || /expired|invalid/i.test((err && err.message) || ''))) {
    return 'That code didn’t work — it may have expired or been replaced by a newer one. Use the latest email, or send a new code.';
  }
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'Check the email address and try again.';
  return phase === 'send' ? 'Couldn’t send the code — try again.' : 'Couldn’t check that code — try again.';
}

// Email sign-in LINK — PREPARED, SWITCHED OFF (N24 review F1). While AUTH_LINK_ENABLED is
// false the app never offers or spends a link token: any auth_th in the address is only
// removed. Switching it on is an owner decision bundled with the email-template change, and
// needs the account named before the tap (see the overnight record), because a link that
// signs a visitor in to an unnamed account is a login-CSRF risk.
// Format (N24 F13): a FRAGMENT, <site>/#auth_th={{ .TokenHash }}&auth_type=email, so the
// token never reaches the static host's request logs. A legacy ?query form is also stripped.
// Nothing is verified on page load (mail link scanners open links); the token is spent only by
// a "Finish signing in" tap (verifyOtp with token_hash), once.
export const AUTH_LINK_ENABLED = false;
export const AUTH_LINK_PARAMS = ['auth_th', 'auth_type'];
export function readAuthLink(href) {
  let u; try { u = new URL(href); } catch { return null; }
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  const th = h.get('auth_th') || u.searchParams.get('auth_th');
  const type = h.get('auth_type') || u.searchParams.get('auth_type') || 'email';
  if (!th || !/^[A-Za-z0-9_\-.]{8,200}$/.test(th)) return null;
  if (!['email', 'magiclink', 'signup'].includes(type)) return null;
  return { tokenHash: th, type: type === 'email' ? 'email' : type };
}
// Session tokens a Supabase redirect (implicit flow) puts in the address fragment. DealFit never
// takes a session from the address (supabaseClient.js detectSessionInUrl: false); they are removed.
export const SESSION_URL_PARAMS = ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'provider_token', 'provider_refresh_token'];
function hasSessionFragment(h) { return SESSION_URL_PARAMS.some(k => h.has(k)) || h.has('error_code') || h.has('error_description'); }
const PROVIDER_ERROR_PARAMS = ['error', 'error_code', 'error_description'];
// Was the visitor sent here by a Supabase sign-in LINK (a session in the fragment, or a provider
// error such as an expired link)? DealFit never uses it (code-only sign-in), so the visitor is told
// what to do instead of landing silently signed out. Template-independent (owner check R8,
// 2026-11-24: the live template bodies are not readable through the CLI).
export function sessionLinkKind(href) {
  let u; try { u = new URL(href); } catch { return null; }
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  if (SESSION_URL_PARAMS.some(k => h.has(k))) return 'session';
  if (h.has('error_code') || h.has('error_description') || u.searchParams.has('error_code')) return 'error';
  return null;
}
export const LINK_NOT_USED_MSG = 'DealFit signs you in with the code from the email, not the link. Enter your email to get a code.';
export function hasAuthLinkParams(href) {
  let u; try { u = new URL(href); } catch { return false; }
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  return AUTH_LINK_PARAMS.some(k => u.searchParams.has(k) || h.has(k)) || hasSessionFragment(h) || u.searchParams.has('error_code');
}
// The same URL without the token (so it never lingers in history, a bookmark or a share).
export function stripAuthLink(href) {
  let u; try { u = new URL(href); } catch { return href; }
  for (const k of AUTH_LINK_PARAMS) u.searchParams.delete(k);
  if (u.searchParams.has('error_code')) for (const k of PROVIDER_ERROR_PARAMS) u.searchParams.delete(k);   // review R9: query-form provider error
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  let hash = u.hash;
  if (AUTH_LINK_PARAMS.some(k => h.has(k)) || hasSessionFragment(h)) {
    const drop = new Set(hasSessionFragment(h) ? [...AUTH_LINK_PARAMS, ...SESSION_URL_PARAMS, 'type', ...PROVIDER_ERROR_PARAMS] : AUTH_LINK_PARAMS);
    // Review R9: remove whole key=value segments only; anything else in the fragment is kept byte for byte.
    const keep = u.hash.replace(/^#/, '').split('&').filter(seg => { let k = seg.split('=')[0]; try { k = decodeURIComponent(k); } catch {} return seg && !drop.has(k); });
    hash = keep.length ? '#' + keep.join('&') : '';
  }
  return u.pathname + (u.search ? u.search : '') + hash;
}

// "Code sent" memory for ONE browser tab (sessionStorage), so a page the phone unloaded
// while the person read their email comes back on the code step with the email filled in.
// Holds the email and the time only — never the code. Expires after 15 minutes.
export const PENDING_KEY = 'dfSigninPending';
export const PENDING_TTL_MS = 15 * 60 * 1000;
export function readPending(store, now = Date.now()) {
  try {
    const p = JSON.parse(store.getItem(PENDING_KEY) || 'null');
    if (!p || typeof p.email !== 'string' || !p.email.includes('@') || typeof p.sentAt !== 'number') return null;
    if (now - p.sentAt > PENDING_TTL_MS || now < p.sentAt - 60000) { store.removeItem(PENDING_KEY); return null; }
    return p;
  } catch { return null; }
}
export function writePending(store, email, now = Date.now()) {
  try { store.setItem(PENDING_KEY, JSON.stringify({ email: String(email).trim(), sentAt: now })); } catch {}
}
export function clearPending(store) { try { store.removeItem(PENDING_KEY); } catch {} }

// Resend cooldown (the provider limits how often a code can be sent to one address).
export const RESEND_COOLDOWN_MS = 60 * 1000;
export function resendWaitSeconds(sentAt, now = Date.now()) {
  if (typeof sentAt !== 'number') return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 1000));
}

// ─── iPhone UAT follow-up (owner, real iPhone + Gmail, 2026-11-24) ────────────
// Owner-observed: the email arrived, but no code suggestion appeared; the keyboard offered
// "AutoFill Contact" and saved email addresses (it was still attached to the EMAIL field), and
// copying the code out of the Gmail notification was awkward. In source: the code box was
// focused only after the send request returned, which iOS Safari ignores (focus must happen
// inside the tap), and the email box, the plan cards and the "Have a code?" box all stayed on
// screen during code entry. The iOS one-time-code suggestion itself is the OS's: it appears only
// when iOS has read the code (Messages, or Apple Mail; not the Gmail app as of this writing), so
// DealFit never promises it. The helpers below keep the new rules testable.

// A plausible email address, checked before anything is sent (the provider still decides).
export function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s == null ? '' : s).trim());
}

// What to say once the code is on its way. Names the address (so a typo is visible) and the one
// next step; it never promises an iPhone keyboard suggestion, which DealFit does not control.
// Real-device UAT 2026-11-24 (b47a9aa, iPhone + Gmail): the custom "Paste code" button failed with a
// clipboard-read error (Safari reads the clipboard only through its own Paste callout, inside the
// tap, and rejects otherwise). It is gone; the reliable path is the text field's own
// press-and-hold Paste, which the field's paste handler turns into one verification.
export function codeSentMessage(email) {
  const to = String(email || '').trim();
  return 'Code sent to ' + to + '. Copy the code from the email, come back, then press and hold the box and tap Paste — or type it.';
}
export const PASTE_NO_CODE_MSG = 'No code found in what you copied. Copy just the code from the email, or type it.';
