// D-1 P1-B — signed-out account priority in the shared upgrade/account modal.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/modalauth.test.mjs
//
// THE DEFECT (live, D-1): every signed-out route into the one shared modal —
// header Sign in, the Save gate, the Pipeline "Sign in / Create free account"
// CTA — opened on the paid Investor/Pro comparison. The free email field and
// Send code sat underneath both Subscribe buttons, below the fold on a phone.
// A visitor who came to make a FREE account had to scroll past two paid CTAs
// to reach it.
//
// THE LAW PROVEN HERE:
//   signed out → free account controls lead; paid cards remain, below.
//   signed in  → paid-plan-first upgrade experience, untouched.
//
// Ordering is proven against a real ORDERED DOM stub (parentNode/childNodes/
// insertBefore), not by reading source, because the whole defect was an
// ordering defect. The other suites' flat stubs cannot express it — which is
// exactly why the defect survived them. Index comparisons below are therefore
// statements about painted AND focus order: the fix moves the node, so the two
// can never disagree.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── an ordered DOM stub: enough tree for insertBefore to mean something ──────
const elements = new Map();
function mkEl(id) {
  const el = {
    id, textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, checked: false,
    parentNode: null, childNodes: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) { const on = force === undefined ? !this._s.has(c) : !!force; on ? this._s.add(c) : this._s.delete(c); return on; },
    },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    focus() {}, click() {}, querySelectorAll: () => [], querySelector: () => null,
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = el; el.childNodes.push(child); return child;
    },
    removeChild(child) {
      const i = el.childNodes.indexOf(child);
      if (i > -1) el.childNodes.splice(i, 1);
      child.parentNode = null; return child;
    },
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      const i = ref ? el.childNodes.indexOf(ref) : -1;
      if (i > -1) el.childNodes.splice(i, 0, child); else el.childNodes.push(child);
      child.parentNode = el; return child;
    },
    get nextSibling() {
      const p = el.parentNode; if (!p) return null;
      const i = p.childNodes.indexOf(el);
      return i > -1 ? (p.childNodes[i + 1] ?? null) : null;
    },
  };
  return el;
}
const el = (id) => { if (!elements.has(id)) elements.set(id, mkEl(id)); return elements.get(id); };

globalThis.location = { search: '', href: 'https://dealfit.example/', pathname: '/' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  getElementById: el,
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener() {}, removeEventListener() {},
  body: mkEl('body'), documentElement: mkEl('html'), createElement: (t) => mkEl('_' + t),
};
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener ?? (() => {});
globalThis.removeEventListener = globalThis.removeEventListener ?? (() => {});
globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: false, addEventListener() {}, addListener() {} }));
globalThis.history = { replaceState() {} };
globalThis.alert = () => {};

// Assemble the modal's AUTHORED child order, read straight from index.html so
// the harness can never drift from the shipped markup.
const html = src("docs/index.html");
const modalHtml = html.slice(html.indexOf('id="modal-upgrade"'), html.indexOf('id="modal-market-confirm"'));
const AUTHORED = ['upgrade-modal-title', 'upgrade-subhead', 'upgrade-plans-lead', 'upgrade-compare',
                  'upgrade-toptier-note', 'manage-sub-btn', 'account-block', 'redeem-block'];
const authoredInMarkup = AUTHORED.map(id => modalHtml.indexOf(`id="${id}"`));
ok("[HARNESS] every modelled block exists in the shipped modal markup", authoredInMarkup.every(i => i > -1));
ok("[HARNESS] the harness models the markup's own child order",
   authoredInMarkup.every((v, i, a) => i === 0 || a[i - 1] < v));

const shell = el('upgrade-modal-body');
AUTHORED.forEach(id => shell.appendChild(el(id)));
const order = () => shell.childNodes.map(n => n.id);
const at = (id) => order().indexOf(id);

const errCalls = [];
console.error = (...a) => { errCalls.push(a); };

globalThis.__stubSupabase = { session: null, rpc: { current_tier: { data: null, error: null } } };
const main = await import("../docs/src/js/main.js");
const auth = await import("../docs/src/js/auth.js");

