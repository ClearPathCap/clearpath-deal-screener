// ─── Payments — one adapter interface per platform (inert until enabled) ─────
// Release preparation, native continuation (local). The plans DealFit sells are
// app-feature subscriptions; how they may be sold differs by platform:
//   · web      — the existing Stripe path in main.js (startCheckout →
//                checkout Edge Function → Stripe-hosted page; manageSubscription
//                → portal). UNCHANGED and NOT routed through this module: on
//                the web main.js never calls nativePayment().
//   · iOS      — StoreKit In-App Purchase, or a link out to the web plans page
//                (U.S. storefront), depending on the owner's decision;
//   · Android  — Google Play Billing, or a link out (U.S.), likewise.
// Every native adapter is REFUSED until NATIVE_PAYMENT_CHOICE names it. A refusal
// makes no plugin call, no network request and no storage write — the app shows
// the same neutral message it showed before this module existed.
//
// ENTITLEMENT LAW (one tier source of truth). A user's tier is whatever the
// SERVER reports (auth.js syncEntitlement → the current_tier RPC; tiers.js
// setCachedTier is its only writer). Nothing here reads or writes the tier:
//   · no adapter result carries a tier, whatever a plugin or server returns;
//   · a store purchase is only a PROOF (StoreKit signed transaction / Play
//     purchase token) handed to the server for verification (store-verify,
//     a server function that does not exist yet and is never called while
//     refused); the app then re-reads the tier from the server (deps.sync);
//   · this module never imports tiers.js and never touches localStorage.
//
// Importable in Node with no browser globals (no top-level side effects).

import { isNative, platformId, plugin, call, NATIVE_PAYMENT_MESSAGE } from './platform.js';

export const ADAPTER = Object.freeze({
  WEB_STRIPE: 'web-stripe',
  IOS_STOREKIT: 'ios-storekit',
  IOS_EXTERNAL_LINK: 'ios-external-link',
  ANDROID_PLAY_BILLING: 'android-play-billing',
  ANDROID_EXTERNAL_LINK: 'android-external-link',
});

// The owner's decision (NATIVE_READINESS.md §8; feasibility record §10.1). null =
// every purchase path on that platform is refused. Changing it is a reviewed code
// change shipped with the server verification it needs; it is never read from
// storage, a URL, remote config or the server.
export const NATIVE_PAYMENT_CHOICE = Object.freeze({ ios: null, android: null });

export const PAID_TIERS = Object.freeze(['investor', 'pro']);

// Store product identifiers — PLACEHOLDERS until the store products exist. No real
// identifier is committed; an enabled store adapter refuses a placeholder.
export const STORE_PRODUCTS = Object.freeze({
  investor: Object.freeze({ apple: 'REPLACE_APPLE_PRODUCT_INVESTOR_MONTHLY', google: 'REPLACE_PLAY_PRODUCT_INVESTOR' }),
  pro:      Object.freeze({ apple: 'REPLACE_APPLE_PRODUCT_PRO_MONTHLY',      google: 'REPLACE_PLAY_PRODUCT_PRO' }),
});
const isPlaceholder = (id) => typeof id !== 'string' || !id || id.startsWith('REPLACE_');

