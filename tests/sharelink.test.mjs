// UX wave finding 5 — share redesign: native share sheet first, clean desktop
// fallback, concise opportunity copy, deal-specific read-only link.
// Run: node --import ./tests/_hooks/register-stubs.mjs tests/sharelink.test.mjs
//
// PROVEN DEFECTS: desktop Share fired an sms: protocol (Windows "Open Pick an
// app?" dead end); mobile bypassed the OS share sheet's contact picker; the
// message dumped the full underwriting into SMS with only a homepage link.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

let pass = 0, fail = 0;
const fails = [];
const ok = (label, v) => { if (v) pass++; else { fail++; fails.push(label); } };

// ── shims ────────────────────────────────────────────────────────────────────
const elements = new Map();
const mkEl = (id) => ({
  id, textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, checked: false,
  classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);}, toggle(){} },
  addEventListener(){}, removeEventListener(){}, setAttribute(){}, removeAttribute(){}, focus(){}, click(){},
  querySelectorAll: () => [], querySelector: () => null,
});
const el = (id) => { if (!elements.has(id)) elements.set(id, mkEl(id)); return elements.get(id); };
globalThis.location = { search: '', href: 'https://dealfit.clearpathcapfunding.com/index.html', pathname: '/index.html' };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k,v)=>store.set(k,String(v)), removeItem:(k)=>store.delete(k) };
globalThis.document = {
  getElementById: el, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){}, body: mkEl('body'), documentElement: mkEl('html'), createElement: (t)=>mkEl('_'+t),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, addListener(){} });
globalThis.history = { replaceState(){} };
// Node's navigator global is getter-only — redefine instead of assigning.
const clip = [];
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: (t) => { clip.push(t); return Promise.resolve(); } }, userAgent: 'test' },
  writable: true, configurable: true,
});
const toasts = [];
globalThis.showToast = (m) => toasts.push(m);
console.warn = () => {}; console.error = () => {};

const session = { user: { id: 'u-share', email: 'qa@example.com' } };
const DEAL = { id: 5001, name: '417 Saddlebrooke Rd — Lake Murray', type: 'flip',
  verdict: 'Counter at Max Offer — Walk Away', cls: 'pass', notes: 'private',
  date: 'Aug 26, 2026', marketLabel: 'Lake Murray SC',
  data: { addr: '417 Saddlebrooke Rd, Lexington SC', ask: 289000, arv: 365000, rep: 98000,
          profit: -56780, roi: -14.1, maxOffer: 175750, self: true },
  stats: [{ l: 'Profit', v: '-$56,780' }] };

globalThis.__stubSupabase = { session, rpc: {
  get_pipeline: { data: [DEAL], error: null },
  create_deal_share: { data: { ok: true, token: 'a'.repeat(32) }, error: null },
} };
const auth    = await import("../docs/src/js/auth.js");
const storage = await import("../docs/src/js/storage.js");
const share   = await import("../docs/src/js/share.js");
const viewer  = await import("../docs/src/js/sharedView.js");
await auth.initAuthAndEntitlement();
await storage.hydratePipeline();

const TOKEN_URL = 'https://dealfit.clearpathcapfunding.com/shared.html?d=' + 'a'.repeat(32);

// ── §A · the concise opportunity message (pure builder goldens) ──────────────
// Track F re-pin (same-commit law): "Click below" → "Tap" (recipients open
// these in Messages on a phone), and the native-sheet variant gains the cue —
// texts were arriving with nothing telling the recipient the link IS the deal.
const msg = share.buildShareMessage(DEAL, TOKEN_URL);
ok("[DEFECT-CLOSING] message follows the governed structure exactly",
   msg === 'Potential investment opportunity in Lake Murray SC\n\n417 Saddlebrooke Rd — Lake Murray\n\nTap to view the deal in DealFit:\n' + TOKEN_URL);
ok("[DEFECT-CLOSING] no underwriting dump in the message",
   !/ARV|Repairs|Profit|ROI|Max offer|\$/.test(msg));
