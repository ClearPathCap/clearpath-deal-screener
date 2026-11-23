// ─── Auth + entitlement ───────────────────────────────────────────────────────
// The source of truth for a user's tier is the SERVER (the `entitlements` table,
// read here through Row-Level Security). localStorage only CACHES the tier for a
// snappy UI via setCachedTier — it never GRANTS it. On every load we overwrite
// the cache with the server's answer, so editing localStorage can't persist a
// fake tier, and a shared/edited value is corrected on the next load.

import { supabase } from './supabaseClient.js';
import { setCachedTier } from './tiers.js';
import { noteServerResult, isNetworkFailure, onReconnect } from './connectivity.js';

let _session = null;
const _listeners = [];

export function onAuthChange(fn) { _listeners.push(fn); }
function notify() { _listeners.forEach(fn => { try { fn(_session); } catch (e) { console.warn(e); } }); }

export function isSignedIn()   { return !!_session; }

// Mobile Phase 0: whether the CURRENT tier came from a server answer. 'unverified'
// means the plan check could not reach the server — the tier stays 'starter'
// (fail closed, unchanged); the UI may say why. Never grants anything.
let _entitlementStatus = 'signed-out';   // 'signed-out' | 'verified' | 'unverified'
export function entitlementStatus() { return _entitlementStatus; }

// Independent review F1: true only while a RECONNECT re-runs the auth chain. Subscribers
// read it synchronously (notify() calls them in order) to skip anything that writes —
// today that is the market-sync push of local-only slots, which stays for boot/sign-in.
let _readOnlySync = false;
export function readOnlySync() { return _readOnlySync; }
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

  supabase.auth.onAuthStateChange(async (_event, session) => {
    _session = session || null;
    await syncEntitlement();
    notify();
  });

  // Wave 5 (SR-3): entitlement sync is UNCONDITIONAL — the dev-mode skip let any
  // visitor suppress server truth with ?dev=1. Server answer lands on every boot
  // and every auth change, always.
  await syncEntitlement();
  notify();

  // Mobile Phase 0: when connectivity returns after a failed request, re-run the
  // auth chain READ-ONLY (plan check, then every onAuthChange subscriber: tier UI,
  // saved-deal load, market pull) with readOnlySync() true, so no subscriber writes.
  // Signed-out: nothing.
  onReconnect(async () => {
    if (!_session) return;
    await syncEntitlement();
    _readOnlySync = true;
    try { notify(); } finally { _readOnlySync = false; }
  });
}

// Pull the server tier into the local cache (starter when signed out). Resolves
// through the current_tier() function so an EXPIRED comp (e.g. a time-boxed
// Aspire grant past its end date) correctly reads as starter — the server is the
// single source of truth, never the client.
export async function syncEntitlement() {
  if (!_session) { _entitlementStatus = 'signed-out'; setCachedTier('starter'); return 'starter'; }
  let tier = 'starter';
  let verified = false;   // true ONLY when the server answered without error
  try {
    const { data, error, status } = await supabase.rpc('current_tier');
    noteServerResult('entitlement', { ok: !error, error, status });
    verified = !error;
    if (!error && typeof data === 'string' && ['investor', 'pro'].includes(data)) {
      tier = data;
    }
  } catch (e) {
    console.warn('Entitlement fetch failed:', e);
    noteServerResult('entitlement', { error: e });
  }
  _entitlementStatus = verified ? 'verified' : 'unverified';
  setCachedTier(tier);
  return tier;
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
    if (error) return { ok: false, msg: isNetworkFailure(error) ? SIGNIN_OFFLINE : (error.message || 'Could not send the code — try again.') };
    return { ok: true, msg: 'Enter the code we just emailed you.' };
  } catch (e) {
    console.warn(e);
    noteServerResult('sign-in', { error: e });
    return { ok: false, msg: isNetworkFailure(e) ? SIGNIN_OFFLINE : 'Could not send the code — try again.' };
  }
}

// Verify the 6-digit code. On success the session is established (onAuthStateChange
// fires and the UI flips to signed-in). Returns { ok, msg }.
export async function verifyOtpCode(email, code) {
  const clean = (email || '').trim();
  const token = (code || '').trim();
  if (!token) return { ok: false, msg: 'Enter the code from your email.' };
  try {
    const { error } = await supabase.auth.verifyOtp({ email: clean, token, type: 'email' });
    noteServerResult('sign-in', { ok: !error, error });
    if (error) return { ok: false, msg: isNetworkFailure(error) ? VERIFY_OFFLINE : (error.message || 'That code is invalid or expired.') };
    return { ok: true, msg: 'Signed in.' };
  } catch (e) {
    console.warn(e);
    noteServerResult('sign-in', { error: e });
    return { ok: false, msg: isNetworkFailure(e) ? VERIFY_OFFLINE : 'That code is invalid or expired.' };
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
