// ─── Overnight wave 2026-11-24, Workstream C: DealFit → CPC CRM account events (LOCAL) ───
// The relay logic (supabase/functions/_shared/crm_event.mjs) against an in-process REFERENCE
// receiver that implements CPC's side of the contract (HMAC check, ±300 s, idempotent by
// event_id, minimal record). Synthetic identities, 127.0.0.1 only. Plus static checks of the
// outbox migration (0016). Run: node tests/crmrelay.test.mjs
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = await import('../supabase/functions/_shared/crm_event.mjs');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

const SECRET = 'test-secret-0123456789abcdef0123456789';   // synthetic
const row = (o = {}) => ({ id: o.id ?? 1, event_type: 'account_verified', user_id: o.user_id ?? '11111111-1111-4111-8111-111111111111',
  email: o.email ?? 'New.Investor@Example.test', occurred_at: '2026-11-24T05:00:00.000Z', attempts: o.attempts ?? 0, status: 'pending',
  idempotency_key: o.idempotency_key ?? ('dealfit:account_verified:' + (o.user_id ?? '11111111-1111-4111-8111-111111111111')) });

console.log('— §P payload ─');
const ev = E.buildEvent(row());
ok(JSON.stringify(Object.keys(ev).sort()) === JSON.stringify(['account', 'classification', 'event_id', 'marketing_consent', 'occurred_at', 'schema', 'source'])
   && JSON.stringify(Object.keys(ev.account).sort()) === JSON.stringify(['dealfit_user_id', 'email']), 'P1 the payload carries only id, email, time, source and classification — no deal, property, code or token fields');
ok(ev.account.email === 'new.investor@example.test' && ev.source === 'DealFit' && ev.classification === 'platform_account' && ev.marketing_consent === false && ev.schema === 'dealfit.account_verified.v1',
   'P2 source "DealFit", classification platform_account (not a borrowing lead), marketing_consent false, email lower-cased');
let threw = 0; for (const bad of [{ email: 'not-an-email' }, { idempotency_key: 'x' }]) { try { E.buildEvent(row(bad)); } catch { threw++; } }
try { E.buildEvent({ ...row(), event_type: 'deal_saved' }); } catch { threw++; }
ok(threw === 3, 'P3 malformed email, a mismatched idempotency key and any other event type are refused');

console.log('— §S signature ─');
const body = JSON.stringify(ev); const ts = 1795500000;
const sig = await E.sign(SECRET, ts, body);
ok(/^v1=[0-9a-f]{64}$/.test(sig) && await E.verifySignature(SECRET, ts, body, sig, ts + 10), 'S1 HMAC-SHA256 over "<ts>.<body>" verifies');
ok(!(await E.verifySignature(SECRET, ts, body.replace('DealFit', 'Dealfit'), sig, ts)) && !(await E.verifySignature('wrong-secret-0123456789abcdef0123456', ts, body, sig, ts)),
   'S2 a changed body or a different secret fails');
ok(!(await E.verifySignature(SECRET, ts, body, sig, ts + 301)) && !(await E.verifySignature(SECRET, ts, body, sig, ts - 301)), 'S3 a timestamp more than 300 s off fails (replay window)');
threw = 0; try { await E.sign('short', ts, body); } catch { threw = 1; } ok(threw === 1, 'S4 a missing / short secret refuses to sign');

console.log('— §C classification + backoff ─');
ok(['delivered', 'delivered', 'delivered', 'dead', 'dead', 'retry', 'retry', 'retry', 'retry'].join() === [200, 201, 409, 400, 422, 401, 403, 500, 503].map(E.classify).join(),
   'C1 2xx/409 delivered · 400/422 dead · 401/403/5xx retry');
const t0 = Date.parse('2026-11-24T00:00:00Z');
ok(E.nextAttemptAt(1, t0) === '2026-11-24T00:01:00.000Z' && E.nextAttemptAt(2, t0) === '2026-11-24T00:05:00.000Z' && E.nextAttemptAt(7, t0) === '2026-11-25T00:00:00.000Z' && E.nextAttemptAt(99, t0) === '2026-11-25T00:00:00.000Z',
   'C2 backoff 1 m, 5 m … capped at 24 h');

