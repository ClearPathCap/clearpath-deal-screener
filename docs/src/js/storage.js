// ─── Pipeline storage — server-backed, account-scoped ─────────────────────────
// The saved pipeline lives on the SERVER (user_pipeline, via the get_pipeline/
// save_pipeline RPCs) so it follows the account across devices and survives a
// browser clear. Anonymous users have NO pipeline (Option A) — saveDeal() gates on
// sign-in before anything is persisted.
//
// saveDeals() is the single ASYNC mutation coordinator: await-then-commit. The
// cache changes only after the durable save_pipeline RPC confirms; a failed RPC
// leaves the cache untouched so the UI never shows an unpersisted state. One
// save/delete mutation may be in flight at a time (shared lock, released in
// finally on every path).
//   • hydratePipeline()    — pull the server pipeline into the cache (sign-in / boot)
//   • saveDeals(candidate) — await save_pipeline on a snapshot, then commit the cache
//   • clearPipelineCache() — drop the cache on sign-out (anonymous = empty)

import { supabase } from './supabaseClient.js';
import { isSignedIn } from './auth.js';

// Wave 5 (§18-1 ratified matrix): pipeline capacity is NOT a tier
// differentiator. Every signed-in tier gets the same allowance — an
// operational/anti-abuse bound, not an entitlement. The NUMBER is provisional
// (owner decision pending; recommended 25) — change the constant, nothing else.
export const PIPELINE_ALLOWANCE = 25;

let _cache = [];  // current pipeline, in memory (source of truth is the server)
let _mutationInFlight = false;  // at most one unresolved save/delete mutation

// UX wave hardening (silent-wipe): save_pipeline is a WHOLESALE replace, so a
// candidate built from a cache that never completed a server round-trip could
// replace real server deals with an empty/partial view — with 200s everywhere.
// `_hydrated` is proven-knowledge state: it turns true ONLY when get_pipeline
// resolves without error (a legitimately empty server pipeline IS a successful
// hydration — the flag distinguishes "server says empty" from "we never heard
// back"). No mutation may proceed while it is false.
let _hydrated = false;

// True once this session has a confirmed server round-trip to build saves on.
export function pipelineHydrationOk() { return _hydrated; }

// Synchronous read for the UI. Returns a copy so callers can't mutate the cache.
export function getDeals() { return _cache.slice(); }

// Auth-class failure only from a stable status code on the client result, or a
// proven signed-out state at failure time — never message-text matching.
function classifyMutationFailure(err) {
  const status = err && (err.status ?? err.statusCode);
  if (status === 401 || status === 403) return 'auth';
  if (!isSignedIn()) return 'auth';
  return 'other';
}

// Replace the pipeline (await-then-commit). Awaits exactly one save_pipeline RPC
// on an immutable snapshot of `candidate`; assigns the cache ONLY on confirmed
// success. Returns {ok:true} | {ok:false, reason:'busy'|'auth'|'stale'|'other'}.
// 'stale' = hydration never confirmed this session; recover by re-running
// hydratePipeline and retrying — never by weakening the guard.
export async function saveDeals(candidate) {
  if (_mutationInFlight) return { ok: false, reason: 'busy' };  // no second RPC
  if (!isSignedIn()) return { ok: false, reason: 'auth' };      // storage-boundary gate
  // Silent-wipe guard: a wholesale replace may only be built on a cache the
  // server actually confirmed this session. Refusing here (not in callers)
  // covers save, edit, delete, and every future mutation path identically.
  if (!_hydrated) return { ok: false, reason: 'stale' };
  const snapshot = Array.isArray(candidate) ? candidate.slice() : [];
  _mutationInFlight = true;
  try {
    const { error } = await supabase.rpc('save_pipeline', { p_deals: snapshot });
    if (error) {
      console.warn('Pipeline save failed:', error);
      return { ok: false, reason: classifyMutationFailure(error) };
    }
    _cache = snapshot;
    return { ok: true };
  } catch (e) {
    console.warn('Pipeline save failed:', e);
    return { ok: false, reason: classifyMutationFailure(e) };
  } finally {
    _mutationInFlight = false;  // no code path may strand the lock
  }
}

// Pull the signed-in user's pipeline from the server into the cache. Called on
// sign-in and at boot when a session is restored. Returns the deals.
export async function hydratePipeline() {
  if (!isSignedIn()) { _cache = []; _hydrated = false; return _cache; }
  try {
    const { data, error } = await supabase.rpc('get_pipeline');
    if (error) { console.warn('Pipeline load failed:', error); return _cache; }
    // Success — including the server truthfully answering "empty". Only here
    // does the cache become a legitimate base for a wholesale replace.
    _cache = Array.isArray(data) ? data : [];
    _hydrated = true;
  } catch (e) {
    console.warn('Pipeline load failed:', e);
    // _hydrated deliberately NOT set: an unheard server never authorizes a save.
  }
  return _cache;
}

// On sign-out, drop the cache so the next (anonymous) view shows nothing.
// Hydration knowledge dies with the session it was proven in.
export function clearPipelineCache() { _cache = []; _hydrated = false; }
