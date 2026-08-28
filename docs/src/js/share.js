// ─── Share: app + deal ────────────────────────────────────────────────────────

import { fmt, pct } from './format.js';
import { getDeals } from './storage.js';
import { supabase } from './supabaseClient.js';
import { resultInsuranceStatus, resultTaxStatus, pendingPresentationFor } from './insuranceReadiness.js';

// NOTE: Phase 1 will hard-code APP_URL to the deployed domain.
// Wave 5 (SR-7 testability): guard the top-level `location` read so the pure
// summary builder below is importable by the Node test suite.
const APP_URL = (typeof location !== 'undefined' ? location.href : '').split('#')[0];

// Local modal helpers
const openModal  = id => document.getElementById(id).classList.add('active');
const closeModal = id => document.getElementById(id).classList.remove('active');

// ─── Share app ────────────────────────────────────────────────────────────────

// UX-wave hardening ruling 2: the app-level share follows the same governed
// behavior as the deal path — the OS share sheet where supported, and a clean
// fallback (WhatsApp / Email / Copy Link) everywhere else. The sms: protocol
// and its phone-number prompt are gone from this path too, so no share surface
// can reach the Windows "Open Pick an app?" dead end.
export async function openShareApp() {
  const msg = 'Check out DealFit by Clear Path Capital — it analyzes real estate deals in seconds: ' + APP_URL;
  if (canNativeShare()) {
    try {
      await navigator.share({ title: 'DealFit by Clear Path Capital',
        text: 'Check out DealFit by Clear Path Capital — it analyzes real estate deals in seconds.', url: APP_URL });
      return;
    } catch { /* dismissed or rejected payload — offer the fallback */ }
  }
  const opts = [
    {
      icon: shareIconSVG('whatsapp'), name: 'WhatsApp', desc: 'Share via WhatsApp',
      href: 'https://wa.me/?text=' + encodeURIComponent(msg),
    },
    {
      icon: shareIconSVG('email'), name: 'Email', desc: 'Email this app to someone',
      href: 'mailto:?subject=' + encodeURIComponent('DealFit by Clear Path Capital') + '&body=' + encodeURIComponent(msg),
    },
    {
      icon: shareIconSVG('copy'), name: 'Copy Link', desc: 'Paste anywhere',
      action: () => { navigator.clipboard.writeText(APP_URL); window.showToast && window.showToast('Link copied'); closeModal('modal-share-app'); },
    },
  ];

  document.getElementById('share-app-options').innerHTML = opts.map((o, i) => renderShareOpt(o, i, 'app')).join('');
  window._shareAppOpts = opts;
  openModal('modal-share-app');
}

// ─── Share deal (UX wave finding 5) ──────────────────────────────────────────
// PROVEN: the old flow led with an sms: protocol — on desktop Windows/Chrome
// that dead-ends in an "Open Pick an app?" dialog, and on mobile it bypassed
// the OS share sheet's contact picker. The redesign:
//   A. navigator.share environments → the OS share sheet directly (Messages,
//      recent contacts, Mail — whatever the OS exposes). No contacts access.
//   B. everywhere else → a clean fallback: Copy Share Link / Email / Copy Deal
//      Summary. The sms: protocol is GONE from the deal path.
// The message is concise opportunity copy carrying a deal-specific read-only
// link (server-minted opaque token, migration 0014) instead of the analysis
// dump; the recipient views the deal without an account.

// Where the read-only viewer lives, derived the same guarded way as APP_URL.
const SHARE_VIEW_URL = APP_URL.replace(/[^/]*$/, '') + 'shared.html';

// Pure message builder (exported for tests). With a url: the full opportunity
// message. Without (link unavailable / native share carries url separately):
// the same copy minus the link block. Region comes from the market stamped on
// the deal at save time; legacy deals without one just omit it.
export function buildShareMessage(d, url) {
  const region = d.marketLabel ? ' in ' + d.marketLabel : '';
  const lines = ['Potential investment opportunity' + region, '', d.name];
  if (url) lines.push('', 'Click below to view the deal in DealFit:', url);
  return lines.join('\n');
}

