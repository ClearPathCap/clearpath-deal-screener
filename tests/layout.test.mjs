// Nav-lock layout invariants — regression guard for a bug fixed repeatedly.
// Run: node tests/layout.test.mjs
//
// THE BUG (last root-caused 2026-08-15, live-measured at top:26px): the sticky
// tab nav pinned 26px below the viewport top for every user, letting the
// util-bar (auth chip / share / install) show through the gap and then slide
// under the opaque nav. Cause: styles.css carried an UNCONDITIONAL sibling rule
// `.dev-mode-banner+.nav{top:26px}` — the banner div is always in the DOM and
// CSS adjacency matches display:none elements too, so a dev-mode-only offset
// applied globally. The offset is now gated on the banner's `hidden` attribute.
//
// These assertions pin every load-bearing piece of that fix. If you need to
// change the header/nav layout, change these pins IN THE SAME COMMIT with the
// reasoning — do not delete them to make the suite pass.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

const css = src("docs/src/css/styles.css");
const html = src("docs/index.html");
const mainJs = src("docs/src/js/main.js");

// 1. The nav is sticky and locked to the very top of the viewport.
const navRule = (css.match(/\.nav\{[^}]*\}/) || [""])[0];
ok("nav rule exists", navRule.length > 0);
ok("nav is position:sticky", /position:sticky/.test(navRule));
ok("nav locks at top:0", /(^|;)top:0(;|})/.test(navRule.slice(4)));
ok("nav has an opaque background (content must not bleed through)", /background:var\(--bg\)/.test(navRule));
ok("nav z-index above page content", /z-index:(1[0-9]|[2-9][0-9])/.test(navRule));

