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

// 2. The 26px dev-banner offset exists ONLY behind a visibility gate. Any
//    adjacent-sibling nav offset without :not([hidden]) is the regression.
const siblingRules = css.match(/\.dev-mode-banner[^{}]*\+\s*\.nav\s*\{[^}]*\}/g) || [];
ok("exactly one banner→nav sibling rule", siblingRules.length === 1);
ok("the sibling rule is gated on :not([hidden])", siblingRules.every(r => r.includes(":not([hidden])")));
ok("no unconditional 26px nav offset anywhere", !/\.dev-mode-banner\s*\+\s*\.nav\s*\{/.test(css.replace(/\.dev-mode-banner:not\(\[hidden\]\)\s*\+\s*\.nav\s*\{[^}]*\}/g, "")));
ok("hidden banner is display:none", /\.dev-mode-banner\[hidden\]\{display:none\}/.test(css));

// 3. The banner element hides via the `hidden` attribute, never inline display.
const bannerTag = (html.match(/<div id="dev-mode-banner"[^>]*>/) || [""])[0];
ok("banner tag exists", bannerTag.length > 0);
ok("banner uses the hidden attribute", /\bhidden\b/.test(bannerTag));
ok("banner carries no inline style", !/style=/.test(bannerTag));
// DOM order: banner immediately precedes the nav (the selector depends on it).
const bannerIdx = html.indexOf('id="dev-mode-banner"');
const navIdx = html.indexOf('<div class="nav">');
ok("banner precedes the nav in the DOM", bannerIdx > -1 && navIdx > bannerIdx);
ok("nothing but whitespace/comments between banner and nav", /^(\s|<!--[\s\S]*?-->)*$/.test(html.slice(html.indexOf(">", bannerIdx) + 1, navIdx).replace(/<\/div>/, "")));

// 4. JS toggles `hidden`, never style.display, on the banner.
const devFn = (mainJs.match(/function updateDevModeIndicator\(\)[\s\S]*?\n\}/) || [""])[0];
ok("updateDevModeIndicator exists", devFn.length > 0);
ok("JS shows banner via hidden=false", /banner\.hidden = false/.test(devFn));
ok("JS hides banner via hidden=true", /banner\.hidden = true/.test(devFn));
ok("JS never sets banner.style.display", !/banner\.style\.display/.test(mainJs));

// 5. The util-bar stays in normal flow — it must scroll under the locked nav,
//    never float over it or the wordmark row (Round 2 #3 stays honored).
const utilRule = (css.match(/\.util-bar\{[^}]*\}/) || [""])[0];
ok("util-bar rule exists", utilRule.length > 0);
ok("util-bar is not positioned (static flow)", !/position:/.test(utilRule));

console.log(`\nlayout: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Nav-lock invariants hold ✓");
