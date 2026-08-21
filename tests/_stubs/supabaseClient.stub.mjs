// Scripted Supabase client stub for the Node suites. Behavior is driven by
// globalThis.__stubSupabase so each test scripts sessions/RPC results without
// any network. Shape mirrors exactly what the shipped modules consume.
function cfg() {
  return globalThis.__stubSupabase ?? {};
}

export const supabase = {
  auth: {
    async getSession() {
      const c = cfg();
      if (c.getSessionThrows) throw new Error('stub getSession failure');
      return { data: { session: c.session ?? null } };
    },
    onAuthStateChange(cb) {
      globalThis.__stubAuthCallback = cb;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithOtp() { return { error: cfg().otpError ?? null }; },
    async verifyOtp() {
      const c = cfg();
      return c.verifyResult ?? { data: { session: c.session ?? null }, error: null };
    },
    async signOut() { cfg().signOutCalls = (cfg().signOutCalls ?? 0) + 1; return { error: null }; },
  },
  async rpc(name, args) {
    const c = cfg();
    c.rpcCalls = c.rpcCalls ?? [];
    c.rpcCalls.push({ name, args });
    if (c.rpcThrows) throw new Error('stub rpc failure');
    const r = (c.rpc ?? {})[name];
    if (typeof r === 'function') return r(args);
    return r ?? { data: null, error: { message: 'stub: no handler for ' + name } };
  },
  functions: {
    async invoke(name, opts) {
      const c = cfg();
      c.invokeCalls = c.invokeCalls ?? [];
      c.invokeCalls.push({ name, opts });
      const r = (c.functions ?? {})[name];
      if (typeof r === 'function') return r(opts);   // function entries may throw → rejected invoke
      return r ?? { data: null, error: { message: 'stub' } };
    },
  },
};