// Shell plugin contracts (proposed; the shell's plugin choice is an owner decision):
//   DealFitStoreKit   purchase({productId, appAccountToken}) → {status:'purchased'|'cancelled'|'pending', signedTransaction?}
//                     currentEntitlements() → {signedTransactions: string[]}
//                     showManageSubscriptions() → {}
//                     storefront() → {countryCode}   (StoreKit Storefront; 'USA' for the U.S. storefront)
//   DealFitPlayBilling purchase({productId, obfuscatedAccountId}) → {status, purchaseToken?}
//                     queryPurchases() → {purchaseTokens: string[]}
//   AppLauncher       openUrl({url}) — the SYSTEM browser (a link-out leaves the app).
export const STORE_PLUGIN = Object.freeze({ apple: 'DealFitStoreKit', google: 'DealFitPlayBilling' });
export const SYSTEM_BROWSER_PLUGIN = 'AppLauncher';
// Server functions an enabled adapter would call (NONE exists today). The SERVER
// owns account binding — the client cannot enforce it (NATIVE_READINESS.md §8):
//   store-account-token — returns an opaque per-user token the server stores for the
//                         signed-in account (Apple appAccountToken / Play
//                         obfuscatedAccountId);
//   store-verify        — verifies a proof with Apple / Google, REQUIRES the proof's
//                         account token to equal the caller's stored token, binds the
//                         original transaction / purchase token to ONE user (unique) and
//                         refuses any other user, then writes the grant.
export const SERVER_FN = Object.freeze({ accountToken: 'store-account-token', verify: 'store-verify' });
// Where a link-out goes: the public web app (its plans sheet), where the user signs
// in and uses the existing Stripe checkout. System browser, never the in-app one.
export const EXTERNAL_PLANS_URL = 'https://dealfit.clearpathcapfunding.com/';
const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
// Link-out readiness per store. Google's U.S. external-content-links program needs
// Play Billing Library 8.2.1+, a fresh external-link token and Google's information
// screen before EVERY link-out, per-app enrollment and transaction reporting — none
// of which exists in this shell contract. So the Android link-out is refused even
// when chosen, until that contract is built and this flag is re-pinned (payments P2).
// Apple's U.S. link-out needs no entitlement, but only on the U.S. storefront: the
// adapter checks StoreKit's storefront before opening anything.
export const LINK_PROGRAM_READY = Object.freeze({ apple: true, google: false });

export const PAYMENT_MESSAGES = Object.freeze({
  refused: NATIVE_PAYMENT_MESSAGE,
  signedOut: 'Sign in first — your plan attaches to your account.',
  busy: 'One moment — that’s already open.',
  opened: 'Opening DealFit on the web…',
  submitted: 'Checking your plan…',
  cancelled: 'Purchase canceled — your plan hasn’t changed.',
  pending: 'Purchase pending approval — your plan will update once it’s approved.',
  error: 'The purchase didn’t finish. Your plan hasn’t changed.',
  manageError: 'Subscription management isn’t available right now.',
  restoreError: 'Purchases couldn’t be restored. Your plan hasn’t changed.',
});
// Every adapter answer has exactly this shape — and never a tier.
const messageFor = (status, reason, op) => {
  if (status === 'refused') return reason === 'signed-out' ? PAYMENT_MESSAGES.signedOut : reason === 'busy' ? PAYMENT_MESSAGES.busy : PAYMENT_MESSAGES.refused;
  if (status === 'error') return op === 'manage' ? PAYMENT_MESSAGES.manageError : op === 'restore' ? PAYMENT_MESSAGES.restoreError : PAYMENT_MESSAGES.error;
  return PAYMENT_MESSAGES[status] || PAYMENT_MESSAGES.error;
};
const result = (ok, status, reason, op) => Object.freeze({ ok, status, reason, message: messageFor(status, reason, op) });
const REFUSED = (reason, op) => result(false, 'refused', reason, op);
// Fail closed: a missing isSignedIn dependency counts as signed out.
const signedIn = (deps) => { try { return !!(deps && typeof deps.isSignedIn === 'function' && deps.isSignedIn()); } catch { return false; } };

// Server verification, then the server-truth re-read. The response body is never
// read for a tier or any other entitlement field: only "did the call fail".
async function verifyWithServer(deps, platform, proof) {
  const r = await deps.invoke(SERVER_FN.verify, { platform, ...proof });
  if (!r || r.error) return false;
  return true;
}
async function settle(deps) { try { await deps.sync(); } catch { /* the next load re-reads the tier */ } }

// Every native call is bounded (review R2-1): a store sheet or bridge that never answers must not
// hold the one-operation guard for the rest of the session. A timeout is an error result; if the
// store later completes the purchase, the server learns it from the store's own notification and
// Restore re-verifies it — the app never assumes a grant.
let NATIVE_CALL_TIMEOUT_MS = 120000;
export function setNativeCallTimeout(ms) { NATIVE_CALL_TIMEOUT_MS = ms; }   // tests
const TIMED_OUT = Symbol('timed-out');
async function bounded(P, method, opts) {
  let timer = null;
  const out = await Promise.race([call(P, method, opts), new Promise(r => { timer = setTimeout(() => r(TIMED_OUT), NATIVE_CALL_TIMEOUT_MS); })]);
  clearTimeout(timer);
  if (out === TIMED_OUT) throw new Error('native call timed out');
  return out;
}