ok("[DEFECT-CLOSING] notes never enter the share message", !/private/.test(msg));
const noRegion = share.buildShareMessage({ ...DEAL, marketLabel: null }, TOKEN_URL);
ok("[GRACEFUL] a legacy deal without a market omits the region cleanly",
   noRegion.startsWith('Potential investment opportunity\n\n'));
ok("[GRACEFUL] native-share variant carries the tap cue without a duplicate link",
   share.buildShareMessage(DEAL, null) === 'Potential investment opportunity in Lake Murray SC\n\n417 Saddlebrooke Rd — Lake Murray\n\nTap to view the deal in DealFit.');

// ── §B · navigator.share environments: the OS sheet, directly ────────────────
let shared = [];
globalThis.navigator.share = (payload) => { shared.push(payload); return Promise.resolve(); };
await share.shareDeal(5001);
ok("[DEFECT-CLOSING] native path invokes the OS share sheet exactly once", shared.length === 1);
ok("[DEFECT-CLOSING] the sheet gets the deal-specific url", shared[0].url === TOKEN_URL);
ok("[DEFECT-CLOSING] the sheet text is the concise copy (no link duplication)",
   shared[0].text === share.buildShareMessage(DEAL, null) && !/shared\.html/.test(shared[0].text));
ok("[DEFECT-CLOSING] no fallback modal opened on the native path",
   !el('modal-share-deal').classList.contains('active'));

// ── §C · desktop / no navigator.share: clean fallback, sms is GONE ───────────
delete globalThis.navigator.share;
await share.shareDeal(5001);
const optsHtml = el('share-deal-options').innerHTML;
ok("[DEFECT-CLOSING] fallback modal opens", el('modal-share-deal').classList.contains('active'));
ok("[DEFECT-CLOSING] Copy Share Link is offered", /Copy Share Link/.test(optsHtml));
ok("[DEFECT-CLOSING] Email fallback is offered", /mailto:/.test(optsHtml));
ok("[DEFECT-CLOSING] NO sms: protocol anywhere in the deal share options", !/sms:/.test(optsHtml));
ok("[DEFECT-CLOSING] no Send-by-Text option survives in the deal path", !/Send by Text/.test(optsHtml));
window._shareDealOpts[0].action();
ok("[DEFECT-CLOSING] Copy Share Link copies the deal url", clip[clip.length - 1] === TOKEN_URL);

// link unavailable → honest summary fallback, still no sms
globalThis.__stubSupabase.rpc.create_deal_share = { data: null, error: { message: 'down' } };
toasts.length = 0;
await share.shareDeal(5001);
ok("[GRACEFUL] link failure told to the user honestly", toasts.some(t => /Share link unavailable/.test(t)));
ok("[GRACEFUL] summary fallback still carries no sms:", !/sms:/.test(el('share-deal-options').innerHTML));
globalThis.__stubSupabase.rpc.create_deal_share = { data: { ok: true, token: 'a'.repeat(32) }, error: null };

