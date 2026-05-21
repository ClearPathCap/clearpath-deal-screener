// ─── Pipeline: saved deals, render, expand, filter, delete ───────────────────

import { fmt, pct, escapeHtml } from './format.js';
import { getDeals, saveDeals } from './storage.js';
import { getLastFlipResult } from './flip.js';
import { getLastRentalResult } from './rental.js';

// Local modal helpers — avoids circular dep with main.js
const openModal  = id => document.getElementById(id).classList.add('active');
const closeModal = id => document.getElementById(id).classList.remove('active');

let pipelineFilter = 'all';
let pendingDeleteId = null;

// ─── Save ─────────────────────────────────────────────────────────────────────

export function saveDeal(type) {
  const nameId  = type + '-deal-name';
  const notesId = type + '-notes';
  const name    = document.getElementById(nameId).value.trim();
  if (!name) { alert('Give this deal a name first.'); return; }

  const result = type === 'flip' ? getLastFlipResult() : getLastRentalResult();
  if (!result) { alert('Analyze the deal first, then save.'); return; }

  const notes = document.getElementById(notesId).value.trim();
  const deal  = {
    id:      Date.now(),
    name,
    type,
    verdict: result.verdict,
    cls:     result.cls,
    notes,
    date:    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    data:    result,
    stats:   type === 'flip'
      ? [
          { l: 'Profit', v: fmt(result.profit) },
          { l: 'ROI',    v: pct(result.roi) },
          { l: 'LTV',    v: pct(result.ltv) },
        ]
      : [
          { l: 'CoC',        v: pct(result.coc) },
          { l: 'Cap',        v: pct(result.capRate) },
          { l: 'Cash Flow',  v: fmt(result.cashflow) },
        ],
  };

  const deals = getDeals();
  deals.unshift(deal);
  saveDeals(deals);

  const confirm = document.getElementById(type + '-save-confirm');
  confirm.style.display = 'block';
  setTimeout(() => { confirm.style.display = 'none'; }, 2500);
  document.getElementById(nameId).value  = '';
  document.getElementById(notesId).value = '';
  window.showToast && window.showToast('Deal saved to pipeline');
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function requestDelete(id, e) {
  if (e) e.stopPropagation();
  pendingDeleteId = id;
  const deal = getDeals().find(d => d.id === id);
  if (deal) {
    document.getElementById('delete-deal-text').textContent =
      'You\'re about to permanently delete "' + deal.name + '". This cannot be undone.';
  }
  openModal('modal-delete');
}

export function confirmDelete() {
  if (pendingDeleteId == null) return;
  const deals = getDeals().filter(d => d.id !== pendingDeleteId);
  saveDeals(deals);
  pendingDeleteId = null;
  closeModal('modal-delete');
  renderPipeline();
  window.showToast && window.showToast('Deal deleted');
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export function filterPipeline(f, el) {
  pipelineFilter = f;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderPipeline();
}

// ─── Toggle expand/collapse ───────────────────────────────────────────────────

export function toggleDeal(id) {
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  if (!card) return;
  card.classList.toggle('expanded');
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderPipeline() {
  let deals = getDeals();
  if (pipelineFilter === 'flip')   deals = deals.filter(d => d.type === 'flip');
  else if (pipelineFilter === 'rental') deals = deals.filter(d => d.type === 'rental');
  else if (pipelineFilter === 'hot')    deals = deals.filter(d => d.cls === 'hot');

  const list = document.getElementById('pipeline-list');
  if (!deals.length) {
    list.innerHTML = `<div class="empty-state"><div class="ei">📋</div><p>No deals saved yet.<br>Analyze a property and hit Save<br>to build your pipeline.</p></div>`;
    return;
  }
  list.innerHTML = deals.map(d => buildDealCard(d)).join('');
}

function buildDealCard(d) {
  const data       = d.data || {};
  const address    = data.addr ? `<div class="deal-address">${escapeHtml(data.addr)}</div>` : '';
  const detailRows = d.type === 'flip' ? buildFlipDetail(data) : buildRentalDetail(data);
  const notesBlock = d.notes
    ? `<div class="detail-section"><div class="detail-title">Notes</div><div class="detail-notes">${escapeHtml(d.notes)}</div></div>`
    : '';

  return `
    <div class="deal-card" data-id="${d.id}">
      <div class="deal-header" onclick="toggleDeal(${d.id})">
        <div class="deal-card-top">
          <div style="flex:1;min-width:0">
            <div class="deal-name">${escapeHtml(d.name)}</div>
            ${address}
            <div class="deal-region">${d.type === 'flip' ? 'Fix & Flip' : 'Short-Term Rental'}</div>
          </div>
          <div class="deal-badge ${d.cls}">${d.verdict}</div>
        </div>
        <div class="deal-stats">
          ${d.stats.map(s => `<div class="deal-stat"><div class="dsl">${s.l}</div><div class="dsv">${s.v}</div></div>`).join('')}
        </div>
        <div class="deal-date">Saved ${d.date}</div>
        <svg class="expand-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="deal-detail">
        ${detailRows}
        ${notesBlock}
        <div class="detail-actions">
          <button class="btn-action" onclick="event.stopPropagation();shareDeal(${d.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a3 3 0 1 0-2.83-4M6 12a3 3 0 1 0 0 0M18 20a3 3 0 1 0-2.83-4M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
            Share
          </button>
          <button class="btn-action danger" onclick="requestDelete(${d.id}, event)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildFlipDetail(d) {
  const rows = [
    { l: 'Asking price',           v: d.ask  != null ? fmt(d.ask)  : '—' },
    { l: 'After Repair Value (ARV)', v: d.arv != null ? fmt(d.arv)  : '—' },
    { l: 'Repair budget',          v: d.rep  != null ? fmt(d.rep) + (d.self ? ' (self-perform)' : '') : '—' },
    { l: 'Hold period',            v: d.hold ? d.hold + ' months' : '—' },
    { l: 'Buy / sell closing',     v: (d.cc1 || '?') + '% / ' + (d.cc2 || '?') + '%' },
    { l: 'Carrying cost/mo',       v: d.carry != null ? fmt(d.carry) : '—' },
    { l: 'Square footage',         v: d.sqft  ? d.sqft.toLocaleString() + ' sqft' : '—' },
  ];
  const metrics = [
    { l: 'Net profit',             v: d.profit   != null ? fmt(d.profit)   : '—' },
    { l: 'ROI',                    v: d.roi      != null ? pct(d.roi)      : '—' },
    { l: 'Max offer (your number)',v: d.maxOffer != null ? fmt(d.maxOffer) : '—' },
    { l: 'LTV at asking',          v: d.ltv      != null ? pct(d.ltv)      : '—' },
    { l: 'Total all-in',           v: (d.totalIn != null && d.sellCost != null) ? fmt(d.totalIn + d.sellCost) : '—' },
  ];
  return `
    <div class="detail-section">
      <div class="detail-title">Property &amp; Inputs</div>
      ${rows.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv">${r.v}</span></div>`).join('')}
    </div>
    <div class="detail-section">
      <div class="detail-title">Key Numbers</div>
      ${metrics.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv">${r.v}</span></div>`).join('')}
    </div>
  `;
}

function buildRentalDetail(d) {
  const rows = [
    { l: 'Purchase price',         v: d.price   != null ? fmt(d.price)  : '—' },
    { l: 'Down payment',           v: d.down    ? d.down + '%'          : '—' },
    { l: 'Gross annual rent',      v: d.rent    != null ? fmt(d.rent)   : '—' },
    { l: 'Occupancy',              v: d.occ     != null ? d.occ + '%'   : '—' },
    { l: 'STR mgmt fee',           v: d.mgmt    != null ? d.mgmt + '%'  : '—' },
    { l: 'Property manager',       v: d.pm      != null ? d.pm + '%'    : '—' },
    { l: 'Taxes + insurance',      v: d.tax     != null ? fmt(d.tax)    : '—' },
    { l: 'Maintenance',            v: d.maint   != null ? fmt(d.maint)  : '—' },
    { l: 'Furnishing (one-time)',  v: d.furnish != null ? fmt(d.furnish): '—' },
  ];
  const metrics = [
    { l: 'NOI',                    v: d.noi      != null ? fmt(d.noi)      : '—' },
    { l: 'Cap rate',               v: d.capRate  != null ? pct(d.capRate)  : '—' },
    { l: 'Annual debt service',    v: d.debt     != null ? fmt(d.debt)     : '—' },
    { l: 'Annual cash flow',       v: d.cashflow != null ? fmt(d.cashflow) : '—' },
    { l: 'Cash-on-cash',           v: d.coc      != null ? pct(d.coc)      : '—' },
    { l: 'Total cash in',          v: d.downAmt  != null ? fmt(d.downAmt)  : '—' },
    { l: 'Gross rent multiplier',  v: d.grm      != null ? d.grm + 'x'    : '—' },
  ];
  return `
    <div class="detail-section">
      <div class="detail-title">Property &amp; Inputs</div>
      ${rows.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv">${r.v}</span></div>`).join('')}
    </div>
    <div class="detail-section">
      <div class="detail-title">Key Numbers</div>
      ${metrics.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv">${r.v}</span></div>`).join('')}
    </div>
  `;
}