function storeAdapter(id, store, enabled, products) {
  const P = () => plugin(STORE_PLUGIN[store]);
  const proofKey = store === 'apple' ? 'signedTransaction' : 'purchaseToken';
  const ready = () => enabled && !!P();
  return Object.freeze({
    id, kind: 'store', store, enabled,
    async purchase(tier, deps) {
      if (!enabled) return REFUSED('not-enabled', 'purchase');
      if (!PAID_TIERS.includes(tier)) return REFUSED('unknown-tier', 'purchase');
      const productId = products && products[tier] ? products[tier][store] : null;
      if (isPlaceholder(productId)) return REFUSED('no-product', 'purchase');
      if (!signedIn(deps)) return REFUSED('signed-out', 'purchase');
      if (!ready()) return REFUSED('no-plugin', 'purchase');
      const tok = await deps.invoke(SERVER_FN.accountToken, { platform: store });
      const token = tok && !tok.error && tok.data && typeof tok.data.token === 'string' ? tok.data.token : null;
      if (!token) return result(false, 'error', 'no-account-token', 'purchase');
      const opts = store === 'apple' ? { productId, appAccountToken: token } : { productId, obfuscatedAccountId: token };
      const out = await bounded(P(), 'purchase', opts);
      if (!out || out.status === 'cancelled') return result(false, 'cancelled', 'user-cancelled', 'purchase');
      if (out.status === 'pending') return result(false, 'pending', 'store-pending', 'purchase');
      const proof = out[proofKey];
      if (out.status !== 'purchased' || typeof proof !== 'string' || !proof) return result(false, 'error', 'no-proof', 'purchase');
      const verified = await verifyWithServer(deps, store, { [proofKey]: proof });
      await settle(deps);
      return verified ? result(true, 'submitted', 'server-verifying', 'purchase') : result(false, 'error', 'verify-failed', 'purchase');
    },
    // Restore sends the store's proofs for the SIGNED-IN account; store-verify grants
    // only a proof whose account token is this caller's (a shared Apple ID / Google
    // account cannot carry a plan into a second DealFit account).
    async restore(deps) {
      if (!enabled) return REFUSED('not-enabled', 'restore');
      if (!signedIn(deps)) return REFUSED('signed-out', 'restore');
      if (!ready()) return REFUSED('no-plugin', 'restore');
      const out = await bounded(P(), store === 'apple' ? 'currentEntitlements' : 'queryPurchases', {});
      const list = out && Array.isArray(out[proofKey + 's']) ? out[proofKey + 's'].filter(s => typeof s === 'string' && s) : [];
      let anyFailed = false;
      for (const p of list) { if (!(await verifyWithServer(deps, store, { [proofKey]: p }))) anyFailed = true; }
      await settle(deps);
      return anyFailed ? result(false, 'error', 'verify-failed', 'restore') : result(true, 'submitted', list.length ? 'server-verifying' : 'nothing-to-restore', 'restore');
    },
    async manage() {
      if (!enabled) return REFUSED('not-enabled', 'manage');
      if (store === 'apple') {
        if (!ready()) return REFUSED('no-plugin', 'manage');
        await bounded(P(), 'showManageSubscriptions', {});
        return result(true, 'opened', 'store-manage', 'manage');
      }
      return openSystem(PLAY_SUBSCRIPTIONS_URL, 'manage');
    },
  });
}

