// ─── Share: app + deal ────────────────────────────────────────────────────────

import { fmt, pct } from './format.js';
import { getDeals } from './storage.js';
import { resultInsuranceStatus, insuranceReady, insurancePresentation } from './insuranceReadiness.js';

// NOTE: Phase 1 will hard-code APP_URL to the deployed domain.
const APP_URL = location.href.split('#')[0];

// Local modal helpers
const openModal  = id => document.getElementById(id).classList.add('active');
const closeModal = id => document.getElementById(id).classList.remove('active');

// ─── Share app ────────────────────────────────────────────────────────────────

export function openShareApp() {
  const msg = 'Check out this real estate Deal Screener app — it analyzes flips and STRs in seconds: ' + APP_URL;
  const opts = [
    canNativeShare() ? {
      icon: shareIconSVG('native'), name: 'Quick Share', desc: 'Pick a contact from your phone',
      action: () => nativeShare('Deal Screener app', msg),
    } : null,
    {
      icon: shareIconSVG('sms'), name: 'Send by Text', desc: 'Open your SMS app pre-filled',
      action: () => promptPhoneAndSend(msg, 'sms'),
    },
    {
      icon: shareIconSVG('whatsapp'), name: 'WhatsApp', desc: 'Share via WhatsApp',
      href: 'https://wa.me/?text=' + encodeURIComponent(msg),
    },
    {
      icon: shareIconSVG('email'), name: 'Email', desc: 'Email this app to someone',
      href: 'mailto:?subject=' + encodeURIComponent('Deal Screener app') + '&body=' + encodeURIComponent(msg),
    },
    {
      icon: shareIconSVG('copy'), name: 'Copy Link', desc: 'Paste anywhere',
      action: () => { navigator.clipboard.writeText(APP_URL); window.showToast && window.showToast('Link copied'); closeModal('modal-share-app'); },
    },
  ].filter(Boolean);

  document.getElementById('share-app-options').innerHTML = opts.map((o, i) => renderShareOpt(o, i, 'app')).join('');
  window._shareAppOpts = opts;
  openModal('modal-share-app');
}

// ─── Share deal ───────────────────────────────────────────────────────────────

export function shareDeal(id) {
  const deal = getDeals().find(d => d.id === id);
  if (!deal) return;
  const summary = buildDealSummaryText(deal);
  const fullMsg = summary + '\n\nAnalyzed with Deal Screener: ' + APP_URL;
  const opts = [
    canNativeShare() ? {
      icon: shareIconSVG('native'), name: 'Quick Share', desc: 'Pick a contact from your phone',
      action: () => nativeShare(deal.name, fullMsg),
    } : null,
    {
      icon: shareIconSVG('sms'), name: 'Send by Text', desc: 'Open your SMS app pre-filled',
      action: () => promptPhoneAndSend(fullMsg, 'sms'),
    },
    {
      icon: shareIconSVG('email'), name: 'Email', desc: 'Send to your partner or lender',
      href: 'mailto:?subject=' + encodeURIComponent('Deal: ' + deal.name) + '&body=' + encodeURIComponent(fullMsg),
    },
    {
      icon: shareIconSVG('copy'), name: 'Copy Deal Summary', desc: 'Paste in any app',
      action: () => { navigator.clipboard.writeText(fullMsg); window.showToast && window.showToast('Summary copied'); closeModal('modal-share-deal'); },
    },
  ].filter(Boolean);

  document.getElementById('share-deal-options').innerHTML = opts.map((o, i) => renderShareOpt(o, i, 'deal')).join('');
  window._shareDealOpts = opts;
  openModal('modal-share-deal');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDealSummaryText(d) {
  const data  = d.data || {};
  // Phase A: unresolved insurance on LTR/BRRR deals — the shared text must not
  // expose finite insurance-dependent values or the positive verdict headline.
  const insStatus     = resultInsuranceStatus(data);
  const unresolvedIns = (d.type === 'ltr' || d.type === 'brrr') && !insuranceReady(insStatus);
  const headline      = unresolvedIns ? insurancePresentation(insStatus).tag : d.verdict.toUpperCase();
  const lines = ['🏠 ' + d.name + ' — ' + headline];
  if (data.addr) lines.push('📍 ' + data.addr);
  lines.push('');
  if (d.type === 'flip') {
    lines.push('FIX & FLIP ANALYSIS');
    lines.push('Asking: ' + fmt(data.ask) + '  |  ARV: ' + fmt(data.arv));
    lines.push('Repairs: ' + fmt(data.rep) + (data.self ? ' (self-perform)' : ''));
    lines.push('Profit: ' + fmt(data.profit) + '  |  ROI: ' + pct(data.roi));
    lines.push('Max offer: ' + fmt(data.maxOffer));
  } else {
    lines.push('SHORT-TERM RENTAL ANALYSIS');
    lines.push('Price: ' + fmt(data.price) + '  |  Down: ' + data.down + '%');
    lines.push('Gross rent: ' + fmt(data.rent) + ' @ ' + data.occ + '% occ.');
    lines.push('Cash flow: ' + (unresolvedIns ? 'Pending' : fmt(data.cashflow)) + '/yr');
    lines.push('Cash-on-cash: ' + (unresolvedIns ? 'Pending' : pct(data.coc)) + '  |  Cap rate: ' + (unresolvedIns ? 'Pending' : pct(data.capRate)));
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

function nativeShare(title, text) {
  navigator.share({ title, text, url: APP_URL }).catch(() => {});
  closeModal('modal-share-app');
  closeModal('modal-share-deal');
}

function promptPhoneAndSend(message) {
  const num = prompt('Enter the phone number (digits only):');
  if (!num) return;
  const cleaned = num.replace(/[^\d+]/g, '');
  const isIOS   = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const sep     = isIOS ? '&' : '?';
  window.location.href = 'sms:' + cleaned + sep + 'body=' + encodeURIComponent(message);
  closeModal('modal-share-app');
  closeModal('modal-share-deal');
}

function shareIconSVG(type) {
  const icons = {
    native:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>',
    sms:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.7.1-2-.9-3.4-3.1-3.5-3.2-.1-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5s0-.4 0-.5c-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5 0-.8.3s-1 1-1 2.5 1 2.9 1.2 3.1c.1.2 2 3.1 4.9 4.4 2.9 1.2 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.4-1.4C8.7 21.5 10.3 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.2.8.9-3.1-.2-.3C4.1 14.7 3.7 13.4 3.7 12 3.7 7.4 7.4 3.7 12 3.7c4.6 0 8.3 3.7 8.3 8.3 0 4.6-3.7 8-8.3 8z"/></svg>',
    email:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"/></svg>',
    copy:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  };
  return icons[type] || '';
}