// ── §D · source law pins ─────────────────────────────────────────────────────
const shSrc = src("docs/src/js/share.js");
const dealPath = shSrc.slice(shSrc.indexOf('export async function shareDeal'), shSrc.indexOf('// ─── Helpers'));
ok("[DEFECT-CLOSING] the deal share path contains no sms: protocol", !/['"]sms:/.test(dealPath));
ok("[DEFECT-CLOSING] the deal share path never calls promptPhoneAndSend", !/promptPhoneAndSend/.test(dealPath));
ok("[PRESERVATION] buildDealSummaryText is untouched (its 7 pend gates included)",
   (shSrc.match(/pend\((money|perc|dscrS),/g) || []).length === 7);
ok("[PRESERVATION] the share-link RPC is the 0014 one", /rpc\('create_deal_share', \{ p_deal_id: id \}\)/.test(shSrc));
// "lender" appears only as the pre-existing Email recipient descriptor ("your
// partner or lender") — a recipient, not a lending claim; the compliance sweep
// targets actual advantage/approval claims.
ok("[COMPLIANCE] share copy sells no funding advantage",
   !/priorit|faster funding|better rate|approv|guarantee|lending|loan offer/i.test(dealPath));

// ── §E · the read-only viewer renders the whitelisted projection ─────────────
const html = viewer.buildSharedDealHTML(DEAL);
ok("[DEFECT-CLOSING] viewer shows the deal name", /417 Saddlebrooke Rd — Lake Murray/.test(html));
ok("[DEFECT-CLOSING] viewer shows the verdict badge", /Counter at Max Offer/.test(html));
ok("[DEFECT-CLOSING] viewer carries the renamed cost labels", /Buying costs \/ Selling costs/.test(html));
ok("[DEFECT-CLOSING] figures are marked (est.)", /Net profit \(est\.\)/.test(html));
ok("[SAFETY] nothing renders as undefined", !/undefined/.test(html));
ok("[SAFETY] viewer HTML has no owner-only controls", !/Edit|Delete|requestDelete|saveDeal/.test(html));
const evil = viewer.buildSharedDealHTML({ ...DEAL, name: '<img src=x onerror=alert(1)>', data: { ...DEAL.data, addr: '<script>x</script>' } });
ok("[SAFETY] name/address are HTML-escaped", !/<img|<script>x/.test(evil));
const viewSrc = src("docs/src/js/sharedView.js");
ok("[SAFETY] the viewer validates the token shape before any network call",
   /\^\[0-9a-f\]\{32\}\$/.test(viewSrc));
// Precise mutation sweep: writing RPC names and supabase table-write calls.
// (`deal.updated` — the display stamp — legitimately appears; it is not a write.)
ok("[PRESERVATION] the viewer owns no mutation path",
   !/save_pipeline|create_deal_share|revoke_deal_share|\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(viewSrc)
   && (viewSrc.match(/supabase\.rpc\(/g) || []).length === 1
   && /supabase\.rpc\('get_shared_deal'/.test(viewSrc));
const sharedHtml = src("docs/shared.html");
ok("[SAFETY] shared page is noindex", /noindex/.test(sharedHtml));
ok("[COMPLIANCE] shared page carries the broker-not-lender disclaimer",
   /broker, not a lender/.test(sharedHtml) && /\(est\.\)/.test(sharedHtml));

// ── §F · openShareApp joins the governed behavior (hardening ruling 2) ───────
// The app-level share was the remaining path that could launch an sms: handler
// into the Windows "Open Pick an app?" dead end. Same law as the deal path:
// OS share sheet where supported; WhatsApp / Email / Copy Link fallback; no
// sms:, no phone-number prompt, anywhere in the file.
shared = [];
globalThis.navigator.share = (payload) => { shared.push(payload); return Promise.resolve(); };
await share.openShareApp();
ok("[DEFECT-CLOSING · APP] native path invokes the OS share sheet once", shared.length === 1 && !!shared[0].url);
ok("[DEFECT-CLOSING · APP] no modal on the native path", !el('modal-share-app').classList.contains('active'));
delete globalThis.navigator.share;
await share.openShareApp();
const appHtml = el('share-app-options').innerHTML;
ok("[DEFECT-CLOSING · APP] fallback modal opens", el('modal-share-app').classList.contains('active'));
ok("[DEFECT-CLOSING · APP] WhatsApp / Email / Copy Link offered",
   /wa\.me/.test(appHtml) && /mailto:/.test(appHtml) && /Copy Link/.test(appHtml));
ok("[DEFECT-CLOSING · APP] no sms: and no Send by Text in the app path",
   !/sms:/.test(appHtml) && !/Send by Text/.test(appHtml));
ok("[DEFECT-CLOSING · APP] the sms: PROTOCOL string is gone from share.js entirely",
   !/['"]sms:/.test(shSrcFinal()));
// The tombstone COMMENT legitimately names the removed function — strip
// comments and test the executable text only.
ok("[DEFECT-CLOSING · APP] the phone-number prompt is gone from share.js entirely",
   !/promptPhoneAndSend|Enter the phone number/.test(shSrcFinal().replace(/\/\/[^\n]*/g, '')));
function shSrcFinal() { return src("docs/src/js/share.js"); }

console.log(`\nsharelink: ${pass} passed, ${fail} failed`);
if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("Share redesign law holds ✓");
