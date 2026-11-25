# DealFit native readiness (iOS / Android via Capacitor 8)

Engineering reference for shipping the same `docs/` files to GitHub Pages and into a Capacitor 8 shell (bundled
files, never a `server.url` live-site wrapper). Written by the native-readiness wave on branch
`product/native-readiness`, stacked on the design-system wave. **Nothing here is published, and no developer account,
paid service or native project exists yet.** Store-payment and account-deletion *decisions* are owner decisions and are
tracked outside this repository.

Status words: **built** = in this branch with Node regressions; **device-only** = cannot be proven without a
signed build on a phone (no JDK/Android SDK or macOS here); **plan** = documented, not built.

## 1. The rule: one code base, web unchanged

Every native difference goes through `docs/src/js/platform.js`. With no native bridge
(`window.Capacitor?.isNativePlatform?.()` not true) each export does exactly what its call site did before, and
`initPlatform()` changes nothing. No native plugin code is loaded on the web: the shell injects its own bridge, and
`platform.js` only talks to it. `tests/native.test.mjs` §A pins this.

**The bridge.** DealFit has no bundler, so `@capacitor/core` is not loaded. A Capacitor 8 shell still pre-fills
`window.Capacitor.Plugins` (Android `JSExport`, iOS `JSExport.swift`):
- every plugin is an object whose methods call `nativePromise` / `nativeCallback`;
- its `addListener` returns a plain `{ remove }`, **not a Promise**. (With core loaded, `addListener` returns a Promise.)

`platform.js` therefore calls plugins only through `call()` and `listen()`, which accept both shapes and never throw.
`main.js` and `sharedView.js` also guard `initPlatform()`, so no shell difference can stop the boot. A plugin listed in
`PluginHeaders` but missing from `Plugins` gets a fallback object built the way `JSExport` builds it. The design wave's
`haptic()` reads `Capacitor.Plugins.Haptics` directly, which the shell provides. `tests/native.test.mjs` §C runs against
all three shapes: pre-filled `JSExport`, core proxies, and unfilled. (Review round 1 found the first version throwing on
the pre-filled shape.)

| Seam | Web (unchanged) | App | Status |
|---|---|---|---|
| Share (`share.js`) | `navigator.share`, then the fallback sheet | `@capacitor/share` (Android WebView has no `navigator.share`); dismissal still shows the fallback. Shared links use the **public** origin (in the app, `location.href` is `capacitor://localhost/…`) | built · device-only |
| External pages (CPC hand-off in `clearpath.js` / `ltr.js` / `brrr.js`, `<a target=_blank>`) | `window.open(url, '_blank', 'noopener')` | in-app browser (`@capacitor/browser`: SFSafariViewController / Custom Tabs). The analyzers are **byte-identical**: in the app a `window.open` shim routes `_blank` calls. A bundled page (`terms.html`, `privacy.html`) opens its **published** copy. `javascript:`, `data:` and cleartext `http:` are refused. `mailto:`/`tel:` go to the system | built · device-only |
| Payment pages (Stripe Checkout / Portal in `main.js`) | `location.href = url` | **refused before any request** (no checkout or portal call, so no Stripe session is created). The message names no other place to pay: "Plans can’t be changed in the app yet." The Subscribe and Manage-subscription buttons are hidden by an injected style (no markup change); plan **prices are still shown**, pending the owner's payment decision. No checkout code exists for the app | built |
| Install prompt (`install.js`) | unchanged | the app counts as installed: no "Get the App", no prompt, no toast | built |
| Hardware Back (Android) | — | `@capacitor/app` `backButton`: when the view stack can step back → `history.back()` (top sheet first, then the previous tab); at the root, or while a required sheet that Back cannot close is on top (the first-launch market picker) → `minimizeApp()` | built · device-only |
| Haptics | no-op | `@capacitor/haptics` selection tick on tab switch (design law: never on a financial result) | built · device-only |
| Status bar / safe area | — | light text (`StatusBar.setStyle DARK`), web content under the bar on Android; the design wave's `viewport-fit=cover` + safe-area padding apply | built · device-only |
| Keyboard | design wave's visual-viewport watcher | `capacitor.config.json` `Keyboard.resize = "native"`; the iOS accessory bar stays visible (§4) | config built · device-only |
| Deep links | — | `appUrlOpen` + `getLaunchUrl` → a bundled page (§5). `shared.html` (`sharedView.js`) sets the platform up too. Its "not available" and offline states now link home (on the web as well) | built · device-only |
| `<html data-platform>` | not set | `ios` / `android` (a hook for later app-only styling) | built |

