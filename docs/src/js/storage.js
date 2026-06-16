// ─── Pipeline storage — server-backed, account-scoped ─────────────────────────
// The saved pipeline now lives on the SERVER (user_pipeline, via the get_pipeline/
// save_pipeline RPCs) so it follows the account across devices and survives a
// browser clear. Anonymous users have NO pipeline (Option A) — saveDeal() gates on
// sign-in before anything is persisted.
//
// getDeals()/saveDeals() stay SYNCHRONOUS (pipeline.js calls them inline) by working
// against an in-memory cache. The async server I/O happens around them:
//   • hydratePipeline()    — pull the server pipeline into the cache (sign-in / boot)
//   • saveDeals()          — update the cache now, push to the server fire-and-forget
//   • clearPipelineCache() — drop the cache on sign-out (anonymous = empty)

import { supabase } from './supabaseClient.js';
import { isSignedIn } from './auth.js';

// Signed-in Starter keeps a small "taste" pipeline; Investor/Pro are unlimited.
export const FREE_DEAL_CAP = 2;

let _cache = [];  // current pipeline, in memory (source of truth is the server)

// Synchronous read for the UI. Returns a copy so callers can't mutate the cache.
export function getDeals() { return _cache.slice(); }

// Replace the pipeline: update the cache immediately, then push to the server when
// signed in (fire-and-forget). Anonymous calls never reach here — saveDeal() gates.
export function saveDeals(d) {
  _cache = Array.isArray(d) ? d : [];
  if (isSignedIn()) pushPipeline();
}

async function pushPipeline() {
  if (!isSignedIn()) return;
  try {
    const { error } = await supabase.rpc('save_pipeline', { p_deals: _cache });
    if (error) console.warn('Pipeline save failed:', error);
  } catch (e) {
    console.warn('Pipeline save failed:', e);
  }
}

// Pull the signed-in user's pipeline from the server into the cache. Called on
// sign-in and at boot when a session is restored. Returns the deals.
export async function hydratePipeline() {
  if (!isSignedIn()) { _cache = []; return _cache; }
  try {
    const { data, error } = await supabase.rpc('get_pipeline');
    if (error) { console.warn('Pipeline load failed:', error); return _cache; }
    _cache = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('Pipeline load failed:', e);
  }
  return _cache;
}

// On sign-out, drop the cache so the next (anonymous) view shows nothing.
export function clearPipelineCache() { _cache = []; }