// ── reference receiver (what CPC must implement) ──────────────────────────────
const stored = new Map(); let mode = 'ok'; const seenRequests = [];
const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', d => raw += d); req.on('end', async () => {
    seenRequests.push({ headers: req.headers, raw });
    if (mode === 'down') { res.writeHead(503); return res.end(); }
    if (mode === 'slow') { return setTimeout(() => { try { res.writeHead(200); res.end('{}'); } catch {} }, 500); }
    const good = await E.verifySignature(SECRET, req.headers['x-dealfit-timestamp'], raw, req.headers['x-dealfit-signature']);
    if (!good) { res.writeHead(401); return res.end(); }
    let p; try { p = JSON.parse(raw); } catch { res.writeHead(400); return res.end(); }
    if (p.schema !== 'dealfit.account_verified.v1' || p.event_id !== req.headers['x-dealfit-event-id']) { res.writeHead(422); return res.end(); }
    if (stored.has(p.event_id)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"status":"duplicate"}'); }
    stored.set(p.event_id, { email: p.account.email, source: p.source, classification: p.classification, enrolled: false });
    res.writeHead(201, { 'content-type': 'application/json' }); res.end('{"status":"created"}');
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const endpoint = `http://127.0.0.1:${server.address().port}/api/integrations/dealfit/account-events`;

// in-memory outbox adapter (mirrors the Edge Function's updates)
const mkOutbox = (rows) => {
  const log = [];
  return { rows, log,
    claim: async (limit) => rows.filter(r => r.status === 'pending' && Date.parse(r.next_attempt_at || 0) <= Date.now()).slice(0, limit),
    markDelivered: async (r, status, attempts) => { Object.assign(r, { status: 'delivered', attempts, last_status: status }); log.push(['delivered', r.id, status]); },
    markRetry: async (r, status, error, nextAt, attempts) => { Object.assign(r, { attempts, last_status: status, last_error: error, next_attempt_at: nextAt }); log.push(['retry', r.id, status, error]); },
    markDead: async (r, status, error, attempts) => { Object.assign(r, { status: 'dead', attempts, last_status: status, last_error: error }); log.push(['dead', r.id, status, error]); },
  };
};

console.log('— §D drain end-to-end against the reference receiver ─');
const ob = mkOutbox([row({ id: 1 }), { ...row({ id: 2, user_id: '22222222-2222-4222-8222-222222222222', email: 'broken' }) }]);
let res = await E.drain({ outbox: ob, endpoint, secret: SECRET });
ok(res.delivered === 1 && res.dead === 1 && stored.size === 1 && stored.get('dealfit:account_verified:11111111-1111-4111-8111-111111111111').source === 'DealFit',
   'D1 a verified account is delivered once and recorded with source DealFit; a malformed row is dead-lettered, never sent (' + JSON.stringify(res) + ')');
ok(seenRequests.length === 1 && seenRequests[0].headers['x-dealfit-event-id'] === 'dealfit:account_verified:11111111-1111-4111-8111-111111111111' && !/broken/.test(seenRequests.map(s => s.raw).join()),
   'D2 one request, carrying the idempotency key header');
ob.rows[0].status = 'pending'; ob.rows[0].next_attempt_at = null;   // a duplicate delivery (re-queued / relay crash after send)
res = await E.drain({ outbox: ob, endpoint, secret: SECRET });
ok(res.delivered === 1 && stored.size === 1, 'D3 a duplicate delivery is idempotent at the receiver (stored once) and the row ends delivered');
ok(![...stored.values()].some(v => v.enrolled) && [...stored.values()].every(v => v.classification === 'platform_account'), 'D4 nothing is enrolled in outreach; the record is a platform account, not a lead');