## 2. Secure session storage

`docs/src/js/sessionStore.js` supplies supabase-js's `auth.storage`.

- **Web:** `authStorageOption()` returns `{}`, so `supabaseClient.js` passes no storage option and the SDK keeps choosing
  `globalThis.localStorage` itself. The storage object, the key `sb-qbddbblhduzwcfwslbac-auth-token`, persistence,
  `autoRefreshToken`, `detectSessionInUrl: false` and the URL-token rejection are therefore identical.
  `tests/native.test.mjs` §B proves it against the **real** shipped `supabaseClient.js` and the vendored SDK, and E9
  pins that `supabaseClient.js` only gained the import and the spread.
- **App:** the session goes to the OS secure store through a shell plugin that meets this contract:
  `get({key}) → {value}`, `set({key, value})`, `remove({key})` (plugin name `SecureStoragePlugin`, one constant to
  change). Required storage class: iOS Keychain `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (not in backups, not
  migrated to a new device); Android Keystore-backed encryption.
  - Candidate: `capacitor-secure-storage-plugin`, whose API matches the contract. **Not verified** against Capacitor 8 or
    its storage class; check both at shell time. The alternative is a ~60-line first-party plugin (Swift Keychain +
    Kotlin `EncryptedSharedPreferences`/Keystore), with no third-party dependency.
  - `@capacitor/preferences` is **not** acceptable for tokens: it is UserDefaults / SharedPreferences, unencrypted.
- **Never WebView localStorage in the app.** A token found there (from a build before this adapter) is moved to the
  secure store, then deleted. If the plugin is missing or a write fails, the session lives in memory for that launch
  only (fail closed: the user signs in again next launch).
- **Sign-out and account switch.** supabase-js `signOut()` removes the session key, the `-user` key and every
  code-verifier key through this adapter, even when the logout request fails (vendored 2.112.3). A new sign-in overwrites
  the single session key. §D proves both through the real SDK: the old account's refresh token is gone after a switch,
  and nothing remains after an offline sign-out.
- **Device-only:** Keychain/Keystore behaviour, the plugin's error shapes, and first-unlock timing after a reboot.

## 3. Navigation

- **Android hardware Back** is wired into the design wave's view stack through one additive export,
  `viewstack.canStepBack()` (the stack's own model is past its root entry). Using the model, not WebView `canGoBack`,
  means Back never walks into entries from an earlier page load (after sign-out the app reloads), and the root press
  backgrounds the app (Android's behaviour for a root activity) instead of doing nothing.
- **iOS edge swipe (plan, device-only).** WKWebView's `allowsBackForwardNavigationGestures` turns the left-edge swipe into
  `history.back()`, which the view stack already treats like the browser Back button. Capacitor has no config key for
  it: the shell needs a `CAPBridgeViewController` subclass that sets it in `capacitorDidLoad()`. Expected behaviour:
  - a swipe closes the top sheet first, then returns to the previous tab at its scroll position;
  - a required sheet (the first-launch market picker) stays, because its entry is put back;
  - at the root there is no previous entry, so the swipe does nothing;
  - to verify on a device: no conflict with horizontal scrolling near the left edge, and the page snapshot iOS shows
    during the swipe must not flash stale content (WebKit captures the previous same-document entry).

## 4. Keyboard

- `capacitor.config.json`: `Keyboard.resize = "native"` (the WebView frame shrinks), `style = "DARK"`,
  `resizeOnFullScreen = true` (Android).
- The design wave's keyboard watcher compares the visual viewport with the tallest viewport seen at that width. That
  works whether the keyboard shrinks only the visual viewport (Safari) or the whole frame (`resize: native`).
- **The iOS accessory bar stays visible** (`setAccessoryBarVisible(true)`). The money and percent fields use decimal
  keypads, which have no return key, so the bar's **Done** is the only way to close them. Enter = Next (design wave)
  covers the text keyboard.
- **Device-only:** Android 15+ edge-to-edge (target SDK 36) changes how `adjustResize` reports insets. Verify that the
  tab bar steps aside and the focused field stays visible on a real Pixel-class device. If not, the remedy is Capacitor's
  system-bar insets handling, not a web change.

## 5. Deep links

### 5.1 `.nojekyll` — what it changes on GitHub Pages (proven)

GitHub Pages currently builds `docs/` with Jekyll 3.10 (live page generator tag), which drops dot-paths such as
`/.well-known/`. `docs/.nojekyll` turns Jekyll off. The difference in what is served:

| Path | Today (Jekyll) | With `.nojekyll` |
|---|---|---|
| Every tracked `docs/` file (76 on this branch, `.nojekyll` included) | copied verbatim: no front matter, no `_`/`.` paths, nothing to compile; the only Markdown file (the phoenix licence) is also served raw — live SHA-256 = repo SHA-256 | the same bytes |
| `/vendor/LICENSES/@supabase__phoenix__LICENSE.html` and the extensionless `…/@supabase__phoenix__LICENSE` | **generated** by Jekyll from the `.md` (a themed HTML page) | gone (404); the raw `.md` licence text stays |
| `/assets/css/style.css` | **generated** by the Pages default theme (76,559 B) | gone (404) |
| `/.nojekyll` | — | an empty file |
| future `/.well-known/…` | dropped | served |

Nothing in DealFit links to the two generated paths (pinned by `tests/native.test.mjs` E6), and E2–E5 pin the tree so a
new `_`/dot path, Markdown page, front matter or Sass file cannot silently change this table. **At release:** re-run the
served-file byte comparison, and confirm the three generated paths are the only disappearances.

### 5.2 Association files (plan — no real IDs)

Add these only when the Apple Team ID and Android signing fingerprint exist (owner B1/B2). Placeholders shown:

`docs/.well-known/apple-app-site-association` (no extension):
```json
{ "applinks": { "details": [ {
  "appIDs": ["<TEAMID>.com.clearpathcapfunding.dealfit"],
  "components": [
    { "/": "/shared.html", "?": { "d": "?*" }, "comment": "read-only shared deal" },
    { "/": "/", "comment": "app home (tool links, sign-in link if ever enabled)" },
    { "/": "/index.html" }
  ] } ] } }