async function openSystem(url, op) {
  const L = plugin(SYSTEM_BROWSER_PLUGIN);
  if (!L) return REFUSED('no-plugin', op);
  await bounded(L, 'openUrl', { url });
  return result(true, 'opened', 'system-browser', op);
}
function linkAdapter(id, store, enabled) {
  const go = (op) => async () => {
    if (!enabled) return REFUSED('not-enabled', op);
    if (!LINK_PROGRAM_READY[store]) return REFUSED('program-not-integrated', op);
    if (store === 'apple') {
      const S = plugin(STORE_PLUGIN.apple);
      const sf = S ? await bounded(S, 'storefront', {}) : null;
      if (!sf || sf.countryCode !== 'USA') return REFUSED('not-us-storefront', op);
    }
    return openSystem(EXTERNAL_PLANS_URL, op);
  };
  // A link-out buys on the web; the app learns the result from the server on its
  // next entitlement read (resume / sign-in), never from the link.
  return Object.freeze({
    id, kind: 'external-link', store, enabled, purchase: go('purchase'), manage: go('manage'),
    // Restore for a link-out is a server re-read: a web purchase is already on the account (review R2-2).
    restore: async (deps) => {
      if (!enabled) return REFUSED('not-enabled', 'restore');
      if (!LINK_PROGRAM_READY[store]) return REFUSED('program-not-integrated', 'restore');
      if (!signedIn(deps)) return REFUSED('signed-out', 'restore');
      await settle(deps);
      return result(true, 'submitted', 'server-read', 'restore');
    },
  });
}

// The web descriptor: main.js keeps the Stripe path; nothing routes the web here.
const WEB = Object.freeze({
  id: ADAPTER.WEB_STRIPE, kind: 'web', enabled: true, routedBy: 'main.js startCheckout / manageSubscription',
  purchase: async () => REFUSED('web-path-in-main'), manage: async () => REFUSED('web-path-in-main'), restore: async () => REFUSED('web-path-in-main'),
});

// products: the store product table (tests pass real-looking ids; the app always uses STORE_PRODUCTS).
export function buildAdapter(id, enabled, products = STORE_PRODUCTS) {
  switch (id) {
    case ADAPTER.IOS_STOREKIT: return storeAdapter(id, 'apple', !!enabled, products);
    case ADAPTER.ANDROID_PLAY_BILLING: return storeAdapter(id, 'google', !!enabled, products);
    case ADAPTER.IOS_EXTERNAL_LINK: return linkAdapter(id, 'apple', !!enabled);
    case ADAPTER.ANDROID_EXTERNAL_LINK: return linkAdapter(id, 'google', !!enabled);
    default: return null;
  }
}
const NATIVE_OPTIONS = Object.freeze({
  ios: [ADAPTER.IOS_STOREKIT, ADAPTER.IOS_EXTERNAL_LINK],
  android: [ADAPTER.ANDROID_PLAY_BILLING, ADAPTER.ANDROID_EXTERNAL_LINK],
});

// The adapter for where the code is running. Web → the web descriptor. Native →
// the chosen adapter (enabled) or, with no valid choice, a refusing one.
export function paymentAdapter(choice = NATIVE_PAYMENT_CHOICE, products = STORE_PRODUCTS) {
  if (!isNative()) return WEB;
  const p = platformId();
  const options = NATIVE_OPTIONS[p] || [];
  const picked = choice && options.includes(choice[p]) ? choice[p] : null;
  return buildAdapter(picked || options[0] || ADAPTER.IOS_STOREKIT, !!picked, products);
}

// main.js's one entry from the app (startCheckout / manageSubscription refuse the
// web Stripe path in the app and come here instead). Never throws. One operation at
// a time: a second tap while one runs is refused (no second token call or store sheet).
// deps: { invoke(fnName, body) → {data, error}, sync() → Promise, isSignedIn() → boolean } — from main.js.
let _busy = false;
export async function nativePayment(op, tier, deps, choice = NATIVE_PAYMENT_CHOICE, products = STORE_PRODUCTS) {
  if (!isNative()) return REFUSED('not-native', op);
  const a = paymentAdapter(choice, products);
  if (!a || !a.enabled) return REFUSED('not-enabled', op);
  if (_busy) return REFUSED('busy', op);
  _busy = true;
  try {
    if (op === 'purchase') return await a.purchase(tier, deps);
    if (op === 'manage') return await a.manage(deps);
    if (op === 'restore') return await a.restore(deps);
    return REFUSED('unknown-op', op);
  } catch {
    return result(false, 'error', 'exception', op);
  } finally {
    _busy = false;
  }
}
