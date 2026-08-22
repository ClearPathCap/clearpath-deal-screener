// Wave 5 · R1 stabilization: Functions-transport contract + safe diagnostics.
// Exercises the REAL shipped main.js checkout/portal paths against the
// scripted provider stub (tests/_hooks loader remap — no production seam).
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/transport.test.mjs
//
// Sections:
//  §A [DEFECT-CLOSING] SDK determinism — the shipped client must import an
//     EXACT supabase-js version. R1 Attempt 1 ran on a floating esm.sh @2
//     range whose bytes change under the CDN's feet (2.112.3 at diagnosis).
//  §B invocation contract — startCheckout reaches functions.invoke with the
//     abstract tier preserved; the returned {url} is the ONLY navigation
//     authority; signed-out never invokes.
//  §C server refusal mapping — 403/409/429 keep their specific customer
//     messages and are NEVER logged as transport failures.
//  §D [DEFECT-CLOSING] transport diagnostics — a thrown/failed invocation
//     produces the generic fallback PLUS a safe console diagnostic carrying
//     ONLY {op, kind, name, message, status}; token/session/header material
//     can never leak through the formatter. R1's actual exception was lost to
//     a bare `catch {}` — proven failing at 9ae341e.
//  §E shared surface — portal logs through the same safe path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── §A · SDK determinism (source text) ───────────────────────────────────────
const clientSrc = src("docs/src/js/supabaseClient.js");
ok("[DEFECT-CLOSING] supabaseClient pins the exact SDK version 2.112.3",
   clientSrc.includes("https://esm.sh/@supabase/supabase-js@2.112.3"));
ok("[DEFECT-CLOSING] no floating @2 SDK import survives",
   !/@supabase\/supabase-js@2['"]/.test(clientSrc));
ok("[DEFECT-CLOSING] no other module imports the SDK directly",
   !/supabase-js@/.test(src("docs/src/js/main.js")) && !/supabase-js@/.test(src("docs/src/js/auth.js")));

// ── browser-global shims so the real main.js module graph loads in Node ──────
globalThis.location = { search: '', href: 'https://dealfit.example/', pathname: '/' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const elements = new Map();
const mkEl = () => ({
  textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, checked: false,
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
  focus() {}, click() {}, appendChild() {}, querySelectorAll: () => [], querySelector: () => null,
});
globalThis.document = {
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, mkEl()); return elements.get(id); },
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener() {}, removeEventListener() {},
  body: mkEl(), documentElement: mkEl(), createElement: () => mkEl(),
};
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener ?? (() => {});
globalThis.removeEventListener = globalThis.removeEventListener ?? (() => {});
globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: false, addEventListener() {}, addListener() {} }));
globalThis.history = { replaceState() {} };

// console.error spy — diagnostics are asserted through it.
const errCalls = [];
const realConsoleError = console.error;
console.error = (...a) => { errCalls.push(a); };

// Import order: stub config FIRST (main.js runs initAuthAndEntitlement at import).
globalThis.__stubSupabase = { session: null, rpc: { current_tier: { data: null, error: null } } };
const main = await import("../docs/src/js/main.js");
const auth = await import("../docs/src/js/auth.js");
const toastEl = globalThis.document.getElementById('toast');

ok("main.js loads in the harness and publishes startCheckout", typeof globalThis.startCheckout === 'function');
ok("manageSubscription is published", typeof globalThis.manageSubscription === 'function');
ok("functionsFailureSummary is exported", typeof main.functionsFailureSummary === 'function');

const session = { user: { id: 'u-transport', email: 'qa@example.com' } };
const freshCfg = (extra) => {
  globalThis.__stubSupabase = { session, rpc: { current_tier: { data: null, error: null } }, ...extra };
  return globalThis.__stubSupabase;
};

// ── §B · invocation contract ─────────────────────────────────────────────────
globalThis.__stubSupabase = { session: null };
elements.get('toast') && (toastEl.textContent = '');
await globalThis.startCheckout('investor');
ok("signed-out startCheckout never invokes", !(globalThis.__stubSupabase.invokeCalls ?? []).length);
ok("signed-out startCheckout asks for sign-in", /sign in first/i.test(toastEl.textContent));

let c = freshCfg({ functions: { checkout: { data: { url: 'stub://go-investor' }, error: null } } });
await auth.initAuthAndEntitlement();
globalThis.location.href = 'https://dealfit.example/';
await globalThis.startCheckout('investor');
ok("authenticated startCheckout reaches functions.invoke",
   (c.invokeCalls ?? []).some(x => x.name === 'checkout'));