const session = { user: { id: 'u-modal', email: 'qa@example.com' } };
const signIn  = async (tier = null) => {
  globalThis.__stubSupabase = { session, rpc: { current_tier: { data: tier, error: null } } };
  await auth.initAuthAndEntitlement();
};
const signOut = async () => {
  globalThis.__stubSupabase = { session: null, rpc: { current_tier: { data: null, error: null } } };
  await auth.initAuthAndEntitlement();
};

ok("[HARNESS] main.js loads and publishes openUpgrade", typeof globalThis.openUpgrade === 'function');
ok("[HARNESS] the pure layout mapper is exposed", typeof globalThis.upgradeModalLayout === 'function');

// ── §A · the pure mapper (state → presentation), exhaustively ───────────────
// Resolved through a fallback so this suite COUNTS failures instead of throwing
// when the mapper is absent. That matters for the defect-closing proof: run
// against the parent commit, the whole file must still reach §B and demonstrate
// that the ordering itself was wrong — a crash on a missing export would only
// have proven that the export is new.
const layoutOf = typeof main.upgradeModalLayout === 'function'
  ? main.upgradeModalLayout
  : () => ({ accountFirst: null, title: '', subhead: '', plansLead: '' });
const TRIGGERS = ['region', 'save', 'general', 'cap', undefined];
for (const t of TRIGGERS) {
  const out = layoutOf(false, t);
  ok(`[DEFECT-CLOSING] signed-out (${t}) puts the account first`, out.accountFirst === true);
  ok(`[DEFECT-CLOSING] signed-out (${t}) headline offers a free account`, /free account/i.test(out.title));
  ok(`[DEFECT-CLOSING] signed-out (${t}) says the pipeline lives with the free account`,
     out.subhead === 'Your pipeline lives with your free account. Sign in or create one to save deals and track them across all your devices.');
  ok(`[COMPLIANCE] signed-out (${t}) keeps "funding stays free on every tier" with the plans`,
     /funding stays free on every tier/.test(out.plansLead));
  const inn = layoutOf(true, t);
  ok(`[PRESERVATION] signed-in (${t}) keeps plans first`, inn.accountFirst === false);
  ok(`[PRESERVATION] signed-in (${t}) keeps the trigger headline`,
     inn.title === ({ region: 'Analyze deals in 4 markets, not 2', save: "Never lose a deal you've already found" }[t] || 'Upgrade Your Plan'));
  ok(`[PRESERVATION] signed-in (${t}) keeps the paid subhead`, /funding stays free on every tier/.test(inn.subhead));
  ok(`[PRESERVATION] signed-in (${t}) shows no duplicate plans lead`, inn.plansLead === '');
}
ok("[PRESERVATION] the mapper is pure — no DOM identifiers in its output",
   Object.values(layoutOf(false, 'save')).every(v => typeof v !== 'object'));

// ── §B · the three signed-out entry points, as content order ────────────────
// Each named entry point is driven through the call the shipped UI makes.
await signOut();

// 1. header Sign in — the auth chip's own handler picks the trigger.
globalThis.handleAuthChipClick();
ok("[DEFECT-CLOSING] entry 1 (header Sign in): free auth controls precede the paid cards",
   at('account-block') < at('upgrade-compare'));
// "Top of the actionable content" stated as the thing that actually matters:
// only headline/subhead/lead-in copy may precede the email + Send code, and no
// control of any kind may. An index threshold would pass on a modal that had
// grown a fourth paragraph and failed on one that lost a heading.
const INTERACTIVE = ['upgrade-compare', 'manage-sub-btn', 'redeem-block'];
const COPY_ONLY   = ['upgrade-modal-title', 'upgrade-subhead', 'upgrade-plans-lead', 'upgrade-toptier-note'];
ok("[DEFECT-CLOSING] entry 1: the email + Send code step leads all actionable content",
   INTERACTIVE.every(id => at(id) > at('account-block')));
ok("[DEFECT-CLOSING] entry 1: only headline/subhead copy precedes the free controls",
   order().slice(0, at('account-block')).every(id => COPY_ONLY.includes(id)));
ok("[DEFECT-CLOSING] entry 1: paid Investor/Pro cards remain available below",
   at('upgrade-compare') > -1 && el('upgrade-compare').style.display === '');