console.log('— §R failures, retries, recovery ─');
mode = 'down'; const ob2 = mkOutbox([row({ id: 3, user_id: '33333333-3333-4333-8333-333333333333' })]);
const before = Date.now();
res = await E.drain({ outbox: ob2, endpoint, secret: SECRET });
const r3 = ob2.rows[0];
ok(res.retried === 1 && r3.status === 'pending' && r3.attempts === 1 && r3.last_status === 503 && Date.parse(r3.next_attempt_at) - before >= 59000,
   'R1 CPC down (503): the row stays pending, attempts 1, retried in ≥ 1 minute');
r3.attempts = 7; r3.next_attempt_at = null;
res = await E.drain({ outbox: ob2, endpoint, secret: SECRET });
ok(res.dead === 1 && r3.status === 'dead' && r3.attempts === 8, 'R2 after 8 attempts the row is dead-lettered (an operator can re-queue it)');
mode = 'ok'; r3.status = 'pending'; r3.next_attempt_at = null;
res = await E.drain({ outbox: ob2, endpoint, secret: SECRET });
ok(res.delivered === 1 && r3.status === 'delivered' && stored.has(r3.idempotency_key), 'R3 recovery: a re-queued row delivers once CPC is back');
const ob3 = mkOutbox([row({ id: 4, user_id: '44444444-4444-4444-8444-444444444444' })]);
res = await E.drain({ outbox: ob3, endpoint, secret: 'a-different-secret-0123456789abcdef01' });
ok(res.retried === 1 && ob3.rows[0].last_status === 401 && !stored.has(ob3.rows[0].idempotency_key), 'R4 a wrong secret (401) is retried, never stored');
const ob4 = mkOutbox([row({ id: 5, user_id: '55555555-5555-4555-8555-555555555555' })]);
res = await E.drain({ outbox: ob4, endpoint: 'http://127.0.0.1:1/x', secret: SECRET });
ok(res.retried === 1 && /^network/.test(ob4.rows[0].last_error) && ob4.rows[0].last_status === null, 'R5 a network failure is retried (status null, short reason)');
mode = 'slow'; const ob5 = mkOutbox([row({ id: 6, user_id: '66666666-6666-4666-8666-666666666666' })]);
res = await E.drain({ outbox: ob5, endpoint, secret: SECRET, timeoutMs: 100 });
ok(res.retried === 1 && ob5.rows[0].last_error === 'timeout', 'R6 a hung receiver times out and is retried');
mode = 'ok';
ok(ob4.rows.concat(ob5.rows, ob3.rows, ob2.rows).every(r => !/@/.test(r.last_error || '')), 'R7 recorded errors never contain the email');
threw = 0; try { await E.drain({ outbox: mkOutbox([]), endpoint: 'http://example.test/x', secret: SECRET }); } catch { threw = 1; }
ok(threw === 1, 'R8 a non-https endpoint (other than local 127.0.0.1 tests) is refused');
// N24 F9: a redirect is never followed; the signed event goes only to the pinned endpoint.
let redirectedHits = 0;
const target = http.createServer((q, s) => { redirectedHits++; s.writeHead(201); s.end('{}'); });
await new Promise(r => target.listen(0, '127.0.0.1', r));
const redir = http.createServer((q, s) => { s.writeHead(307, { location: `http://127.0.0.1:${target.address().port}/elsewhere` }); s.end(); });
await new Promise(r => redir.listen(0, '127.0.0.1', r));
const ob6 = mkOutbox([row({ id: 7, user_id: '77777777-7777-4777-8777-777777777777' })]);
res = await E.drain({ outbox: ob6, endpoint: `http://127.0.0.1:${redir.address().port}/x`, secret: SECRET });
ok(res.retried === 1 && redirectedHits === 0 && ob6.rows[0].last_status === 307 && /redirect/.test(ob6.rows[0].last_error), 'R9 a 307 is not followed (the redirect target receives nothing); the row retries');
target.close(); redir.close();
// N24 F10: a configuration error fails before anything is claimed (no attempts consumed).
let claimed = 0; const spy = { ...mkOutbox([row({ id: 8 })]), claim: async () => { claimed++; return []; } };
threw = 0; try { await E.drain({ outbox: spy, endpoint, secret: '' }); } catch { threw = 1; }
ok(threw === 1 && claimed === 0, 'R10 a missing secret fails before any row is claimed');
let askedLimit = 0; await E.drain({ outbox: { ...mkOutbox([]), claim: async (l) => { askedLimit = l; return []; } }, endpoint, secret: SECRET, limit: 500 });
ok(askedLimit === 25, 'R11 a run claims at most 25 rows (within the lease) — N24 F12');
server.close();

