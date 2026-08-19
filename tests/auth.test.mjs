// Wave 5 · REAL-auth suite: exercises the real shipped auth.js (and the real
// tiers.js cache writer) against a scripted provider stub, substituted ONLY in
// this Node process by tests/_hooks (plan v1.1 C-2 — no production seam).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/auth.test.mjs
//
// wave-a1 stubs auth.js itself at the module boundary; a stub of auth.js is
// not proof of auth behavior. This suite is the missing pin: current_tier
// resolution, Starter fail-closed fallbacks, cache-never-grants, sign-out
// teardown, and the SR-3 law that entitlement sync is UNCONDITIONAL.
//
// [DEFECT-CLOSING] tags mark behavior the BASELINE (20a74620) got wrong: with
// a dev flag present, baseline auth.js skipped syncEntitlement entirely, so a
// self-written localStorage tier ruled the UI. Proven failing against the
// baseline before the fix; passing after.

// Minimal browser-global shims (tiers.js touches localStorage at call time;
// `location` must exist so the BASELINE dev-flag suppression path actually
// executes in Node — without it, baseline devModeVisible() threw into its
// catch-false and the defect could not reproduce here).
globalThis.location = { search: '', href: 'https://dealfit.example/' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

const auth = await import('../docs/src/js/auth.js');
const tiers = await import('../docs/src/js/tiers.js');

const rpcTier = (v) => ({ current_tier: { data: v, error: null } });
const session = { user: { id: 'u-test', email: 'qa@example.com' } };

// ── 1. signed-out → starter, and no RPC is attempted ─────────────────────────
globalThis.__stubSupabase = { session: null, rpc: rpcTier('pro') };
await auth.initAuthAndEntitlement();
ok("signed-out boot resolves starter", tiers.getActiveTier() === 'starter');
ok("signed-out boot never calls current_tier",
   !(globalThis.__stubSupabase.rpcCalls ?? []).some(c => c.name === 'current_tier'));

// ── 2. [DEFECT-CLOSING · SR-3] sync is UNCONDITIONAL — a dev flag + self-written
//      cache cannot survive boot. At baseline the flag suppressed the sync and
//      'pro' persisted; now the server answer always lands.
store.set('cpcDevUnlock', '1');
store.set('tier', 'pro');
globalThis.__stubSupabase = { session, rpc: rpcTier(null) };  // server: no paid tier
await auth.initAuthAndEntitlement();
ok("[DEFECT-CLOSING] dev flag cannot suppress sync — self-set 'pro' corrected to starter",
   tiers.getActiveTier() === 'starter');
ok("[DEFECT-CLOSING] sync actually queried the server despite the dev flag",
   (globalThis.__stubSupabase.rpcCalls ?? []).some(c => c.name === 'current_tier'));
store.delete('cpcDevUnlock');

// ── 3. server tier resolution reaches the cache through setCachedTier ────────
globalThis.__stubSupabase = { session, rpc: rpcTier('investor') };
ok("investor resolves", await auth.syncEntitlement() === 'investor' && tiers.getActiveTier() === 'investor');
globalThis.__stubSupabase = { session, rpc: rpcTier('pro') };
ok("pro resolves", await auth.syncEntitlement() === 'pro' && tiers.getActiveTier() === 'pro');

// ── 4. garbage/invalid provider data fails closed to starter ─────────────────
for (const garbage of ['PRO ', 'Pro', 42, null, {}, ['pro'], 'admin', 'starter ']) {
  globalThis.__stubSupabase = { session, rpc: rpcTier(garbage) };
  const got = await auth.syncEntitlement();
  ok(`garbage rpc value ${JSON.stringify(garbage)} → starter`, got === 'starter' && tiers.getActiveTier() === 'starter');
}

// ── 5. rpc error / throw fails closed to starter ─────────────────────────────
globalThis.__stubSupabase = { session, rpc: { current_tier: { data: null, error: { message: 'boom' } } } };
ok("rpc error → starter", await auth.syncEntitlement() === 'starter');
globalThis.__stubSupabase = { session, rpcThrows: true };
ok("rpc throw → starter", await auth.syncEntitlement() === 'starter');

// ── 6. cache never grants: pre-seeded cache is overwritten by server truth ───
store.set('tier', 'pro');
globalThis.__stubSupabase = { session, rpc: rpcTier(null) };
await auth.syncEntitlement();
ok("pre-seeded localStorage 'pro' is corrected by the server answer", tiers.getActiveTier() === 'starter');

// ── 7. auth-change events re-sync (the subscription wired at boot) ───────────
globalThis.__stubSupabase = { session, rpc: rpcTier('investor') };
await globalThis.__stubAuthCallback('SIGNED_IN', session);
ok("auth-change event re-syncs tier", tiers.getActiveTier() === 'investor');
ok("isSignedIn true after event", auth.isSignedIn() === true);

// ── 8. sign-out teardown: provider signOut + cache reset to starter ──────────
globalThis.__stubSupabase = { session: null, rpc: rpcTier(null) };
await auth.signOutAccount();
ok("sign-out resets the cache to starter", tiers.getActiveTier() === 'starter');
await globalThis.__stubAuthCallback('SIGNED_OUT', null);
ok("signed-out state after event", auth.isSignedIn() === false);
ok("post-sign-out tier stays starter", tiers.getActiveTier() === 'starter');

// ── 9. the only sanctioned cache writer validates its vocabulary ─────────────
tiers.setCachedTier('bogus');
ok("setCachedTier rejects unknown vocabulary", tiers.getActiveTier() === 'starter');
tiers.setCachedTier('investor');
ok("setCachedTier accepts known vocabulary", tiers.getActiveTier() === 'investor');
tiers.setCachedTier('starter');

console.log(`\nauth: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Real-auth entitlement chain holds ✓");
