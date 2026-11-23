// The REAL vendored Supabase SDK, for tests/f7sdk.test.mjs only. The URL is a dead
// loopback address and every request goes through globalThis.fetch, which that test
// replaces with an in-memory fake before importing anything — no network, no
// production project, no real key. The auth options match docs/src/js/supabaseClient.js,
// except detectSessionInUrl (there is no URL in Node).
import { createClient } from '../../docs/vendor/supabase-js-2.112.3.js';

export const supabase = createClient('http://127.0.0.1:9', 'sb_publishable_test_only_not_a_key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