console.log('— §M outbox migration 0016 (static; executed against PGlite separately) ─');
const sql = readFileSync(join(ROOT, 'supabase/migrations/0016_account_verified_events.sql'), 'utf8');
// Re-pinned after N24 review F7: the event keys on the first SIGN-IN of a confirmed address (not on confirmation alone).
ok(/if new\.email is not null\s+and new\.email_confirmed_at is not null\s+and new\.last_sign_in_at is not null\s+and \(tg_op = 'INSERT' or old\.last_sign_in_at is null or old\.email_confirmed_at is null\) then/.test(sql)
   && /after insert or update of email_confirmed_at, last_sign_in_at on auth\.users/.test(sql), 'M1 the event fires once, on the first sign-in of a confirmed address (never merely because a code was sent, even with auto-confirm)');
ok(/exception when others then\s+raise warning/.test(sql), 'M5 a failure to record never blocks sign-up or sign-in (caught, WARNING only) — N24 F6');
ok(/user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/.test(sql) && /least\(p_limit, 25\)/.test(sql), 'M6 deleting the account deletes its event (F8); a claim takes at most 25 rows (F12)');
ok(/on conflict do nothing/.test(sql) && /unique index if not exists account_event_outbox_user_type_uniq on public\.account_event_outbox \(user_id, event_type\)/.test(sql),
   'M2 one event per account, idempotently');
ok(/enable row level security/.test(sql) && /revoke all on table public\.account_event_outbox from public, anon, authenticated/.test(sql)
   && !/grant [^;]* to (anon|authenticated)/.test(sql) && /grant execute on function public\.claim_account_events\(integer\) to service_role/.test(sql),
   'M3 no browser access (RLS, no policies, revoked); only the service role can claim');
{ const table = (sql.match(/create table if not exists public\.account_event_outbox \(([\s\S]*?)\n\);/) || [])[1] || '';
  const cols = table.split('\n').map(l => l.trim()).filter(l => /^[a-z_]+\s+(text|uuid|integer|bigint|timestamptz|jsonb|inet)\b/.test(l)).map(l => l.split(/\s+/)[0]);
  ok(/for update skip locked/.test(sql) && cols.join() === 'id,event_type,user_id,email,occurred_at,idempotency_key,status,attempts,next_attempt_at,last_status,last_error,created_at,delivered_at',
     'M4 overlapping relays never claim the same row; the outbox holds only these columns (no deal, property, token or IP data): ' + cols.join(',')); }

const fn = readFileSync(join(ROOT, 'supabase/functions/crm-relay/index.ts'), 'utf8');
ok(/const expected = `Bearer \$\{want\}`;/.test(fn) && /diff \|= expected\.charCodeAt\(i\)/.test(fn) && /if \(!want \|\| want\.length < 32 \|\| diff !== 0\) return new Response\('forbidden', \{ status: 403 \}\);/.test(fn)
   && /DEALFIT_CRM_EVENTS_ENABLED'\) !== 'true'/.test(fn), 'F1 the relay refuses unauthenticated calls (constant-time bearer compare, N24 F11) and sends nothing unless explicitly enabled');
ok(/\[functions\.crm-relay\]\s+verify_jwt = false/.test(readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8')), 'F2 the gateway passes the scheduler bearer through to the function (verify_jwt=false; the function checks it) — N24 F11');

console.log(`\ncrmrelay: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
