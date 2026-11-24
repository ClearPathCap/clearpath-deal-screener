// ─── crm-relay — drains account_event_outbox to CPC's CRM (LOCAL DRAFT) ─────────────
// Overnight wave 2026-11-24, Workstream C. NOT DEPLOYED, NOT SCHEDULED. Activation steps and
// owner decisions: _Records\Owner_Decisions_and_Ratifications\DEALFIT_CPC_CRM_ACCOUNT_EVENTS_CONTRACT_2026-11-24.md
//
// Invoked on a schedule (e.g. every 5 minutes) with the service role; never by browsers:
// the function refuses any call without the scheduler's bearer secret. Secrets (by name only):
//   CPC_CRM_EVENTS_ENDPOINT   https://clearpathcapfunding.com/api/integrations/dealfit/account-events
//   CPC_CRM_EVENTS_SECRET     shared HMAC secret (≥ 32 chars), the same value configured at CPC
//   CRM_RELAY_INVOKE_SECRET   bearer the scheduler presents
//   DEALFIT_CRM_EVENTS_ENABLED 'true' to send; anything else = dry run (claims nothing)
import { createClient } from 'npm:@supabase/supabase-js@2';   // same import as the other Edge Functions
import { drain } from '../_shared/crm_event.mjs';

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') || '';
  const want = Deno.env.get('CRM_RELAY_INVOKE_SECRET') || '';
  if (!want || auth !== `Bearer ${want}`) return new Response('forbidden', { status: 403 });
  if (Deno.env.get('DEALFIT_CRM_EVENTS_ENABLED') !== 'true') {
    return Response.json({ enabled: false, claimed: 0 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const update = (id: number, patch: Record<string, unknown>) => db.from('account_event_outbox').update(patch).eq('id', id);
  const outbox = {
    claim: async (limit: number) => { const { data, error } = await db.rpc('claim_account_events', { p_limit: limit }); if (error) throw error; return data ?? []; },
    markDelivered: (row: any, status: number, attempts: number) => update(row.id, { status: 'delivered', attempts, last_status: status, last_error: null, delivered_at: new Date().toISOString() }),
    markRetry: (row: any, status: number | null, error: string, nextAt: string, attempts: number) => update(row.id, { attempts, last_status: status, last_error: error.slice(0, 300), next_attempt_at: nextAt }),
    markDead: (row: any, status: number | null, error: string, attempts: number) => update(row.id, { status: 'dead', attempts, last_status: status, last_error: error.slice(0, 300) }),
  };
  const result = await drain({ outbox, endpoint: Deno.env.get('CPC_CRM_EVENTS_ENDPOINT')!, secret: Deno.env.get('CPC_CRM_EVENTS_SECRET')! });
  return Response.json({ enabled: true, ...result });
});
