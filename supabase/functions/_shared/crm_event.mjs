// ─── DealFit → CPC CRM account events: relay logic (Deno + Node; no I/O of its own) ─────
// Overnight wave 2026-11-24, Workstream C. LOCAL DRAFT — not deployed, not scheduled.
// Contract: _Records\Owner_Decisions_and_Ratifications\DEALFIT_CPC_CRM_ACCOUNT_EVENTS_CONTRACT_2026-11-24.md
//
// One event type: an account whose email has just been verified (outbox row from migration
// 0016). The payload is the minimum CPC needs to identify the person and label the source:
// the DealFit account id, the email and the verification time. Never deal or property data,
// codes, tokens or IP addresses. Registration is NOT a borrowing lead and NOT consent to
// marketing; the payload says so explicitly so the receiver cannot mistake it.

export const SCHEMA = 'dealfit.account_verified.v1';
export const MAX_ATTEMPTS = 8;
// Backoff after attempt n (1-based): 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h → then dead.
const BACKOFF_S = [60, 300, 1800, 7200, 21600, 43200, 86400];

export function buildEvent(row) {
  if (!row || row.event_type !== 'account_verified') throw new Error('unsupported event type');
  const email = String(row.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('invalid email');
  if (row.idempotency_key !== 'dealfit:account_verified:' + row.user_id) throw new Error('idempotency key mismatch');
  return {
    schema: SCHEMA,
    event_id: row.idempotency_key,
    occurred_at: new Date(row.occurred_at).toISOString(),
    source: 'DealFit',
    classification: 'platform_account',        // NOT a borrowing lead
    marketing_consent: false,                   // registration is not consent; never enroll
    account: { dealfit_user_id: row.user_id, email },
  };
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// HMAC-SHA256 over `${timestamp}.${rawBody}` (the exact bytes sent). Header: v1=<hex>.
export async function sign(secret, timestamp, rawBody) {
  if (!secret || String(secret).length < 32) throw new Error('relay secret missing or too short');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'v1=' + hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`)));
}

// Receiver-side check (reference for CPC; used by the contract tests). Constant-time compare,
// ±300 s timestamp tolerance.
export async function verifySignature(secret, timestamp, rawBody, header, nowS = Math.floor(Date.now() / 1000)) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > 300) return false;
  const want = await sign(secret, ts, rawBody);
  const got = String(header || '');
  if (got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// What to do with a response. 2xx (created / linked / duplicate) and 409 (already have it)
// = delivered. 400 / 413 / 422 = our payload is wrong → dead (retrying cannot help).
// 401 / 403 = secret or clock problem → retry (an operator fixes config). Everything else,
// including network errors and timeouts, retries with backoff until MAX_ATTEMPTS.
export function classify(status) {
  if (status >= 200 && status < 300) return 'delivered';
  if (status === 409) return 'delivered';
  if (status === 400 || status === 413 || status === 422) return 'dead';
  return 'retry';
}
export function nextAttemptAt(attempts, now = Date.now()) {
  const i = Math.min(Math.max(attempts, 1), BACKOFF_S.length) - 1;
  return new Date(now + BACKOFF_S[i] * 1000).toISOString();
}

// Drain due rows. `outbox` adapter: claim(limit) → rows; markDelivered(row, status);
// markRetry(row, status, error, nextAt); markDead(row, status, error). Errors are recorded
// without response bodies or personal data (status code + a short reason only).
export async function drain({ outbox, fetchImpl = fetch, endpoint, secret, limit = 25, now = () => Date.now(), timeoutMs = 10000 }) {
  if (!endpoint || !/^https:\/\//.test(endpoint) && !/^http:\/\/127\.0\.0\.1[:/]/.test(endpoint)) throw new Error('endpoint must be https');
  const rows = await outbox.claim(limit);
  const result = { claimed: rows.length, delivered: 0, retried: 0, dead: 0 };
  for (const row of rows) {
    const attempts = (row.attempts || 0) + 1;
    let body;
    try { body = JSON.stringify(buildEvent(row)); }
    catch (e) { await outbox.markDead(row, null, 'invalid row: ' + e.message, attempts); result.dead++; continue; }
    const ts = Math.floor(now() / 1000);
    let status = 0, reason = '';
    try {
      const signature = await sign(secret, ts, body);
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(endpoint, { method: 'POST', body, signal: ctrl.signal, headers: {
          'Content-Type': 'application/json', 'X-DealFit-Event-Id': row.idempotency_key,
          'X-DealFit-Timestamp': String(ts), 'X-DealFit-Signature': signature } });
        status = res.status; reason = 'http ' + status;
      } finally { clearTimeout(t); }
    } catch (e) { reason = (e && e.name === 'AbortError') ? 'timeout' : ('network: ' + String(e && e.message || e).slice(0, 80)); }
    const verdict = status ? classify(status) : 'retry';
    if (verdict === 'delivered') { await outbox.markDelivered(row, status, attempts); result.delivered++; }
    else if (verdict === 'dead' || attempts >= MAX_ATTEMPTS) { await outbox.markDead(row, status || null, reason, attempts); result.dead++; }
    else { await outbox.markRetry(row, status || null, reason, nextAttemptAt(attempts, now()), attempts); result.retried++; }
  }
  return result;
}
