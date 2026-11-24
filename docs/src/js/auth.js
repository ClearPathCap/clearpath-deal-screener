// ─── Auth + entitlement ───────────────────────────────────────────────────────
// The source of truth for a user's tier is the SERVER (the `entitlements` table,
// read here through Row-Level Security). localStorage only CACHES the tier for a
// snappy UI via setCachedTier — it never GRANTS it. On every load we overwrite
// the cache with the server's answer, so editing localStorage can't persist a
// fake tier, and a shared/edited value is corrected on the next load.

import { supabase } from './supabaseClient.js';
import { setCachedTier } from './tiers.js';
import { noteServerResult, isNetworkFailure, onReconnect } from './connectivity.js';
import { normalizeOtp, looksComplete, friendlyAuthError } from './signinCode.js';

let _session = null;
const _listeners = [];
const _early = [];

// Lane-5 R7: `{ beforeEntitlement: true }` registers a SYNCHRONOUS subscriber (no network write)
// that runs the instant the session user changes (and at boot) — BEFORE the plan check
// (`current_tier`), which may be slow, fail or never return. It is for display hygiene only
// (hiding another account's device-held data); it gets the session and no context, must not
// await, and must never write to the network. Every other subscriber still runs after the plan check.
export function onAuthChange(fn, opts) { ((opts && opts.beforeEntitlement) ? _early : _listeners).push(fn); }
function notifyEarly() { _early.forEach(fn => { try { fn(_session); } catch (e) { console.warn(e); } }); }

// Lane-2 review F7: every subscriber call carries an explicit, frozen context, decided
// from the auth EVENT and the user it was decided for — not a timing-sensitive global
// flag. `marketPush` (may local-only market slots be pushed up?) is true ONLY for the
// boot notify and a genuine signed-out → signed-in transition, and only while the user
// it was decided for is still the signed-in user. Everything else is pull-only: the
// SIGNED_IN the SDK re-emits for the SAME user when the tab becomes visible,
// TOKEN_REFRESHED, USER_UPDATED, a direct switch to a DIFFERENT user, SIGNED_OUT, and
// every connectivity reconnect.
const userKey = (s) => (s && s.user && (s.user.id || s.user.email)) || '';
export function getUserId() { return _session?.user?.id || ''; }
function notify(reason, pushFor = null) {
  const marketPush = !!(_session && pushFor && userKey(pushFor) === userKey(_session));
  const ctx = Object.freeze({ reason, marketPush });
  _listeners.forEach(fn => { try { fn(_session, ctx); } catch (e) { console.warn(e); } });
}
// Pure decision, exported for the tests: may this auth event push local-only slots?
// Only when nobody was signed in before it and someone is now (first sign-in, or a
// session that first becomes known through the SDK).
export function authEventAllowsMarketPush(event, prevSession, nextSession) {
  return !!nextSession && !prevSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION');
}

export function isSignedIn()   { return !!_session; }

// Mobile Phase 0: whether the CURRENT tier came from a server answer. 'unverified'
// means the plan check could not reach the server — the tier stays 'starter'
// (fail closed, unchanged); the UI may say why. Never grants anything.
let _entitlementStatus = 'signed-out';   // 'signed-out' | 'verified' | 'unverified'
export function entitlementStatus() { return _entitlementStatus; }

export function getUserEmail() { return _session?.user?.email || ''; }

// Called once at boot: restore any session, subscribe to changes, sync tier.
export async function initAuthAndEntitlement() {
  try {
    const { data } = await supabase.auth.getSession();
    _session = data?.session || null;
  } catch (e) {
    console.warn('Auth init failed:', e);
    _session = null;
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    // Decide BEFORE any await, from the state this event changes (F7).
    const next = session || null;
    const pushFor = authEventAllowsMarketPush(event, _session, next) ? next : null;
    _session = next;
    notifyEarly();   // R7: before the plan check
    await syncEntitlement();
    notify('auth:' + event, pushFor);
  });

  // Wave 5 (SR-3): entitlement sync is UNCONDITIONAL — the dev-mode skip let any
  // visitor suppress server truth with ?dev=1. Server answer lands on every boot
  // and every auth change, always.
  const bootSession = _session;
  notifyEarly();   // R7: before the first plan check
  await syncEntitlement();
  notify('boot', bootSession);

  // Mobile Phase 0: when connectivity returns after a failed request, re-run the
  // auth chain READ-ONLY (plan check, then every onAuthChange subscriber: tier UI,
  // saved-deal load, market pull) with marketPush false, so no subscriber writes.
  // Signed-out: nothing.
  onReconnect(async () => {
    if (!_session) return;
    await syncEntitlement();
    notify('reconnect');
  });
}

