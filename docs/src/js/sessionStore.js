// ─── Session storage for supabase-js — Keychain / Keystore in the app ───────
// Native-readiness wave (local). supabase-js keeps the signed-in session (access
// + refresh token) in its `auth.storage`. Today that is the browser's
// localStorage, under the SDK-derived key sb-qbddbblhduzwcfwslbac-auth-token.
//
// WEB: authStorageOption() returns {} — supabaseClient.js passes NO storage
// option, so the SDK picks globalThis.localStorage itself, exactly as before: same
// object, same key, same persistence, same detectSessionInUrl (false). This is
// pinned by tests/native.test.mjs against the real vendored SDK.
//
// APP (Capacitor, native only): the session goes to the OS secure store through a
// shell plugin that satisfies SECURE_STORE_CONTRACT below (iOS Keychain,
// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly; Android Keystore-backed
// encryption). WebView localStorage is never used for tokens in the app: iOS may
// evict it, and it is readable by any script in the page. If the shell lacks the
// plugin, the session is held in memory only (signed in for this launch, never
// written in the clear) — fail closed.
//
// Sign-out and account switch: supabase-js removes its keys through this same
// adapter (signOut → _removeSession → removeItem for the session, the -user and
// every code-verifier key, even when the network call fails), and a new sign-in
// overwrites the one session key. Nothing else holds a token.
import { isNative, plugin } from './platform.js';

export const SECURE_STORE_PLUGIN = 'SecureStoragePlugin';
// The contract a shell plugin must meet (promise methods):
//   get({ key }) → { value: string }   (rejects or returns no value when absent)
//   set({ key, value }) → void
//   remove({ key }) → void
export const SECURE_STORE_CONTRACT = ['get', 'set', 'remove'];

// backend: an object meeting the contract, or null (memory only).
// legacy:  the WebView's localStorage (a token found there is moved, then removed).
export function createSecureSessionStorage(backend, legacy) {
  const mem = new Map();
  const ok = !!(backend && SECURE_STORE_CONTRACT.every(m => typeof backend[m] === 'function'));
  const migrated = new Set();
  const lsGet = (k) => { try { return legacy ? legacy.getItem(k) : null; } catch { return null; } };
  const lsDel = (k) => { try { if (legacy) legacy.removeItem(k); } catch {} };

  async function readSecure(key) {
    if (!ok) return mem.has(key) ? mem.get(key) : null;
    try {
      const r = await backend.get({ key });
      const v = r && typeof r.value === 'string' ? r.value : null;
      return v !== null ? v : (mem.has(key) ? mem.get(key) : null);
    } catch { return mem.has(key) ? mem.get(key) : null; }
  }
  async function writeSecure(key, value) {
    if (ok) {
      try { await backend.set({ key, value }); mem.delete(key); return; } catch { /* fall through to memory */ }
    }
    mem.set(key, value);   // this launch only — never localStorage
  }
  // Move a token a WebView build left in localStorage into the secure store, once.
  async function migrate(key) {
    if (migrated.has(key)) return;
    migrated.add(key);
    const v = lsGet(key);
    if (v === null || v === undefined) return;
    if ((await readSecure(key)) === null) await writeSecure(key, v);
    lsDel(key);
  }
  return {
    secure: ok,
    async getItem(key) { await migrate(key); return readSecure(key); },
    async setItem(key, value) { await migrate(key); await writeSecure(key, String(value)); },
    async removeItem(key) {
      migrated.add(key);
      mem.delete(key);
      lsDel(key);
      if (ok) { try { await backend.remove({ key }); } catch {} }
    },
  };
}

// The extra createClient auth option(s): none on the web; the secure adapter in the app.
export function authStorageOption() {
  if (!isNative()) return {};
  let legacy = null;
  try { legacy = typeof localStorage !== 'undefined' ? localStorage : null; } catch {}
  return { storage: createSecureSessionStorage(plugin(SECURE_STORE_PLUGIN), legacy) };
}