export async function shareDeal(id) {
  const deal = getDeals().find(d => d.id === id);
  if (!deal) return;

  // Mint (or re-fetch — idempotent) the deal's opaque share link.
  let url = null;
  try {
    const { data, error } = await supabase.rpc('create_deal_share', { p_deal_id: id });
    if (!error && data && data.ok && data.token) url = SHARE_VIEW_URL + '?d=' + data.token;
  } catch { /* link unavailable — fall back to summary sharing below */ }

  // A. Native share sheet — the OS owns contact/app selection.
  if (canNativeShare() && url) {
    try {
      await navigator.share({ title: deal.name, text: buildShareMessage(deal, null), url });
      return;
    } catch { /* user dismissed the sheet, or payload rejected — offer the fallback */ }
  }

  // B. Fallback (desktop, no navigator.share, or no link): no sms: anywhere.
  const fullMsg = url
    ? buildShareMessage(deal, url)
    : buildDealSummaryText(deal) + '\n\nAnalyzed with DealFit: ' + APP_URL;
  if (!url) window.showToast && window.showToast('Share link unavailable right now — sharing the summary instead.');
  const opts = [
    url ? {
      icon: shareIconSVG('copy'), name: 'Copy Share Link', desc: 'A read-only view of this deal',
      action: () => { navigator.clipboard.writeText(url); window.showToast && window.showToast('Share link copied'); closeModal('modal-share-deal'); },
    } : null,
    {
      icon: shareIconSVG('email'), name: 'Email', desc: 'Send to your partner or lender',
      href: 'mailto:?subject=' + encodeURIComponent('Deal: ' + deal.name) + '&body=' + encodeURIComponent(fullMsg),
    },
    {
      icon: shareIconSVG('copy'), name: 'Copy Deal Summary', desc: 'Full analysis text, paste in any app',
      action: () => { navigator.clipboard.writeText(buildDealSummaryText(deal) + (url ? '\n\nView the deal: ' + url : '')); window.showToast && window.showToast('Summary copied'); closeModal('modal-share-deal'); },
    },
  ].filter(Boolean);

  document.getElementById('share-deal-options').innerHTML = opts.map((o, i) => renderShareOpt(o, i, 'deal')).join('');
  window._shareDealOpts = opts;
  openModal('modal-share-deal');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Wave 5 · SR-7: every analyzer type gets its own honest branch. The baseline
// version branched only `flip` vs everything-else-as-STR, so LTR and BRRR deals
// shared as "SHORT-TERM RENTAL ANALYSIS" with `undefined% occ.` — reachable by
// any Investor/Pro sharing a saved LTR/BRRR deal. Exported for the Node suite
// (tests/share.test.mjs); pure — no DOM/location access.
export function buildDealSummaryText(d) {
  const data  = d.data || {};
  // Phase A: unresolved insurance on LTR/BRRR deals — the shared text must not
  // expose finite insurance-dependent values or the positive verdict headline.
  const insStatus     = resultInsuranceStatus(data);
  const taxSt         = resultTaxStatus(data); // F-5/F-6: blank expenses pend shared text
  const pendP         = pendingPresentationFor(d.type, taxSt, insStatus);
  const unresolvedIns = !!pendP;
  const headline      = pendP ? pendP.tag : d.verdict.toUpperCase();
  // Never let a missing field print as "undefined" in someone's message thread.
  const money = (v) => (v == null ? 'n/a' : fmt(v));
  const perc  = (v) => (v == null ? 'n/a' : pct(v));
  const dscrS = (v) => (v == null ? 'n/a' : Number(v).toFixed(2));
  const pend  = (s, v) => (unresolvedIns ? 'Pending' : s(v));
  const lines = ['🏠 ' + d.name + ' — ' + headline];
  if (data.addr) lines.push('📍 ' + data.addr);
  lines.push('');
  if (d.type === 'flip') {
    lines.push('FIX & FLIP ANALYSIS');
    lines.push('Asking: ' + money(data.ask) + '  |  ARV: ' + money(data.arv));
    lines.push('Repairs: ' + money(data.rep) + (data.self ? ' (self-perform)' : ''));
    lines.push('Profit: ' + money(data.profit) + '  |  ROI: ' + perc(data.roi));
    lines.push('Max offer: ' + money(data.maxOffer));
  } else if (d.type === 'ltr') {
    // Every LTR headline stat is insurance-dependent (matches pendingDealStats).
    lines.push('LONG-TERM RENTAL (DSCR) ANALYSIS');
    if (data.price != null) lines.push('Price: ' + money(data.price));
    lines.push('DSCR: ' + pend(dscrS, data.dscr));
    lines.push('Cash-on-cash: ' + pend(perc, data.coc));
    lines.push('Cash flow: ' + pend(money, data.cashFlowMo) + '/mo');
  } else if (d.type === 'brrr') {
    // BRRR keeps its refi math; only DSCR is insurance-dependent (matches
    // pendingDealStats).
    lines.push('BRRR ANALYSIS');
    if (data.price != null) lines.push('Price: ' + money(data.price));
    lines.push('DSCR: ' + pend(dscrS, data.dscr));
    lines.push('Capital left in: ' + money(data.capitalLeft));
    lines.push('Cash recovered: ' + perc(data.cashRecoveredPct));
  } else {
    lines.push('SHORT-TERM RENTAL ANALYSIS');
    lines.push('Price: ' + money(data.price) + '  |  Down: ' + (data.down == null ? 'n/a' : data.down + '%'));
    lines.push('Gross rent: ' + money(data.rent) + ' @ ' + (data.occ == null ? 'n/a' : data.occ + '%') + ' occ.');
    lines.push('Cash flow: ' + pend(money, data.cashflow) + '/yr');
    lines.push('Cash-on-cash: ' + pend(perc, data.coc) + '  |  Cap rate: ' + pend(perc, data.capRate));
  }
  if (d.notes) { lines.push(''); lines.push('Notes: ' + d.notes); }
  return lines.join('\n');
}

function renderShareOpt(o, i, kind) {
  if (o.href) {
    return `<a class="share-opt" href="${o.href}" target="_blank" rel="noopener">
      <div class="share-icon">${o.icon}</div>
      <div class="share-info"><div class="share-name">${o.name}</div><div class="share-desc">${o.desc}</div></div>
    </a>`;
  }
  return `<div class="share-opt accent" onclick="(window._share${kind === 'app' ? 'App' : 'Deal'}Opts[${i}].action())">
    <div class="share-icon">${o.icon}</div>
    <div class="share-info"><div class="share-name">${o.name}</div><div class="share-desc">${o.desc}</div></div>
  </div>`;
}

function canNativeShare() { return !!navigator.share; }

// UX-wave hardening ruling 2: promptPhoneAndSend (the sms: launcher) is GONE —
// both share paths now route through the OS share sheet or the clean fallbacks
// above. The OS, not DealFit, owns contact and messaging-app selection.

function shareIconSVG(type) {
  const icons = {
    native:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.7.1-2-.9-3.4-3.1-3.5-3.2-.1-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5s0-.4 0-.5c-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5 0-.8.3s-1 1-1 2.5 1 2.9 1.2 3.1c.1.2 2 3.1 4.9 4.4 2.9 1.2 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.4-1.4C8.7 21.5 10.3 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.2.8.9-3.1-.2-.3C4.1 14.7 3.7 13.4 3.7 12 3.7 7.4 7.4 3.7 12 3.7c4.6 0 8.3 3.7 8.3 8.3 0 4.6-3.7 8-8.3 8z"/></svg>',
    email:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"/></svg>',
    copy:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  };
  return icons[type] || '';
}