// 2–4. RE-PINNED in the Wave 5 commit (same-commit law, reasoning here): the
//    dev banner — the ONLY element that ever justified a nav offset — was
//    removed entirely with the tier-mutating dev tooling (SR-3 / plan v1.1
//    C-2). The gate pins below are replaced by ABSENCE pins, which protect the
//    nav-lock invariant more strongly: with no banner and no sibling rule, no
//    state can offset the nav at all. If a future banner-like element returns,
//    these pins force the same-commit re-derivation this suite's header demands.
ok("no dev-banner selector remains anywhere in CSS", !/\.dev-mode-banner/.test(css));
ok("no sibling rule offsets the nav (any selector)", !/\+\s*\.nav\s*\{/.test(css));
ok("no dev-banner element remains in the DOM", !/dev-mode-banner/.test(html));
ok("the nav is the first element inside <body> (nothing can sit above it)",
   /^(\s|<!--[\s\S]*?-->)*<div class="nav">/.test(html.slice(html.indexOf("<body>") + 6)));
ok("no banner JS remains in main.js", !/dev-mode-banner|updateDevModeIndicator\(/.test(mainJs.replace(/\/\/[^\n]*/g, "")));

// 5. The util-bar stays in normal flow — it must scroll under the locked nav,
//    never float over it or the wordmark row (Round 2 #3 stays honored).
const utilRule = (css.match(/\.util-bar\{[^}]*\}/) || [""])[0];
ok("util-bar rule exists", utilRule.length > 0);
ok("util-bar is not positioned (static flow)", !/position:/.test(utilRule));

// ─── 6. D-1 P1-B · narrow-screen ergonomics of the shared modal ──────────────
// Two defects in the same component, both only visible on a phone:
//   (a) the auth fields inherited the shared 13px input size. iOS Safari zooms
//       the whole page whenever a focused input renders below 16px, throwing the
//       visitor into a magnified, horizontally-scrolled page mid-sign-in.
//   (b) the plan comparison held its two 1fr columns at every width, leaving
//       ~120px of content per card on a 375px phone.
// The behavioural half of D-1 P1-B lives in tests/modalauth.test.mjs; these are
// the CSS invariants, pinned here because this suite already owns "layout rules
// that regressed once and must not regress again."
const mobileBlock = (css.match(/@media \(max-width:480px\)\{[\s\S]*?\n\}/) || [""])[0];
ok("a narrow-screen block exists at the ruled ~480px breakpoint", mobileBlock.length > 0);
ok("plan cards stack below the breakpoint (single column)",
   /\.tier-compare\{grid-template-columns:1fr\}/.test(mobileBlock));
ok("the auth email field renders at >=16px below the breakpoint",
   /#signin-email[^{]*\{[^}]*font-size:(1[6-9]|[2-9][0-9])px/.test(mobileBlock));
ok("the one-time-code field is raised with it (same flow, same zoom trigger)",
   /#signin-code[^{]*\{[^}]*font-size:(1[6-9]|[2-9][0-9])px/.test(mobileBlock)
   || /#signin-email,#signin-code\{font-size:(1[6-9]|[2-9][0-9])px\}/.test(mobileBlock));

// The zoom fix must NEVER be bought by disabling the visitor's own zoom.
const viewportTag = (html.match(/<meta name="viewport"[^>]*>/) || [""])[0];
ok("a viewport meta tag exists", viewportTag.length > 0);
ok("pinch zoom is not disabled (no maximum-scale)", !/maximum-scale/i.test(viewportTag));
ok("pinch zoom is not disabled (no user-scalable=no)", !/user-scalable\s*=\s*(no|0)/i.test(viewportTag));
ok("no stylesheet rule disables touch zoom either", !/touch-action:\s*(none|pan-x|pan-y)/.test(css));

// Desktop must keep the two-column comparison and the fixed-width action.
ok("the desktop comparison is still a two-column grid",
   /\.tier-compare\{display:grid;grid-template-columns:1fr 1fr/.test(css));
ok("the desktop auth action keeps its fixed width", /\.btn-redeem-fixed\{flex:0 0 150px\}/.test(css));
// Measured at 375px: side by side, the 150px action left 112px of text width
// for a 133px placeholder. The row wraps instead, giving the field full width.
ok("the narrow-screen auth row wraps so the email field gets full width",
   /#signin-email-step,#signin-code-step\{flex-wrap:wrap\}/.test(mobileBlock));
ok("the narrow-screen auth field spans the row", /#signin-email,#signin-code\{flex:1 1 100%\}/.test(mobileBlock));
ok("the narrow-screen auth action spans the row (full-width primary CTA)",
   /\.btn-redeem-fixed\{flex:1 1 100%\}/.test(mobileBlock));
ok("the fixed-width action is a class, not an inline style (so the media query can win)",
   !/style="flex:0 0 150px"/.test(html) && (html.match(/btn-redeem btn-redeem-fixed/g) || []).length === 2);

// The signed-out reorder must be a DOM move, never CSS `order`: flex order
// repaints boxes but leaves tab order and screen-reader order on the source
// sequence, which would put the Subscribe buttons ahead of the free controls
// for precisely the visitors least able to skip past them.
ok("the modal is not reordered with CSS order", !/\.modal-upgrade[^{]*\{[^}]*order:/.test(css));
ok("no account-first rule fakes the order visually", !/\.account-first[^{]*\{[^}]*(order:|flex-direction:column-reverse)/.test(css));
ok("the reorder is performed in the DOM", /insertBefore\(account, anchor\)/.test(mainJs));
ok("the modal shell carries a stable hook for the account-first state",
   /id="upgrade-modal-body"/.test(html) && /classList\?\.toggle/.test(mainJs));

// ─── 7. D-1 P2-3 · phone-sized deal inputs must not trigger iOS zoom ─────────
// The shared input rule renders deal fields at 14px and the deal-name row at
// 13px; iOS Safari zooms the page on focus below 16px. The bound covers phones
// in BOTH orientations (932px is the widest common phone landscape) and stops
// short of desktop viewports.
const dealBlock = (css.match(/@media \(max-width:932px\)\{[\s\S]*?\n\}/) || [""])[0];
ok("a phone-sized block exists covering portrait AND landscape widths", dealBlock.length > 0);
ok("deal text inputs reach >=16px on phone widths",
   /\.page input\[type=text\]/.test(dealBlock) && /font-size:16px/.test(dealBlock));
ok("deal numeric inputs reach >=16px on phone widths", /\.page input\[type=number\]/.test(dealBlock));
ok("deal tel inputs reach >=16px on phone widths", /\.page input\[type=tel\]/.test(dealBlock));
ok("deal selects reach >=16px (a <select> zooms on focus too)", /\.page select/.test(dealBlock));
ok("deal textareas reach >=16px", /\.page textarea/.test(dealBlock));
ok("the rule is scoped to .page, so modal fields keep their own sizing",
   !/(^|[^.\w])input\[type=text\]\{/.test(dealBlock.replace(/\.page /g, '')));
// Desktop must not be enlarged: the base rules survive unchanged.
ok("the base desktop input size is still 14px",
   /input\[type=number\],select,input\[type=text\],input\[type=tel\],textarea\{[^}]*font-size:14px/.test(css));
ok("the desktop deal-name row is still 13px", /\.save-row input\[type=text\]\{[^}]*font-size:13px\}/.test(css));
ok("the desktop field select is still 14px", /\.field select\{[^}]*font-size:14px/.test(css));
// The zoom fix must never be bought with the viewport (re-pinned for this batch).
ok("P2-3 did not disable pinch zoom (no maximum-scale)", !/maximum-scale/i.test(viewportTag));
ok("P2-3 did not disable pinch zoom (no user-scalable)", !/user-scalable/i.test(viewportTag));
ok("P2-3 introduced no touch-action restriction", !/touch-action:\s*(none|pan-x|pan-y)/.test(css));

// ─── 8. D-1 P2-4 · utility + legal tap targets meet the 24x24 floor ─────────
const tapRule = (css.match(/\.legal-footer a,\.sign-out-link\{[\s\S]*?\}/) || [""])[0];
ok("a shared tap-target rule covers the legal links and Sign out", tapRule.length > 0);
ok("the target floor is at least 24px tall", /min-height:24px/.test(tapRule));
ok("the target floor is at least 24px wide", /min-width:24px/.test(tapRule));
ok("min dimensions can actually apply (the anchor is not inline)", /display:inline-flex/.test(tapRule));
ok("Sign out carries the hook class", /class="sign-out-link"/.test(html));
ok("Sign out still invokes the existing sign-out path", /class="sign-out-link"[^>]*onclick="signOutAccount\(\);return false;"/.test(html));
// Legal links: URLs and labels preserved, opened without displacing an unsaved deal.
ok("the Terms URL is unchanged", /<a href="terms\.html"/.test(html));
ok("the Privacy URL is unchanged", /<a href="privacy\.html"/.test(html));
ok("the visible labels are unchanged", />Terms<\/a>/.test(html) && />Privacy<\/a>/.test(html));
ok("Terms opens in a new tab", /<a href="terms\.html"[^>]*target="_blank"/.test(html));
ok("Privacy opens in a new tab", /<a href="privacy\.html"[^>]*target="_blank"/.test(html));
ok("both legal links sever the opener handle",
   (html.match(/rel="noopener noreferrer"/g) || []).length >= 2
   && /<a href="terms\.html"[^>]*rel="noopener noreferrer"/.test(html)
   && /<a href="privacy\.html"[^>]*rel="noopener noreferrer"/.test(html));
// Every new-tab link must sever the opener handle. `noopener` is the part that
// does that; `noreferrer` additionally strips the Referer header, which the two
// pre-existing CPC links deliberately do NOT do — the funding handoff carries
// its attribution that way, and it is out of scope for this batch. So the law is
// "every target=_blank carries noopener", not "every one carries noreferrer".
const blankLinks = html.match(/<a [^>]*target="_blank"[^>]*>/g) || [];
ok("every new-tab link exists and is accounted for", blankLinks.length === 4);
ok("every new-tab link severs the opener handle",
   blankLinks.every(a => /rel="[^"]*noopener/.test(a)));
ok("[PRESERVATION] the CPC handoff links keep referrer attribution (out of scope)",
   blankLinks.filter(a => /clearpathcapfunding\.com/.test(a)).length === 2
   && blankLinks.filter(a => /clearpathcapfunding\.com/.test(a)).every(a => !/noreferrer/.test(a)));

console.log(`\nlayout: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Nav-lock invariants hold ✓");