ok("[DEFECT-CLOSING] entry 1: headline names the free account",
   /free account/i.test(el('upgrade-modal-title').textContent));

// 2. Save gate — pipeline.js gates saveDeal behind openUpgrade('save').
shell.insertBefore(el('account-block'), el('redeem-block'));   // re-seed authored order
ok("[HARNESS] re-seeded to the authored (defective) order", at('account-block') > at('upgrade-compare'));
globalThis.openUpgrade('save');
ok("[DEFECT-CLOSING] entry 2 (Save gate): free auth controls precede the paid cards",
   at('account-block') < at('upgrade-compare'));
ok("[DEFECT-CLOSING] entry 2: Subscribe buttons are never between the visitor and sign-in",
   at('account-block') < at('upgrade-compare'));

// 3. Pipeline CTA — the empty-state "Sign in / Create free account" button.
shell.insertBefore(el('account-block'), el('redeem-block'));
globalThis.openUpgrade('save');
ok("[DEFECT-CLOSING] entry 3 (Pipeline CTA): free auth controls precede the paid cards",
   at('account-block') < at('upgrade-compare'));
const pipelineSrc = src("docs/src/js/pipeline.js");
ok("[PRESERVATION] the Pipeline CTA still routes into this one shared modal",
   /openUpgrade\('save'\)/.test(pipelineSrc));
ok("[PRESERVATION] the Pipeline empty state still promises the free account",
   /Your pipeline lives with your free account/.test(pipelineSrc));

// 4. region lock and the tier badge reach the same law.
for (const t of ['region', 'general']) {
  shell.insertBefore(el('account-block'), el('redeem-block'));
  globalThis.openUpgrade(t);
  ok(`[DEFECT-CLOSING] signed-out '${t}' entry also leads with the free account`,
     at('account-block') < at('upgrade-compare'));
}

// signed-out never shows paid-account furniture
ok("[PRESERVATION] signed-out hides Manage subscription", el('manage-sub-btn').style.display === 'none');
ok("[PRESERVATION] signed-out hides the top-tier note", el('upgrade-toptier-note').style.display === 'none');
ok("[COMPLIANCE] signed-out shows the plans lead-in carrying the funding sentence",
   el('upgrade-plans-lead').style.display === '' &&
   /funding stays free on every tier/.test(el('upgrade-plans-lead').textContent));

// A stale tier cache cannot strand a signed-out visitor behind "You're on Investor".
store.set('tier', 'investor');
shell.insertBefore(el('account-block'), el('redeem-block'));
globalThis.openUpgrade('general');
ok("[DEFECT-CLOSING] a stale paid tier cache still yields the signed-out free-account view",
   at('account-block') < at('upgrade-compare') && /free account/i.test(el('upgrade-modal-title').textContent));
ok("[DEFECT-CLOSING] a stale paid tier cache never hides the plans from a signed-out visitor",
   el('upgrade-compare').style.display === '');
store.delete('tier');

// ── §C · signed-in Upgrade keeps the paid-first experience ──────────────────
await signIn(null);            // signed in, starter
globalThis.openUpgrade('general');
ok("[PRESERVATION] signed-in Upgrade puts the plan cards back above the account block",
   at('upgrade-compare') < at('account-block'));
ok("[PRESERVATION] signed-in Upgrade restores the authored block order exactly",
   order().join(',') === AUTHORED.join(','));
ok("[PRESERVATION] signed-in Upgrade keeps the paid headline", el('upgrade-modal-title').textContent === 'Upgrade Your Plan');
ok("[PRESERVATION] signed-in Upgrade keeps the paid subhead",
   /funding stays free on every tier/.test(el('upgrade-subhead').textContent));
ok("[PRESERVATION] signed-in Upgrade hides the duplicate plans lead-in", el('upgrade-plans-lead').style.display === 'none');
ok("[PRESERVATION] signed-in Upgrade still offers both purchases", el('upgrade-compare').style.display === '');
globalThis.openUpgrade('region');
ok("[PRESERVATION] signed-in trigger headlines still apply",
   el('upgrade-modal-title').textContent === 'Analyze deals in 4 markets, not 2');