```
`docs/.well-known/assetlinks.json`:
```json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "com.clearpathcapfunding.dealfit",
               "sha256_cert_fingerprints": ["<PLAY APP SIGNING SHA-256>"] } }]
```
- iOS entitlement `applinks:dealfit.clearpathcapfunding.com`. Android: an intent filter with `autoVerify="true"` for
  `https://dealfit.clearpathcapfunding.com` on the paths above.
- The SEO tool pages (`/dscr-calculator/` …), `/privacy.html` and `/terms.html` are **not** claimed: they open in the
  browser.
- **Content type (verify at release):** Pages serves the extensionless AASA as `application/octet-stream`. Check it
  through Apple's CDN (`app-site-association.cdn-apple.com/a/v1/<host>`) and with Google's Digital Asset Links tester.
  If Apple's CDN refuses it, the fallback is a host that sets `application/json` (an owner/infrastructure decision).
- **In the app:** `deepLinkTarget()` accepts only the app's own host over https and maps a link to a bundled page,
  carrying only parameters the web page already handles on load:
  - `shared.html?d=<token>`, with the token shape checked;
  - `?tool`;
  - the sign-in link parameters (`auth_th` / `auth_type`), which keep their web semantics: today `AUTH_LINK_ENABLED =
    false`, so they are only removed from the address.
  
  `?install` and `?checkout` are dropped in the app.
  - The launch-URL read keeps its link under its own session key and applies it only once, after that key is confirmed
    written. Android's `getLaunchUrl` returns the process's first link for its whole life, so this read never overrides a
    later warm link.
  - A warm link is the user's latest tap: it is always applied, and kept in a 20-entry list so that iOS (whose launch read
    returns the newest link) does not apply it twice.
  - A link to the page already showing is ignored.
  - If `sessionStorage` is missing or full, a launch link is not applied at all: no reload loop, and the link is dropped
    in that rare case. Warm links still open.
  - The share token must match the viewer's own shape (32 hex); otherwise the link opens the app home.
  Opening a link replaces the current page, so unsaved analyzer input is lost, as with any navigation (device-check the
  UX).

