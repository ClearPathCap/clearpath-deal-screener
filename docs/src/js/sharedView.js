// ─── Read-only shared-deal viewer (UX wave finding 5) ────────────────────────
// Loaded ONLY by shared.html. Fetches the whitelisted deal projection through
// the anon-executable get_shared_deal RPC (migration 0014) and renders it with
// the app's own styles. Deliberately owns NO mutation path, no owner controls,
// no auth flow — a recipient views the deal without an account, full stop.
// Live semantics: every load shows the owner's latest SAVED state.

import { supabase } from './supabaseClient.js';
import { fmt, pct, escapeHtml } from './format.js';

const money = (v) => (v == null ? '—' : fmt(v));
const perc  = (v) => (v == null ? '—' : pct(v));

// Pure renderer, exported for the Node suite. Returns the content HTML for a
// whitelisted deal projection (never called with owner-private fields — the
// server already stripped them).
export function buildSharedDealHTML(deal) {
  const d = deal.data || {};
  const badgeCls = ['hot', 'warm', 'pass'].includes(deal.cls) ? deal.cls : 'warm';
  const typeLabel = deal.type === 'flip' ? 'Fix & Flip'
    : deal.type === 'ltr' ? 'Long-Term Rental' : deal.type === 'brrr' ? 'BRRR' : 'Short-Term Rental';

  const rows = deal.type === 'flip' ? [
    ['Asking price', money(d.ask)],
    ['After Repair Value (ARV)', money(d.arv)],
    ['Repair budget', d.rep != null ? money(d.rep) + (d.self ? ' (self-perform)' : '') : '—'],
    ['Hold period', d.hold ? d.hold + ' months' : '—'],
    ['Buying costs / Selling costs', (d.cc1 ?? '?') + '% / ' + (d.cc2 ?? '?') + '%'],
    ['Carrying cost/mo', money(d.carry)],
    ['Net profit (est.)', money(d.profit)],
    ['Cash-on-Cash ROI (est.)', perc(d.roi)],
    ['Max offer', money(d.maxOffer)],
    ['Total project cost incl. selling costs (est.)',
      (d.totalIn != null && d.sellCost != null) ? fmt(d.totalIn + d.sellCost) : '—'],
  ] : [
    // Non-flip types share the compact headline set the pipeline card shows.
    ['Price', money(d.price)],
    ...(d.dscr != null ? [['DSCR (est.)', Number(d.dscr).toFixed(2)]] : []),
    ...(d.coc  != null ? [['Cash-on-cash (est.)', perc(d.coc)]] : []),
    ...(d.cashFlowMo != null ? [['Cash flow (est.)', money(d.cashFlowMo) + '/mo']] : []),
    ...(d.cashflow   != null ? [['Cash flow (est.)', money(d.cashflow) + '/yr']] : []),
  ];

  const stats = Array.isArray(deal.stats) && deal.stats.length
    ? `<div class="deal-stats" style="margin:10px 0 2px">${deal.stats.map(s =>
        `<div class="deal-stat"><div class="dsl">${escapeHtml(String(s.l ?? ''))}</div><div class="dsv">${escapeHtml(String(s.v ?? ''))}</div></div>`).join('')}</div>`
    : '';

  return `
    <div class="shared-tag">Shared deal — read-only</div>
    <div class="shared-card">
      <div class="shared-name">${escapeHtml(String(deal.name ?? 'Deal'))}</div>
      <div class="shared-sub">${typeLabel}${d.addr ? ' · ' + escapeHtml(String(d.addr)) : ''}${deal.marketLabel ? ' · ' + escapeHtml(String(deal.marketLabel)) : ''}</div>
      <div class="deal-badge ${badgeCls}" style="display:inline-block">${escapeHtml(String(deal.verdict ?? ''))}</div>
      ${stats}
      <div class="detail-section" style="margin-top:12px">
        ${rows.map(([l, v]) => `<div class="detail-row"><span class="dl">${l}</span><span class="dv">${v}</span></div>`).join('')}
      </div>
      <div class="shared-sub" style="margin:10px 0 0">Saved ${escapeHtml(String(deal.date ?? ''))}${deal.updated ? ' · Updated ' + escapeHtml(String(deal.updated)) : ''}</div>
    </div>
    <a class="shared-cta" href="index.html">Analyze your own deals free with DealFit</a>
  `;
}

async function load() {
  const loading = document.getElementById('shared-loading');
  const missing = document.getElementById('shared-missing');
  const content = document.getElementById('shared-content');
  const token = new URLSearchParams(location.search).get('d') || '';
  const fail = () => { loading.style.display = 'none'; missing.style.display = 'block'; };
  if (!/^[0-9a-f]{32}$/.test(token)) { fail(); return; }
  try {
    const { data, error } = await supabase.rpc('get_shared_deal', { p_token: token });
    if (error || !data || !data.ok || !data.deal) { fail(); return; }
    content.innerHTML = buildSharedDealHTML(data.deal);
    loading.style.display = 'none';
    content.style.display = 'block';
  } catch { fail(); }
}

if (typeof document !== 'undefined' && document.getElementById('shared-loading')) load();