ok("tier 'investor' is preserved to the server",
   (c.invokeCalls ?? []).some(x => x.name === 'checkout' && x.opts?.body?.tier === 'investor'));
ok("returned url is the navigation authority", globalThis.location.href === 'stub://go-investor');

c = freshCfg({ functions: { checkout: { data: { url: 'stub://go-pro' }, error: null } } });
globalThis.location.href = 'https://dealfit.example/';
await globalThis.startCheckout('pro');
ok("tier 'pro' is preserved to the server",
   (c.invokeCalls ?? []).some(x => x.name === 'checkout' && x.opts?.body?.tier === 'pro'));
ok("pro url navigates", globalThis.location.href === 'stub://go-pro');

// ── §C · server refusal mapping (and refusals are never logged as transport) ─
const refusal = (status) => ({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status } } });
const cases = [
  [403, /isn't open yet/i], [409, /already have this tier/i], [429, /already starting/i],
];
for (const [status, re] of cases) {
  c = freshCfg({ functions: { checkout: refusal(status) } });
  errCalls.length = 0;
  toastEl.textContent = '';
  await globalThis.startCheckout('investor');
  ok(`server ${status} keeps its specific message`, re.test(toastEl.textContent));
  ok(`server ${status} refusal emits no transport diagnostic`, errCalls.length === 0);
}

// ── §D · transport diagnostics ───────────────────────────────────────────────
c = freshCfg({ functions: { checkout: () => { const e = new Error('lock acquisition failed'); e.name = 'NavigatorLockAcquireTimeoutError'; throw e; } } });
errCalls.length = 0;
toastEl.textContent = '';
await globalThis.startCheckout('investor');
ok("[DEFECT-CLOSING] thrown transport failure keeps the generic customer message",
   /unavailable right now/i.test(toastEl.textContent));
ok("[DEFECT-CLOSING] thrown transport failure emits exactly one diagnostic", errCalls.length === 1);
const diag = errCalls[0]?.[1];
ok("[DEFECT-CLOSING] diagnostic carries op/kind/name/message/status only",
   diag && Object.keys(diag).sort().join(',') === 'kind,message,name,op,status');
ok("diagnostic identifies the operation and error", diag?.op === 'checkout' && diag?.name === 'NavigatorLockAcquireTimeoutError' && diag?.kind === 'transport');

// malformed success: data without url
c = freshCfg({ functions: { checkout: { data: { unexpected: true }, error: null } } });
errCalls.length = 0; toastEl.textContent = '';
await globalThis.startCheckout('investor');
ok("malformed success falls back generically", /unavailable right now/i.test(toastEl.textContent));
ok("malformed success is diagnosed as MalformedResponse", errCalls[0]?.[1]?.name === 'MalformedResponse');

// formatter security: token/session material can never pass through
const hostile = new Error('boom');
hostile.name = 'FunctionsFetchError';
hostile.context = {
  status: 500,
  headers: { Authorization: 'Bearer SECRET-TOKEN-VALUE', apikey: 'SECRET-APIKEY' },
  session: { access_token: 'SECRET-ACCESS', refresh_token: 'SECRET-REFRESH' },
  body: '{"email":"someone@example.com"}',
};
const summary = main.functionsFailureSummary('checkout', hostile);
const flat = JSON.stringify(summary);
ok("[SECURITY] summary drops headers/session/body wholesale",
   !flat.includes('SECRET') && !flat.includes('Bearer') && !flat.includes('example.com'));
ok("[SECURITY] summary keys are exactly the approved set",
   Object.keys(summary).sort().join(',') === 'kind,message,name,op,status');
ok("summary classifies http vs transport by status presence",
   summary.kind === 'http' && main.functionsFailureSummary('x', new Error('y')).kind === 'transport');
ok("summary truncates long messages", main.functionsFailureSummary('x', new Error('z'.repeat(500))).message.length <= 200);

// ── §E · shared surface: portal logs through the same safe path ──────────────
c = freshCfg({ functions: { portal: () => { throw new Error('portal transport down'); } } });
errCalls.length = 0; toastEl.textContent = '';
await globalThis.manageSubscription();
ok("portal transport failure diagnosed with op 'portal'", errCalls[0]?.[1]?.op === 'portal');
ok("portal keeps its customer message", /isn't available yet/i.test(toastEl.textContent));
// reconcile path shares logFunctionsFailure by source pin (runs only on ?checkout= returns):
const mainSrc = src("docs/src/js/main.js");
ok("reconcile return-path is wired to the safe logger",
   /logFunctionsFailure\('reconcile'/.test(mainSrc) && /logFunctionsFailure\('checkout-return'/.test(mainSrc));

// ── §F · [DEFECT-CLOSING] Edge CORS preflight contract ───────────────────────
// R1 Attempt 2 halted at CORS preflight: the paid functions allowed only
// 'authorization, content-type', but supabase-js 2.112.3 sends x-client-info
// on every Functions call and apikey on authenticated ones — Chrome blocked
// the POST before the server gate was consulted. Proven failing pre-fix.
const REQUIRED_PREFLIGHT_HEADERS = ['authorization', 'apikey', 'content-type', 'x-client-info'];
const PROD_ORIGIN = 'https://dealfit.clearpathcapfunding.com';
for (const fn of ['checkout', 'reconcile', 'portal']) {
  const es = src(`supabase/functions/${fn}/index.ts`);
  const allowHeaders = (es.match(/'Access-Control-Allow-Headers':\s*'([^']*)'/) ?? [])[1] ?? '';
  const allowed = allowHeaders.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  for (const h of REQUIRED_PREFLIGHT_HEADERS) {
    ok(`[DEFECT-CLOSING] ${fn} CORS allows real-client header '${h}'`, allowed.includes(h));
  }
  const allowOrigin = (es.match(/'Access-Control-Allow-Origin':\s*'([^']*)'/) ?? [])[1] ?? '';
  ok(`${fn} CORS origin stays production-only`, allowOrigin === PROD_ORIGIN);
  ok(`${fn} CORS never uses wildcard origin`, !/Allow-Origin':\s*'\*'/.test(es));
  ok(`${fn} CORS never admits localhost`, !/localhost|127\.0\.0\.1/.test(allowOrigin) && !/Allow-Origin[^\n]*localhost/.test(es));
  ok(`${fn} allowed methods unchanged`, /'Access-Control-Allow-Methods':\s*'POST, OPTIONS'/.test(es));
  ok(`${fn} handles OPTIONS preflight with the CORS map`, /req\.method === 'OPTIONS'[^\n]*204[^\n]*CORS/.test(es));
}
ok("stripe-webhook remains CORS-free (server-to-server only)",
   !/Access-Control/i.test(src("supabase/functions/stripe-webhook/index.ts")));

// ── §G · [LAUNCH BLOCKER] paid→paid checkout guard (server source law) ───────
// Runtime QA proved an active Investor subscriber could complete a Pro
// Checkout, creating a SECOND Stripe subscription ($14 + $29 on one customer).
// Launch law: any active/grace Stripe entitlement blocks every new paid
// Checkout, enforced server-side BEFORE attempt/customer/session creation.
// Proven failing at parent 3b843b98.
const checkoutSrc = src("supabase/functions/checkout/index.ts");
const idx = (re) => { const m = re.exec(checkoutSrc); return m ? m.index : -1; };
const iGate    = idx(/checkout_enabled \|\| \(cfgRow\.allowlist/);
const iGuard   = idx(/plan_change_unavailable/);
const iBegin   = idx(/rpc\('begin_checkout_attempt'/);
const iCust    = idx(/stripe\.customers\.create/);
const iSession = idx(/stripe\.checkout\.sessions\.create/);
ok("[LAUNCH BLOCKER] paid→paid guard exists (plan_change_unavailable)", iGuard > -1);
ok("[LAUNCH BLOCKER] gate pre-check precedes the guard (no paid-state oracle for public callers)",
   iGate > -1 && iGate < iGuard);
ok("[LAUNCH BLOCKER] guard precedes attempt insertion", iGuard > -1 && iBegin > -1 && iGuard < iBegin);
ok("[LAUNCH BLOCKER] guard precedes Stripe customer creation", iGuard < iCust);
ok("[LAUNCH BLOCKER] guard precedes Stripe session creation", iGuard < iSession);
ok("[LAUNCH BLOCKER] guard reads stripe-source grants only", /eq\('source', 'stripe'\)/.test(checkoutSrc));
ok("[LAUNCH BLOCKER] guard is mode-scoped (livemode match)", /eq\('livemode', mode === 'live'\)/.test(checkoutSrc));
ok("[LAUNCH BLOCKER] guard blocks exactly active-with-future-period and grace-with-future-grace_until",
   /and\(status\.eq\.active,current_period_end\.gt\./.test(checkoutSrc)
   && /and\(status\.eq\.grace,grace_until\.gt\./.test(checkoutSrc)
   && !/status\.eq\.(ended|revoked)/.test(checkoutSrc));
ok("[LAUNCH BLOCKER] a stripe_customers mapping alone never blocks (guard reads entitlement_grants, not stripe_customers)",
   /from\('entitlement_grants'\)/.test(checkoutSrc.slice(0, iBegin))
   && !/from\('stripe_customers'\)/.test(checkoutSrc.slice(iGuard - 800, iBegin)));
ok("[LAUNCH BLOCKER] entitlement-check failure fails closed", /entitlement_check_failed/.test(checkoutSrc)
   && idx(/entitlement_check_failed/) < iBegin);
ok("[PRESERVATION] same-tier law still enforced in the definer call", /refused_same_tier/.test(checkoutSrc));
ok("[PRESERVATION] server-selected price law intact", /tier === 'pro' \? cfg\.priceProMonthly : cfg\.priceInvestorMonthly/.test(checkoutSrc));
ok("[PRESERVATION] reconcile/portal untouched by the guard",
   !/plan_change_unavailable/.test(src("supabase/functions/reconcile/index.ts"))
   && !/plan_change_unavailable/.test(src("supabase/functions/portal/index.ts")));

// ── §H · [LAUNCH BLOCKER] client mapping + paid-tier UI suppression ──────────
// New refusal renders truthfully; body error code outranks bare 409 status.
const mkPlanChangeCtx = () => ({ status: 409, clone() { return { json: async () => ({ error: 'plan_change_unavailable' }) }; } });
c = freshCfg({ functions: { checkout: { data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: mkPlanChangeCtx() } } } });
errCalls.length = 0; toastEl.textContent = '';
await globalThis.startCheckout('pro');
ok("[LAUNCH BLOCKER] plan_change_unavailable renders its own truthful message",
   /plan changes aren't available yet/i.test(toastEl.textContent));
ok("[LAUNCH BLOCKER] plan_change_unavailable is a server refusal, not a transport diagnostic", errCalls.length === 0);
// already_entitled (bare 409, no clone) keeps its message — body parse falls through safely
c = freshCfg({ functions: { checkout: refusal(409) } });
toastEl.textContent = '';
await globalThis.startCheckout('investor');
ok("[PRESERVATION] bare-409 already_entitled mapping intact after body-parse change",
   /already have this tier/i.test(toastEl.textContent));

// UI: paid tiers expose NO actionable Subscribe control; Starter unchanged.
const modalEls = {
  compare: elements.get('upgrade-compare') ?? globalThis.document.getElementById('upgrade-compare'),
  topNote: globalThis.document.getElementById('upgrade-toptier-note'),
  title:   globalThis.document.getElementById('upgrade-modal-title'),
};
const setTierTo = async (v) => {
  globalThis.__stubSupabase = { session, rpc: { current_tier: { data: v, error: null } } };
  await auth.initAuthAndEntitlement();
};
await setTierTo('investor');
globalThis.openUpgrade('general');
ok("[LAUNCH BLOCKER] Investor modal hides the purchase comparison entirely",
   modalEls.compare.style.display === 'none');
ok("[LAUNCH BLOCKER] Investor modal states plan changes are unavailable",
   /plan changes aren't available yet/i.test(modalEls.topNote.textContent) && modalEls.topNote.style.display === 'block');
await setTierTo('pro');
globalThis.openUpgrade('general');
ok("[PRESERVATION] Pro modal still sells nothing", modalEls.compare.style.display === 'none');
ok("[PRESERVATION] Pro note remains truthful", /every feature is unlocked/i.test(modalEls.topNote.textContent));
await setTierTo(null);   // server: starter
globalThis.openUpgrade('general');
ok("[PRESERVATION] Starter modal still offers both purchases (comparison visible)",
   modalEls.compare.style.display === '');
ok("[PRESERVATION] Starter purchase CTAs unchanged in markup",
   /startCheckout\('investor'\)/.test(src("docs/index.html")) && /startCheckout\('pro'\)/.test(src("docs/index.html")));

console.error = realConsoleError;
console.log(`\ntransport: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Functions-transport contract + safe diagnostics hold ✓");