### 5.3 Checkout return and Edge Function CORS (finding)

`checkout`, `portal` and `reconcile` answer CORS only for `https://dealfit.clearpathcapfunding.com`. From the app's origin
(`capacitor://localhost` / `https://localhost`) the browser layer would refuse them. This is moot while payments are
refused in the app. A web link-out purchase happens on the web origin anyway. Any in-app call to these functions needs an
Edge Function change (out of scope; provider change).

## 6. Accessibility and performance (signed-out app, 375 px)

Audited in a local browser at 375 × 812 against the stacked candidate.

**Fixed in this wave:**
- 98 analyzer fields, selects, toggles and the market search had no programmatic name (screen readers read only the
  placeholder). Adjacent `<label>`s now name their control (`for=`); the rest carry `aria-label`. Sign-in fields are
  untouched.
- Eight sheets are now announced in the markup as modal dialogs named by their title (`role="dialog"`, `aria-modal`,
  `aria-labelledby`; the market picker points at `#picker-headline`, which follows its "Choose a State" / state-code
  title). The design wave's `sheetfocus.js` respects these attributes and adds the same ones to any sheet opened without
  them. The sign-in / plans sheet is unchanged (sign-in is closed to speculative change).
- The repair tiers and the market-picker rows were click-only `<div>`s. They are now `role="button"` + `tabindex="0"`, and
  `a11y.js` gives them native-button behaviour:
  - Enter acts on key-down; Space acts on key-up, never scrolls the page, and does not repeat when held;
  - the selected tier is announced (`aria-pressed` follows the `.active` class that `repair.js`, unchanged, sets);
  - when a row re-renders its list (picker: state → markets), focus moves to the new list instead of falling to `<body>`;
  - the picker dialog has a stable name ("Choose a market").
- **Cold start:** the app bar loaded the 1024 px, 1.53 MB mark to draw a 26 px logo. A 96 px copy (6.7 KB, same image)
  now serves `index.html` and `shared.html`; the install icons keep the full mark. Signed-out first load fell from
  **2.71 MB to 1.19 MB** (decoded bytes: 30 module scripts, 0.91 MB, of which the vendored SDK is 0.22 MB; no third-party
  request). DOMContentLoaded was about 0.1 s locally.

