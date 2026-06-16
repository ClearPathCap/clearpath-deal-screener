// ─── Auth + entitlement ───────────────────────────────────────────────────────
// The source of truth for a user's tier is the SERVER (the `entitlements` table,
// read here through Row-Level Security). localStorage only CACHES the tier for a
// snappy UI via setCachedTier — it never GRANTS it. On every load we overwrite
// the cache with the server's answer, so editing localStorage can't persist a
// fake tier, and a shared/edited value is corrected on the next load.

import { supabase } from './supabaseClient.js';
import { setCachedTier, devModeVisible } from './tiers.js';

let _session = null;
const _listeners = [];

export function onAuthChange(fn) { _listeners.push(fn); }
function notify() { _listeners.forEach(fn => { try { fn(_session); } catch (e) { console.warn(e); } }); }

export function isSignedIn()   { return !!_session; }
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
    if (!devModeVisible()) await syncEntitlement();
    notify();
  });

  // In Dev Mode the owner's locally-set tier controls the UI for testing, so we
  // don't override it with the server value.
  if (!devModeVisible()) await syncEntitlement();
  notify();
}

// Pull the server tier into the local cache (starter when signed out). Resolves
// through the current_tier() function so an EXPIRED comp (e.g. a time-boxed
// Aspire grant past its end date) correctly reads as starter — the server is the
// single source of truth, never the client.
export async function syncEntitlement() {
  if (!_session) { setCachedTier('starter'); return 'starter'; }
  let tier = 'starter';
  try {
    const { data, error } = await supabase.rpc('current_tier');
    if (!error && typeof data === 'string' && ['investor', 'pro'].includes(data)) {
      tier = data;
    }
  } catch (e) {
    console.warn('Entitlement fetch failed:', e);
  }
  setCachedTier(tier);
  return tier;
}

// Email the user a passwordless magic link. Returns { ok, msg }.
export async function sendOtpCode(email) {
  const clean = (email || '').trim();
  if (!clean || !clean.includes('@')) return { ok: false, msg: 'Enter a valid email address.' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },   // code flow — no redirect link
    });
    if (error) return { ok: false, msg: error.message || 'Could not send the code — try again.' };
    return { ok: true, msg: 'Enter the code we just emailed you.' };
  } catch (e) {
    console.warn(e);
    return { ok: false, msg: 'Could not send the code — try again.' };
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
    if (error) return { ok: false, msg: error.message || 'That code is invalid or expired.' };
    return { ok: true, msg: 'Signed in.' };
  } catch (e) {
    console.warn(e);
    return { ok: false, msg: 'That code is invalid or expired.' };
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
