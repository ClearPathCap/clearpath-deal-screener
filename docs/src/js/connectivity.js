// ─── Truthful connectivity state (Mobile Phase 0, 2026-11-22) ────────────────
// Contract:
//   • Works WITHOUT the server: the financial calculators, their inputs and the
//     market benchmarks bundled with the app.
//   • NEEDS the server: sign-in / code check, saved deals (load, save, edit,
//     delete), plan (entitlement) verification, premium market details, market
//     sync, share links, shared-deal views.
//   • A failed request is never shown as a success. "Unreachable" is derived
//     from ACTUAL request outcomes; navigator.onLine is only a hint (a browser
//     can report online while Supabase is unreachable, and the reverse).
//   • Nothing here grants or keeps an entitlement, writes data, or retries a
//     write. Reconnect only re-runs READS (the existing auth → plan → saved
//     deals → markets sync); saves wait for the user to press Save again.
// Display only + read retries. No backend, schema or entitlement change.

const NETWORK_ERROR_NAMES = new Set(['AuthRetryableFetchError', 'FunctionsFetchError', 'FetchError', 'AbortError', 'TimeoutError']);

// True only for "the request never got a server answer": no HTTP status (0 /
// absent with a fetch-class failure), or a fetch-class error name. A server
// answer (any 4xx/5xx, any RPC refusal) is NOT a network failure.
export function isNetworkFailure(err, status) {
  if (status === 0) return true;
  if (!err) return false;
  if (typeof err.status === 'number' && err.status > 0) return false;
  if (err.status === 0) return true;
  if (NETWORK_ERROR_NAMES.has(err.name)) return true;
  if (err.name === 'TypeError' && /fetch|network|load failed/i.test(String(err.message || ''))) return true;
  // PostgREST without throwOnError folds a fetch failure into { message: 'TypeError: Failed to fetch', code: '' }.
  return (err.code === '' || err.code == null) && /^(TypeError|FetchError|AbortError)\b/.test(String(err.message || ''));
}

let _reachable = null;          // null = not yet known, true = a server answer arrived, false = a request could not reach it
const _failedOps = new Set();
const _retryers = [];
let _retrying = false;

export function serverUnreachable() { return _reachable === false; }

// Record the outcome of ONE server call. `ok` = the server answered (even with a
// refusal); otherwise pass the error (+ PostgREST status) for classification.
let _resultSeq = 0;             // bumps on every recorded server outcome
export function noteServerResult(op, { ok = false, error = null, status } = {}) {
  _resultSeq++;
  if (ok || !isNetworkFailure(error, status)) {
    if (_reachable !== true || _failedOps.size) { _reachable = true; _failedOps.clear(); renderNetStatus(); }
    return 'answered';
  }
  _reachable = false;
  _failedOps.add(op);
  renderNetStatus();
  return 'unreachable';
}

// Register a READ-ONLY retry to run once connectivity returns.
export function onReconnect(fn) { if (typeof fn === 'function') _retryers.push(fn); }

export async function retryNow() {
  if (_retrying) return;
  _retrying = true;
  setBusy(true);
  const seq = _resultSeq;
  try { for (const fn of _retryers) { try { await fn(); } catch (e) { console.warn('Reconnect retry failed:', e); } } }
  finally {
    // Nothing to re-read (e.g. signed out after a failed sign-in): there is no fresh
    // evidence either way, so the warning returns to "unknown" instead of claiming
    // offline indefinitely; the next real request re-classifies it.
    if (_resultSeq === seq && _reachable === false) { _reachable = null; _failedOps.clear(); }
    _retrying = false; setBusy(false); renderNetStatus();
  }
}

const browserOffline = () => typeof navigator !== 'undefined' && navigator && navigator.onLine === false;

export const NET_MESSAGE = 'Offline, or DealFit’s server can’t be reached. Calculators keep working on this device. Sign-in, saved deals, plan checks and premium market details need a connection — nothing is saved to your account until it’s back.';

function el() { return typeof document !== 'undefined' && document.getElementById ? document.getElementById('net-status') : null; }
function setBusy(b) { const e = el(); const btn = e && e.querySelector && e.querySelector('button'); if (btn) { btn.disabled = !!b; btn.textContent = b ? 'Retrying…' : 'Retry'; } }

export function renderNetStatus() {
  const e = el();
  if (!e) return;
  const show = serverUnreachable() || browserOffline();
  if (!show) { e.hidden = true; return; }
  const msg = e.querySelector && e.querySelector('.net-status-msg');
  if (msg) msg.textContent = NET_MESSAGE;
  e.hidden = false;
}

// Wire once at boot. 'online' / returning to the tab re-run the read-only
// retries when a request had failed; 'offline' only updates the banner.
export function initConnectivity() {
  const e = el();
  const btn = e && e.querySelector && e.querySelector('button');
  if (btn) btn.addEventListener('click', () => { retryNow(); });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', () => { renderNetStatus(); if (serverUnreachable()) retryNow(); });
    window.addEventListener('offline', () => renderNetStatus());
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && serverUnreachable()) retryNow(); });
  }
  renderNetStatus();
}

