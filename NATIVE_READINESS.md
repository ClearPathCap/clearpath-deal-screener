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
- Eight sheets are now announced as modal dialogs with their title (`role="dialog"`, `aria-modal`, and
  `aria-labelledby`, or a fixed `aria-label` on the market picker, whose header text changes). The sign-in / plans sheet is unchanged (sign-in is closed to speculative change).
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

**Routed to the design-system owner (tokens / components, not changed here):**
- **Contrast:** the muted grey `#6b6b6b` gives 3.2–3.7:1 for small text on the dark surfaces, below WCAG AA 4.5:1; the
  footer separator `#444` gives 2.0:1.
- **Tap targets under 44 px:** the app-bar controls (34 px high), market slots (34), the square-footage field (38) and
  the footer links (24).
- **Focus:** focus does not move into an opened sheet or return when it closes, and is not contained inside it.

**Present already:** a `prefers-reduced-motion` rule, `lang="en"`, no duplicate ids, no positive `tabindex`, and alt text
on every image.

**Not measured:** VoiceOver / TalkBack reading order on a device, dynamic type (iOS text-size settings do not reach a
WKWebView's CSS px without extra work; see §8), and real-device cold start inside the shell.

## 7. App Store / Google Play readiness checklist

| Item | State | Notes |
|---|---|---|
| E1 vendored SDK + fonts | **done** (live) | no remote runtime code |
| E2 Capacitor project + plugins + shell polish | **web side built here**; native projects not created | plugins: app, share, browser, haptics, status-bar, keyboard, secure storage |
| E3 Universal / App Links | **`.nojekyll` built; files planned** (§5) | needs Team ID / signing fingerprint |
| E4 in-app account deletion | **not built** | backend + Stripe + CRM tombstone; owner design decision |
| E5 offline states | done (live) | |
| E6 CI builds, signing, metadata | not started | GitHub Actions macOS/Android; signing secrets only in CI secrets |
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

## 8. Proven here vs device-only

- **Proven (Node, this branch):** web identity of every seam and of session storage (real client and SDK); the
  native-side logic on a scripted bridge (plugin proxies, share, browser, payment refusal, install hidden, Back into the
  view stack, deep-link mapping and loop guard, status bar and keyboard calls); the secure adapter including the real
  SDK's sign-out and account switch; the `.nojekyll` served-set delta; the accessibility markup; the cold-start asset.
  Live probe of today's Jekyll output (the generated licence page and theme CSS).
- **Device-only (needs a shell build):** every native plugin call, Keychain/Keystore, the Back button and edge swipe,
  keyboard resize under Android edge-to-edge, the accessory bar, deep-link verification, in-app browser return,
  VoiceOver/TalkBack, and iOS Dynamic Type (WKWebView ignores the system text size unless the shell maps it; a later
  design item).