ok("[PRESERVATION] signed-in ordering is stable across repeat opens", at('upgrade-compare') < at('account-block'));

await signIn('investor');
globalThis.openUpgrade('general');
ok("[PRESERVATION] Investor still sells nothing", el('upgrade-compare').style.display === 'none');
ok("[PRESERVATION] Investor still reaches Manage subscription", el('manage-sub-btn').style.display === '');
ok("[PRESERVATION] Investor keeps plans-first ordering", at('upgrade-compare') < at('account-block'));
await signIn('pro');
globalThis.openUpgrade('general');
ok("[PRESERVATION] Pro still sells nothing", el('upgrade-compare').style.display === 'none');
ok("[PRESERVATION] Pro still reaches Manage subscription", el('manage-sub-btn').style.display === '');

// signed-out → signed-in → signed-out round trip returns to account-first
await signOut();
globalThis.openUpgrade('save');
ok("[DEFECT-CLOSING] the order follows auth state on every open, not just the first",
   at('account-block') < at('upgrade-compare'));
ok("[HARNESS] no console errors were produced by any modal configuration", errCalls.length === 0);

// ── §D · nothing about auth, Checkout or consent changed ────────────────────
const mainJs = src("docs/src/js/main.js");
const authJs = src("docs/src/js/auth.js");
const checkoutTs = src("supabase/functions/checkout/index.ts");
ok("[PRESERVATION] auth.js is untouched by this fix (no layout concern leaked into it)",
   !/accountFirst|upgradeModalLayout|account-first/.test(authJs));
ok("[PRESERVATION] the OTP send/verify pair is unchanged",
   /sendOtpCode/.test(mainJs) && /verifyOtpCode/.test(mainJs));
ok("[PRESERVATION] startCheckout still names an abstract tier only",
   /functions\.invoke\('checkout', \{ body: \{ tier: tierName \} \}\)/.test(mainJs));
ok("[PRESERVATION] the client still never carries a price id", !/price_[A-Za-z0-9]/.test(mainJs) && !/price_[A-Za-z0-9]/.test(html));
ok("[PRESERVATION] Stripe-native Terms consent is still required server-side",
   /consent_collection: \{ terms_of_service: 'required' \}/.test(checkoutTs));
ok("[LAW] no custom Terms checkbox was introduced",
   !/type="checkbox"[^>]*(terms|tos)/i.test(html) && !/(terms|tos)[^>]*type="checkbox"/i.test(html));
ok("[PRESERVATION] the paid→paid guard is untouched", /plan_change_unavailable/.test(checkoutTs));
ok("[PRESERVATION] no promotion-code posture change", !/allow_promotion_codes/.test(mainJs));

// ── §E · prices, plan copy and actions are byte-unchanged ───────────────────
const compareHtml = modalHtml.slice(modalHtml.indexOf('id="upgrade-compare"'), modalHtml.indexOf('id="upgrade-toptier-note"'));
ok("[PRESERVATION] Investor is $14/mo", /\$14<span class="tc-per">\/mo<\/span>/.test(compareHtml));
ok("[PRESERVATION] Pro is $29/mo", /\$29<span class="tc-per">\/mo<\/span>/.test(compareHtml));
ok("[PRESERVATION] no annual or trial offer reappeared", !/\/yr|annual|per year|free trial|trial/i.test(compareHtml));
ok("[PRESERVATION] the BEST VALUE badge survives", /BEST VALUE/.test(compareHtml));
ok("[PRESERVATION] both Subscribe actions survive unchanged",
   /startCheckout\('investor'\)/.test(compareHtml) && /startCheckout\('pro'\)/.test(compareHtml));
ok("[PRESERVATION] Investor keeps all five feature lines",
   (compareHtml.slice(0, compareHtml.indexOf('tier-card-featured')).match(/<li>/g) || []).length === 5);
ok("[PRESERVATION] Pro keeps all five feature lines",
   (compareHtml.slice(compareHtml.indexOf('tier-card-featured')).match(/<li>/g) || []).length === 5);
ok("[COMPLIANCE] no plan card claims funding advantage",
   !/priorit|faster funding|better rate|approv|guarantee/i.test(compareHtml));

console.log(`\nmodalauth: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Signed-out account priority holds ✓");
