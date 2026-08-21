// ─── Supabase client ──────────────────────────────────────────────────────────
// Magic-link auth + entitlement reads. The PUBLISHABLE key is meant to live in
// browser code — Row-Level Security (not key secrecy) is what protects the data.
// The secret key is never used here; it only appears in Phase 2 (Stripe) server
// secrets, which the owner sets in the Supabase dashboard.
//
// If sign-in ever errors with an "Invalid API key" message, this project's
// publishable key may need swapping for the Legacy "anon" key (Supabase
// dashboard → Settings → API Keys → "Legacy anon, service_role API keys").

// EXACT-PINNED (R1 stabilization): the floating @2 range let esm.sh change the
// shipped SDK bytes without a DealFit commit or deploy — production behavior
// must never drift under the CDN's feet. Bump deliberately, never by float.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

const SUPABASE_URL = 'https://qbddbblhduzwcfwslbac.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-9yLyv7rA5tkjKv_HEPe8A_iCvRq-xf';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // completes the magic-link redirect automatically
  },
});