**Fixed by the design-system wave (`07a7a4a`, from this audit's findings):**
- **Contrast:** `--muted` is now `#8e8e8e` (about 5.2:1; it was `#6b6b6b` at 3.2–3.7:1); `#444` is used for borders only.
- **Tap targets:** the app-bar controls keep their 34 px look with a 44 px hit area; the market slots, the
  square-footage field and the Terms / Privacy links are 44 px.
- **Focus:** `sheetfocus.js` moves focus into an opened sheet, keeps Tab inside it and returns focus on close.
- **Remaining limits:** the page behind an open sheet is not made inert (banked by the design owner); the sign-in / plans
  sheet is excluded from the focus handling; the 24 px Sign-out floor is unchanged.

**Present already:** a `prefers-reduced-motion` rule, `lang="en"`, no duplicate ids, no positive `tabindex`, and alt text
on every image.

**Not measured:** VoiceOver / TalkBack reading order on a device, dynamic type (iOS text-size settings do not reach a
WKWebView's CSS px without extra work; see §11), and real-device cold start inside the shell.

## 7. App Store / Google Play readiness checklist

| Item | State | Notes |
|---|---|---|
| E1 vendored SDK + fonts | **done** (live) | no remote runtime code |
| E2 Capacitor project + plugins + shell polish | **web side built here**; native projects not created | plugins: app, share, browser, haptics, status-bar, keyboard, secure storage |
| E3 Universal / App Links | **`.nojekyll` built; files planned** (§5) | needs Team ID / signing fingerprint |
| E4 in-app account deletion | **not built; designed in §9.1** (flow, scope, draft copy) | backend + Stripe + CRM event (0017); owner design decision |
| E5 offline states | done (live) | |
| E6 CI builds, signing, metadata | not started; services evaluated (§10) | public repo: signing secrets never in GitHub Actions; Codemagic recommended (owner decision) |
| App icon | the 1024 px mark exists, **RGBA** | the App Store icon must have **no alpha**: export a flattened 1024 px on the brand background. Android adaptive icon: foreground layer within the 66 dp safe zone. Play listing icon 512 px (`icon-512.png` exists, RGBA is allowed there) |
| Screenshots | not made | iPhone 6.9" set; Play phone set and a 1024 × 500 feature graphic (verify current sizes at submission). Every financial figure in a screenshot is "(est.)"; no approval or guarantee language |
| Privacy label / Data safety | draft below | |
| `PrivacyInfo.xcprivacy` | plan | the app's own manifest. If `@capacitor/preferences` is ever used it is a UserDefaults required-reason API (`CA92.1`). Capacitor ships its own manifest |
| Export compliance | plan | HTTPS only → `ITSAppUsesNonExemptEncryption = false` (confirm) |
| Account deletion URL (Play) | plan | the web deletion page, tied to E4 |
| Google financial-features declaration | owner/counsel | investor analysis tool; CPC brokers business-purpose loans |
| Age rating / category | owner | Business or Finance; no user-generated public content |
| iPad | recommend iPhone-only at first | avoids an iPad screenshot set and layout review |

**Privacy label / Data safety draft** (from source; no analytics or advertising SDK, per `privacy.html`):

| Data | Collected when | Linked to user | Purpose | Tracking |
|---|---|---|---|---|
| Email address | sign-in | yes | account | no |
| User ID | sign-in | yes | account | no |
| Saved deals, notes, addresses (user content) | the user saves a deal | yes | app functionality | no |
| Market selections | signed in | yes | app functionality | no |
| Purchase history (plan / subscription status) | a web purchase | yes | app functionality | no |
| Deal details sent to CPC funding | the user taps a funding hand-off (opens the CPC site) | — | declare per counsel: the hand-off is a link the user opens, carrying deal fields in the URL | no |

No location, contacts, photos, device identifiers or diagnostics are collected. Google Data safety: encrypted in transit
**yes**; deletion request **yes** once E4 exists.

**App Review notes (draft):**
- DealFit is a business-purpose real-estate investment calculator from Clear Path Capital, a loan broker. It does not
  lend, approve or quote terms; every figure is an estimate.
- Every analyzer works without an account and offline. Signing in (email code) only saves deals and market choices.
- Paid plans are not sold in the app: there are no purchase buttons, and no checkout request is made. Two items are part
  of the owner's payment decision:
  - whether plan prices should show at all;
  - the "Have a code? / Redeem" field, which unlocks paid tiers. App Review 3.1.1 bars unlocking features with the app's
    own codes outside App Store offer codes. It can be hidden in the app with the same injected style, touching no
    sign-in markup.
- **Demo account:** an owner decision, tracked with the store decisions outside this repository. A reviewer cannot read a
  DealFit sign-in email, and no review-only sign-in bypass will be built.

## 8. Payment adapters and the one tier source of truth (built, inert)

`docs/src/js/payments.js` defines one adapter interface per platform. **Nothing is enabled:**
`NATIVE_PAYMENT_CHOICE = { ios: null, android: null }` (frozen, pinned by `tests/payments.test.mjs` P1), and the store
product ids are `REPLACE_…` placeholders.

| Adapter | Platform | When enabled it… | Today |
|---|---|---|---|
| `web-stripe` | web | is a descriptor only: the web path stays `main.js` `startCheckout` → `checkout` Edge Function → Stripe page, `manageSubscription` → `portal`, `handleCheckoutReturn` → `reconcile` → server tier. Unchanged from `b24b95d` outside the two app-only guard lines (pinned by text and by a content hash, P1) | live path, unchanged |
| `ios-storekit` | iOS | gets a server-issued account token (`store-account-token`), buys the tier's StoreKit product with it as `appAccountToken`, sends the **signed transaction** to `store-verify`, then re-reads the tier; restore re-verifies `currentEntitlements`; manage opens the system subscription sheet | **refused** |
| `android-play-billing` | Android | the same with Play Billing (`obfuscatedAccountId`, **purchase token**, `queryPurchases`); manage opens Play's subscriptions page in the system browser | **refused** |
| `ios-external-link` | iOS (U.S. storefront) | checks StoreKit's storefront is `USA`, then opens the public web app in the **system** browser (never the in-app browser); the purchase happens on the web; the app learns the tier from the server on its next read | **refused** |
| `android-external-link` | Android (U.S.) | **refused even when chosen** (`LINK_PROGRAM_READY.google = false`): Google's program needs Play Billing Library 8.2.1+, a fresh external-link token and Google's information screen before every link-out, enrollment and transaction reporting, none of which this shell contract has | **refused** |

**Entitlement law (pinned):**
- The tier is whatever the server reports: `auth.js` `syncEntitlement` → `current_tier` RPC; `tiers.js` `setCachedTier`
  stays its only writer. `payments.js` never imports `tiers.js` and never touches storage.
- No adapter result has a tier field (`{ok, status, reason, message}` only). A plugin or server answer naming a tier
  changes nothing on the client (P3).
- A store purchase is only a **proof** for the server. Nothing is granted until `store-verify` verifies it with Apple /
  Google and writes `entitlement_grants`; the app then calls `syncEntitlement`.
- Refusals happen **before** any plugin call, server call, storage write or request (P2), with the message the app
  showed before this module (`Plans can’t be changed in the app yet.`). Both gates hold independently: `nativePayment`
  refuses a disabled adapter, and each adapter refuses itself.
- `main.js` loads `payments.js` only through `appPayment` (a dynamic import), called only from its two `if (!paymentsInApp())` guards, which never run on the web. The web never requests the module. Each guard is pinned as the whole line, so nothing else can run on it.
- In the app: a store purchase or restore refuses a signed-out user before any call ("Sign in first"); one operation runs at a time; each operation has its own failure copy.

**What enabling a store adapter needs (none exists; each is a provider change under its own authorization):**
1. store products (App Store Connect subscription group; Play subscription + base plan) and their ids in `STORE_PRODUCTS`;
2. the shell plugin (`DealFitStoreKit` / `DealFitPlayBilling` contracts in `payments.js`, or a vetted third-party
   plugin mapped to the same contract), plus `AppLauncher` for system-browser links;
3. Edge Functions `store-account-token` (a per-user UUID stored server-side) and `store-verify`:
   - **account binding (required; the client cannot enforce it):** the proof's `appAccountToken` /
     `obfuscatedExternalAccountId` must equal the **caller's** stored token. Store the `originalTransactionId` /
     `purchaseToken` with a unique constraint bound to one user, and refuse it for any other user. Otherwise two DealFit
     accounts sharing one Apple ID or Google account, or a shared token, would both be granted the plan (restore sends
     every proof the store holds);
   - Apple: verify the JWS with the App Store Server API / Apple root certificates, check bundle id, product and
     `appAccountToken`;
   - Google: Play Developer API `purchases.subscriptionsv2.get` (check `obfuscatedExternalAccountId`), then
     **acknowledge within 3 days** or Google refunds it;
4. server-to-server renewals and cancellations: App Store Server Notifications V2 and Play Real-time Developer
   Notifications (Pub/Sub) into the same grant table, idempotent like `stripe_events`;
5. a `source` on each grant (`stripe` / `apple` / `google` / `comp`), so one person cannot be double-billed. A user who
   already has a Stripe plan sees "managed on the web", and the server refuses a store purchase for an entitled user,
   like `checkout`'s `already_entitled`;
6. a Restore Purchases control in the plans sheet (Apple requires one with IAP);
7. flipping `NATIVE_PAYMENT_CHOICE` and re-pinning P1 in the same commit. Offering IAP **and** a link-out together on
   iOS needs a small extension first: today the choice holds one adapter per platform.

**What enabling a link-out needs:**
- **iOS (U.S.):** a `storefront()` method in the StoreKit plugin (already in the contract; the adapter refuses without
  it), U.S.-only distribution, and a neutral button label. Re-check Apple's live 3.1.1(a) text first.
- **Android (U.S.):** enrollment and the declaration form; Play Billing Library 8.2.1+ in the shell; a plugin step that
  gets a fresh external-link token and shows Google's information screen before **every** link-out; server reporting of
  every transaction (including $0 trials and renewals) through the external transactions API; then
  `LINK_PROGRAM_READY.google = true` with P2 re-pinned.

## 9. Account lifecycle (plan and draft copy; nothing live)

### 9.1 Deletion — the in-app path

**Where:** Account sheet → **Delete account** (below Sign out), signed-in only. The same flow is served on the web for
Google Play's required deletion URL.

**Steps:**
1. **Confirm sheet:** what is deleted, what is kept, and the plan consequence (copy below).
2. **Fresh code:** the app sends a new email code (the existing `signInWithOtp` flow); `verifyOtp` gives a fresh session.
3. **Call** a new Edge Function `delete-account` with that session. The server refuses unless the JWT's `amr` `otp` entry
   is under about 5 minutes old (verify the claim shape on the live project before building). It then:
   1. cancels any active Stripe subscription **immediately** (no further charge; refund per owner policy);
   2. deletes `comp_redeem_failures` rows for the user (no foreign key);
   3. deletes the auth user (admin API, service role, server-side only). The `on delete cascade` tables go with it, and
      migration 0017's trigger records the CRM `account_deleted` event **in the same transaction, fail-closed** (branch
      `product/n1125-crm-deletion`; 0016 and 0017 must be applied together before this ships).
4. **Client:** `supabase.auth.signOut({ scope: 'local' })`, which clears the Keychain/Keystore session through
   `sessionStore.js`, then removes DealFit's local keys (pipeline cache, market slots, drafts) and shows the signed-out
   app.

**Order and failure:** Stripe first, then the user. If the user delete fails after the cancel, the account stays
(signed in, no plan), the error is shown, and a retry is safe: the cancel is idempotent and 0017 aborts the whole delete
rather than leave CPC holding the email.

**Scope** (from migrations 0001–0017):

| Removed | Kept, and why |
|---|---|
| the account (`auth.users`) and, by cascade: `entitlements`, `entitlement_grants`, `redemptions`, `redemptions_v2`, `user_markets`, `user_pipeline`, `stripe_customers`, `checkout_attempts`, `deal_share_links` (open share links stop working); `comp_redeem_failures` explicitly; the CRM `account_verified` row (by 0017) | **Stripe's** customer, invoices and payment records: tax/accounting obligations; Stripe holds them under its own policy, no longer linked to a DealFit account |
| this device's session and DealFit's local data | `stripe_events` ids (no user id; idempotency) |
| | the CRM `account_deleted` row (user id only, no email) until delivered; CPC's tombstone replaces the email with a hash (contract §4.5). A hash of an email can still be matched to the address, so privacy text must not call it anonymous |
| | any funding request the user already sent Clear Path Capital: a CPC business record under CPC's privacy policy, deletable on request there |
| | provider operational logs (Supabase auth/function logs) for the provider's retention period; **verify the exact retention** before writing the privacy text |

No backups exist to purge: this Supabase project has no provider backup and no point-in-time recovery. `privacy.html` needs a deletion section saying all of
this, and its Effective Date changes at publication.

**Draft copy** (plain, no legal conclusions; counsel to review before publication):

> **Delete your DealFit account?**
> This permanently deletes your account and everything saved to it: your saved deals and notes, your market choices,
> and your share links (people you shared a deal with won't be able to open it). This can't be undone.
>
> *[Stripe plan]* Your **{Investor/Pro}** plan ends now and you won't be charged again. *[refund sentence: owner policy]*
>
> *[App Store / Google Play plan, if store billing is ever used]* Deleting your account doesn't cancel a subscription
> bought through **{the App Store / Google Play}**. Cancel it in **{Settings → your name → Subscriptions / Google Play →
> Payments & subscriptions}** first.
>
> **What we keep:** payment records our payment processor must keep for tax and accounting, and a record that this
> account was deleted, with no email, so Clear Path Capital's systems remove your email too. A funding request you
> already sent to Clear Path Capital stays part of their records; ask them to delete it.
>
> To confirm, we'll email a code to **{a•••@example.com}**. — buttons: **Send code** · **Cancel**
>
> *(code entered)* — button: **Delete account permanently**
>
> Done: **Your account was deleted.** · Error: **Your account wasn't deleted — nothing was removed. Try again.**

### 9.2 Cancelling a subscription, per platform

| Bought through | Where to cancel | In the app |
|---|---|---|
| Stripe (web; also the U.S. link-out) | Account → **Manage subscription** → Stripe Customer Portal (period-end cancellation, already live on the web) | the app hides that button today; under the link-out option it reads "Your plan is managed on the web" and opens the site in the system browser |
| App Store (only if StoreKit is chosen) | iPhone Settings → your name → Subscriptions → DealFit | Manage subscription → the system sheet (`showManageSubscriptions`) |
| Google Play (only if Play Billing is chosen) | Google Play → profile → Payments & subscriptions → Subscriptions | Manage subscription → `play.google.com/store/account/subscriptions` |

Cancellation never deletes the account, and deleting the account cancels only a Stripe plan. A store subscription is
the store's, and the deletion copy says so.

### 9.3 Recovery and sessions

- The account **is** the email address. Recovery means a new email code; there is no password.
- Device loss: deals and markets are server-held, so signing in on a new device restores them. The Keychain/Keystore item
  is this-device-only (§2).
- Lost mailbox: support only (`support@clearpathcapfunding.com`). Never move an account to a new address on an unverified
  request. Email change (`updateUser({ email })` with double confirmation) is a later item.
- Session storage in the app: Keychain/Keystore via `sessionStore.js`. Sign-out (even offline) and account switch leave
  no token behind (§2; `native.test.mjs` §D).

## 10. Cloud builds (evaluated; nothing enrolled)

The repository is **public**: GitHub Actions logs are readable by anyone signed in, and file-style secrets (a base64
keystore or `.p12`) are not reliably redacted. **Signing material never goes into GitHub Actions secrets.**

| Service | Fit for this project (2026-11) |
|---|---|
| Ionic Appflow | closed to new customers since 2025-02 |
| **Codemagic (recommended)** | documents Capacitor builds for both platforms; can create the iOS distribution certificate from an App Store Connect API key (no Mac needed); the keystore cannot be downloaded back out; secrets are encrypted at rest and masked in logs; 500 free macOS minutes a month on the individual plan, pay-as-you-go after that |
| Bitrise | free Hobby tier; secrets never reach pull-request builds on public projects; but the iOS certificate must be exported and uploaded, which needs a Mac |
| Expo EAS | built around React Native; no Capacitor documentation |
| GitHub Actions macOS | free for public repositories, but public logs and do-it-yourself signing; use it **only** for secret-free checks (the Node suites, `cap sync`), never `pull_request_target` |
| Xcode Cloud | iOS only; the first workflow must be set up in Xcode on a Mac |

Setup rules if Codemagic is chosen:
- `codemagic.yaml` names secret groups only;
- builds run manually or on `main` / tags, with pull-request builds off;
- use a least-privilege App Store Connect API key;
- turn on Play App Signing, so Codemagic holds only the upload key.

Sources and dates are in the owner's feasibility record.

## 11. Proven here vs device-only

- **Proven (Node, this branch):** web identity of every seam and of session storage (real client and SDK); the payment
  adapters (inert on the web, refused in the app; with injected mocks, the enabled adapters hand proofs to the server and
  never set a tier — `store-verify` does not exist, so the server side is unproven — `payments.test.mjs`); the
  native-side logic on a scripted bridge (plugin proxies, share, browser, payment refusal, install hidden, Back into the
  view stack, deep-link mapping and loop guard, status bar and keyboard calls); the secure adapter including the real
  SDK's sign-out and account switch; the `.nojekyll` served-set delta; the accessibility markup; the cold-start asset.
  Live probe of today's Jekyll output (the generated licence page and theme CSS).
- **Device-only (needs a shell build):** every native plugin call, Keychain/Keystore, the Back button and edge swipe,
  keyboard resize under Android edge-to-edge, the accessory bar, deep-link verification, in-app browser return,
  VoiceOver/TalkBack, and iOS Dynamic Type (WKWebView ignores the system text size unless the shell maps it; a later
  design item).