// Pull the server tier into the local cache (starter when signed out). Resolves
// through the current_tier() function so an EXPIRED comp (e.g. a time-boxed
// Aspire grant past its end date) correctly reads as starter — the server is the
// single source of truth, never the client.
//
// Overnight wave 2026-11-24 (Workstream A; lane-6 O3): the plan check is bounded. If the server
// does not answer within ENTITLEMENT_TIMEOUT_MS the tier stays 'starter' and the status
// 'unverified' (fail closed, exactly as for an error) and the auth chain continues: sign-in no
// longer waits on a hanging current_tier. If that same request answers later, still for the same
// signed-in user and with no newer check started, its verified tier is applied and subscribers are
// notified read-only (reason 'entitlement-late', no market push).
let ENTITLEMENT_TIMEOUT_MS = 8000;
export function setEntitlementTimeout(ms) { ENTITLEMENT_TIMEOUT_MS = ms; }   // tests
let _entitlementSeq = 0;
async function readServerTier() {
  try {
    const { data, error, status } = await supabase.rpc('current_tier');
    noteServerResult('entitlement', { ok: !error, error, status });
    if (error) return { tier: 'starter', verified: false };
    return { tier: (typeof data === 'string' && ['investor', 'pro'].includes(data)) ? data : 'starter', verified: true };
  } catch (e) {
    console.warn('Entitlement fetch failed:', e);
    noteServerResult('entitlement', { error: e });
    return { tier: 'starter', verified: false };
  }
}
export async function syncEntitlement() {
  // N24 review F5: signing out also invalidates any plan check still in flight for the old session.
  if (!_session) { _entitlementSeq++; _entitlementStatus = 'signed-out'; setCachedTier('starter'); return 'starter'; }
  const seq = ++_entitlementSeq;
  const forUser = userKey(_session);
  const call = readServerTier();
  let timer = null;
  const res = await Promise.race([call, new Promise(r => { timer = setTimeout(() => r(null), ENTITLEMENT_TIMEOUT_MS); })]);
  clearTimeout(timer);
  if (res === null) {   // timed out: fail closed now; accept the same request's answer later
    _entitlementStatus = 'unverified';
    setCachedTier('starter');
    call.then((late) => {
      if (late && late.verified && seq === _entitlementSeq && _session && userKey(_session) === forUser) {
        _entitlementStatus = 'verified';
        setCachedTier(late.tier);
        notify('entitlement-late');
      }
    });
    return 'starter';
  }
  // A newer check started meanwhile (it owns the cache), or the session ended or changed (N24 F5).
  if (seq !== _entitlementSeq || !_session || userKey(_session) !== forUser) return res.tier;
  _entitlementStatus = res.verified ? 'verified' : 'unverified';
  setCachedTier(res.tier);
  return res.tier;
}

// Network failures say so plainly — never "invalid code", never a success.
const SIGNIN_OFFLINE = 'Can’t reach DealFit’s sign-in service, so no code was sent. Check your connection and try again.';
const VERIFY_OFFLINE = 'Can’t reach DealFit’s sign-in service, so your code wasn’t checked. Check your connection and try again.';

// Email the user a passwordless magic link. Returns { ok, msg }.
export async function sendOtpCode(email) {
  const clean = (email || '').trim();
  if (!clean || !clean.includes('@')) return { ok: false, msg: 'Enter a valid email address.' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },   // code flow — no redirect link
    });
    noteServerResult('sign-in', { ok: !error, error });
    if (error) return { ok: false, msg: isNetworkFailure(error) ? SIGNIN_OFFLINE : friendlyAuthError(error, 'send') };
    return { ok: true, msg: 'Enter the code we just emailed you.' };
  } catch (e) {
    console.warn(e);
    noteServerResult('sign-in', { error: e });
    return { ok: false, msg: isNetworkFailure(e) ? SIGNIN_OFFLINE : friendlyAuthError(e, 'send') };
  }
}

// Verify the emailed code: its digits only (pasted text, spaces and dashes are stripped by
// normalizeOtp; the length is the project's setting, 6 to 10). On success the session is
// established (onAuthStateChange fires and the UI flips to signed-in).
// opts.tokenHash: finish a sign-in from the emailed LINK instead (prepared; see signinCode.js
// readAuthLink); the token is spent only when the person taps "Finish signing in".
// Returns { ok, msg }.
export async function verifyOtpCode(email, code, opts = {}) {
  const clean = (email || '').trim();
  const viaLink = !!(opts && opts.tokenHash);
  const token = viaLink ? '' : normalizeOtp(code);
  if (!viaLink) {
    if (!token) return { ok: false, msg: 'Enter the code from your email.' };
    if (!looksComplete(token)) return { ok: false, msg: 'That looks incomplete. Enter every digit of the code from your email.' };
  }
  try {
    const { error } = viaLink
      ? await supabase.auth.verifyOtp({ token_hash: opts.tokenHash, type: opts.type || 'email' })
      : await supabase.auth.verifyOtp({ email: clean, token, type: 'email' });
    noteServerResult('sign-in', { ok: !error, error });
    if (error) {
      const msg = isNetworkFailure(error) ? VERIFY_OFFLINE
        : viaLink ? 'That sign-in link has expired or was already used. Request a new code to sign in.'
        : friendlyAuthError(error, 'verify');
      return { ok: false, msg };
    }
    return { ok: true, msg: 'Signed in.' };
  } catch (e) {
    console.warn(e);
    noteServerResult('sign-in', { error: e });
    return { ok: false, msg: isNetworkFailure(e) ? VERIFY_OFFLINE : friendlyAuthError(e, 'verify') };
  }
}

export async function signOutAccount() {
  try { await supabase.auth.signOut(); } catch (e) { console.warn(e); }
  _session = null;
  setCachedTier('starter');
}

// Redeem a comp code server-side (sign-in required). Returns { ok, msg, tier? }.
export async function redeemServerCode(rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, msg: 'Enter a code first.' };
  if (!_session) return { ok: false, msg: 'Sign in first to redeem a code.' };
  try {
    const { data, error } = await supabase.rpc('redeem_comp_code', { p_code: code });
    if (error) { console.warn(error); return { ok: false, msg: 'Could not redeem that code — try again.' }; }
    if (data && data.ok) await syncEntitlement();
    return data || { ok: false, msg: "That code isn't valid." };
  } catch (e) {
    console.warn(e);
    return { ok: false, msg: 'Could not redeem that code — try again.' };
  }
}
