// ─── Commercial C2 — finish the task that needed sign-in ─────────────────────
// Two intents, both created only by an explicit tap while signed out:
//
// SAVE  (memory only, this page, 15 minutes). Tapping Save signed out notes WHICH
//       analysis was on screen (the result object itself, by identity). After a
//       sign-in completed in THIS tab, the save finishes once the account's own
//       pipeline has loaded — only if that exact analysis is still on screen, the
//       form holds no account's saved deal, no saved deal is under review, the
//       deal is not already saved (fixed id = idempotent) and the pipeline has
//       room. Anything else drops the intent and says so; nothing is ever written
//       to another account, merged, overwritten or duplicated. No form data is
//       persisted anywhere (a page reload simply forgets the intent).
//
// PLAN  (sessionStorage, this tab, 15 minutes; the value is the plan name only).
//       Tapping Subscribe signed out remembers the plan. After sign-in the sheet
//       offers "Continue to <plan> checkout". Remembering a plan NEVER starts a
//       checkout or a charge: only a further explicit tap does, and the server
//       still decides (already-entitled and plan-change refusals are unchanged).
//
// Both are cancelled when the person closes the sign-in sheet without signing
// in, and on sign-out.

export const RESUME_TTL_MS = 15 * 60 * 1000;   // same lifetime as a pending sign-in code
export const PLAN_KEY = 'dealfit.pendingPlan';
export const RESUMABLE_PLANS = ['investor', 'pro'];

const fresh = (at, t) => Number.isFinite(at) && t - at >= 0 && t - at < RESUME_TTL_MS;

export function createSaveIntent(now = () => Date.now()) {
  let cur = null;
  return {
    // A save with nothing analyzed yet has nothing to finish.
    note(type, result) {
      const t = now();
      cur = (type && result && typeof result === 'object') ? { type, result, at: t, dealId: t } : null;
      return cur;
    },
    peek() { if (cur && !fresh(cur.at, now())) cur = null; return cur; },
    take() { const c = this.peek(); cur = null; return c; },
    cancel() { cur = null; },
  };
}

export function createPlanIntent(store, now = () => Date.now()) {
  const read = () => { try { return store ? store.getItem(PLAN_KEY) : null; } catch { return null; } };
  const drop = () => { try { if (store) store.removeItem(PLAN_KEY); } catch { /* nothing held */ } };
  return {
    note(tier) {
      if (!RESUMABLE_PLANS.includes(tier)) { drop(); return null; }
      try { if (store) store.setItem(PLAN_KEY, JSON.stringify({ tier, at: now() })); } catch { /* not remembered */ }
      return { tier };
    },
    peek() {
      const raw = read();
      if (!raw) return null;
      let v = null;
      try { v = JSON.parse(raw); } catch { v = null; }
      if (!v || !RESUMABLE_PLANS.includes(v.tier) || !fresh(v.at, now())) { drop(); return null; }
      return { tier: v.tier };
    },
    cancel: drop,
  };
}

// The one decision: what to do with a pending save right now.
//   s.loadState: storage.pipelineLoadState() — 'idle' | 'loading' | 'ok' | 'failed'
//   s.owner:     the account whose saved deal the form holds ('' = unowned)
export function saveResumeDecision(intent, s) {
  if (!intent) return { action: 'none' };
  if (!s || !s.signedIn) return { action: 'wait' };
  if (s.loadState === 'failed') return { action: 'wait', reason: 'unreachable' };
  if (s.loadState !== 'ok') return { action: 'wait' };
  if (s.owner) return { action: 'drop', reason: 'owned' };
  if (s.reviewing) return { action: 'drop', reason: 'review' };
  if (s.currentResult !== intent.result) return { action: 'drop', reason: 'changed' };
  const deals = Array.isArray(s.deals) ? s.deals : [];
  if (deals.some(d => d && d.id === intent.dealId)) return { action: 'drop', reason: 'already-saved' };
  if (deals.length >= s.allowance) return { action: 'drop', reason: 'full' };
  return { action: 'save' };
}

export const RESUME_DROP_MSG = {
  owned:           'Signed in. Tap Save to save this deal.',
  review:          'Signed in. Tap Save to save this deal.',
  changed:         'Signed in. The analysis changed — tap Save to save the one on screen.',
  'already-saved': 'Signed in — this deal is already in your pipeline.',
  full:            'Signed in. Your pipeline is full — delete a deal you’re done with, then tap Save.',
};
export const RESUME_WAIT_MSG = 'Signed in. Your saved deals haven’t loaded yet — this deal will save as soon as they do.';
export const RESUME_SAVED_MSG = 'Signed in — deal saved to your pipeline';

// The page-wide pending save (pipeline.js notes it; main.js finishes it).
export const pendingSave = createSaveIntent();
