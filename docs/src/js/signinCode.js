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

// The digits of whatever the user pasted, typed or the OS autofilled. Supabase email
// one-time codes are numeric; their length is a project setting (6 by default, up to 10),
// so nothing here assumes a fixed length.
export function normalizeOtp(raw) {
  const s = String(raw == null ? '' : raw);
  // A pasted sentence: take the longest run of 6–10 digits (the code), ignoring
  // separators inside it ("123 456", "123-456"). Otherwise keep every digit.
  const grouped = s.replace(/(\d)[\s \-–.]+(?=\d)/g, '$1');
  const runs = grouped.match(/\d{6,10}/g);
  if (runs && runs.length) return runs.sort((a, b) => b.length - a.length)[0];
  return s.replace(/\D+/g, '').slice(0, 10);
}

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

// Email sign-in LINK (prepared; inert until the Supabase email template links here).
// The template would link to  <site>/?auth_th={{ .TokenHash }}&auth_type=email . Nothing is
// verified on page load: link scanners in mail systems open (GET) links, and a single-use
// token consumed by a scanner would leave the person with a dead link. The app only shows a
// "Finish signing in" button; the token is spent on that tap (verifyOtp with token_hash).
export const AUTH_LINK_PARAMS = ['auth_th', 'auth_type'];
export function readAuthLink(href) {
  let u; try { u = new URL(href); } catch { return null; }
  const th = u.searchParams.get('auth_th');
  const type = u.searchParams.get('auth_type') || 'email';
  if (!th || !/^[A-Za-z0-9_\-.]{8,200}$/.test(th)) return null;
  if (!['email', 'magiclink', 'signup'].includes(type)) return null;
  return { tokenHash: th, type: type === 'email' ? 'email' : type };
}
// The same URL without the token (so it never lingers in history, a bookmark or a share).
export function stripAuthLink(href) {
  let u; try { u = new URL(href); } catch { return href; }
  for (const k of AUTH_LINK_PARAMS) u.searchParams.delete(k);
  return u.pathname + (u.search ? u.search : '') + u.hash;
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
