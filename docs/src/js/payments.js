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
//   DealFitPlayBilling purchase({productId, obfuscatedAccountId}) → {status, purchaseToken?}
//                     queryPurchases() → {purchaseTokens: string[]}
//   AppLauncher       openUrl({url}) — the SYSTEM browser (a link-out leaves the app).
export const STORE_PLUGIN = Object.freeze({ apple: 'DealFitStoreKit', google: 'DealFitPlayBilling' });
export const SYSTEM_BROWSER_PLUGIN = 'AppLauncher';
// Server functions an enabled adapter would call (NONE exists today):
//   store-account-token — returns an opaque per-user token the server binds to the
//                         signed-in account (Apple appAccountToken / Play
//                         obfuscatedAccountId), so store notifications map to the user;
//   store-verify        — verifies a proof with Apple / Google and writes the grant.
export const SERVER_FN = Object.freeze({ accountToken: 'store-account-token', verify: 'store-verify' });
// Where a link-out goes: the public web app, where the user signs in and uses the
// existing Stripe checkout. Opened in the system browser, never the in-app one.
export const EXTERNAL_PLANS_URL = 'https://dealfit.clearpathcapfunding.com/';
const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

export const PAYMENT_MESSAGES = Object.freeze({
  refused: NATIVE_PAYMENT_MESSAGE,
  opened: 'Opening DealFit on the web…',
  submitted: 'Checking your plan…',
  cancelled: 'Purchase canceled — your plan hasn’t changed.',
  pending: 'Purchase pending approval — your plan will update once it’s approved.',
  error: 'The purchase didn’t finish. Your plan hasn’t changed.',
});
// Every adapter answer has exactly this shape — and never a tier.
const result = (ok, status, reason) => Object.freeze({ ok, status, reason, message: PAYMENT_MESSAGES[status] || PAYMENT_MESSAGES.error });
const REFUSED = (reason) => result(false, 'refused', reason);

// Server verification, then the server-truth re-read. The response body is never
// read for a tier or any other entitlement field: only "did the call fail".
async function verifyWithServer(deps, platform, proof) {
  const r = await deps.invoke(SERVER_FN.verify, { platform, ...proof });
  if (!r || r.error) return false;
  return true;
}
async function settle(deps) { try { await deps.sync(); } catch { /* the next load re-reads the tier */ } }

function storeAdapter(id, store, enabled, products) {
  const P = () => plugin(STORE_PLUGIN[store]);
  const proofKey = store === 'apple' ? 'signedTransaction' : 'purchaseToken';
  const ready = () => enabled && !!P();
  return Object.freeze({
    id, kind: 'store', store, enabled,
    async purchase(tier, deps) {
      if (!enabled) return REFUSED('not-enabled');
      if (!PAID_TIERS.includes(tier)) return REFUSED('unknown-tier');
      const productId = products && products[tier] ? products[tier][store] : null;
      if (isPlaceholder(productId)) return REFUSED('no-product');
      if (!ready()) return REFUSED('no-plugin');
      const tok = await deps.invoke(SERVER_FN.accountToken, { platform: store });
      const token = tok && !tok.error && tok.data && typeof tok.data.token === 'string' ? tok.data.token : null;
      if (!token) return result(false, 'error', 'no-account-token');
      const opts = store === 'apple' ? { productId, appAccountToken: token } : { productId, obfuscatedAccountId: token };
      const out = await call(P(), 'purchase', opts);
      if (!out || out.status === 'cancelled') return result(false, 'cancelled', 'user-cancelled');
      if (out.status === 'pending') return result(false, 'pending', 'store-pending');
      const proof = out[proofKey];
      if (out.status !== 'purchased' || typeof proof !== 'string' || !proof) return result(false, 'error', 'no-proof');
      const verified = await verifyWithServer(deps, store, { [proofKey]: proof });
      await settle(deps);
      return verified ? result(true, 'submitted', 'server-verifying') : result(false, 'error', 'verify-failed');
    },
    async restore(deps) {
      if (!enabled) return REFUSED('not-enabled');
      if (!ready()) return REFUSED('no-plugin');
      const out = await call(P(), store === 'apple' ? 'currentEntitlements' : 'queryPurchases', {});
      const list = out && Array.isArray(out[proofKey + 's']) ? out[proofKey + 's'].filter(s => typeof s === 'string' && s) : [];
      let anyFailed = false;
      for (const p of list) { if (!(await verifyWithServer(deps, store, { [proofKey]: p }))) anyFailed = true; }
      await settle(deps);
      return anyFailed ? result(false, 'error', 'verify-failed') : result(true, 'submitted', list.length ? 'server-verifying' : 'nothing-to-restore');
    },
    async manage() {
      if (!enabled) return REFUSED('not-enabled');
      if (store === 'apple') {
        if (!ready()) return REFUSED('no-plugin');
        await call(P(), 'showManageSubscriptions', {});
        return result(true, 'opened', 'store-manage');
      }
      return openSystem(PLAY_SUBSCRIPTIONS_URL);
    },
  });
}

async function openSystem(url) {
  const L = plugin(SYSTEM_BROWSER_PLUGIN);
  if (!L) return REFUSED('no-plugin');
  await call(L, 'openUrl', { url });
  return result(true, 'opened', 'system-browser');
}
function linkAdapter(id, enabled) {
  const go = async () => (enabled ? openSystem(EXTERNAL_PLANS_URL) : REFUSED('not-enabled'));
  // A link-out buys on the web; the app learns the result from the server on its
  // next entitlement read (resume / sign-in), never from the link.
  return Object.freeze({ id, kind: 'external-link', enabled, purchase: go, manage: go, restore: async () => (enabled ? result(true, 'submitted', 'server-read') : REFUSED('not-enabled')) });
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
    case ADAPTER.IOS_EXTERNAL_LINK:
    case ADAPTER.ANDROID_EXTERNAL_LINK: return linkAdapter(id, !!enabled);
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
// web Stripe path in the app and come here instead). Never throws.
// deps: { invoke(fnName, body) → {data, error}, sync() → Promise } — supplied by main.js.
export async function nativePayment(op, tier, deps, choice = NATIVE_PAYMENT_CHOICE, products = STORE_PRODUCTS) {
  try {
    if (!isNative()) return REFUSED('not-native');
    const a = paymentAdapter(choice, products);
    if (!a || !a.enabled) return REFUSED('not-enabled');
    if (op === 'purchase') return await a.purchase(tier, deps);
    if (op === 'manage') return await a.manage(deps);
    if (op === 'restore') return await a.restore(deps);
    return REFUSED('unknown-op');
  } catch {
    return result(false, 'error', 'exception');
  }
}
