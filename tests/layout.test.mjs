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

console.log(`\nlayout: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Nav-lock invariants hold ✓");
