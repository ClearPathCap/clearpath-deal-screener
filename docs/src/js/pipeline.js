// ─── Pipeline: saved deals, render, expand, filter, delete ───────────────────

import { fmt, pct, escapeHtml } from './format.js';
import { getDeals, saveDeals, PIPELINE_ALLOWANCE } from './storage.js';
import { isSignedIn } from './auth.js';
import { getLastFlipResult } from './flip.js';
import { getLastRentalResult } from './rental.js';
import { getLastLtrResult } from './ltr.js';
import { getLastBrrrResult } from './brrr.js';
import { getPipelineFundingButtonHTML } from './clearpath.js';
import { getActiveTier } from './tiers.js';
import { resultInsuranceStatus, resultTaxStatus, pendingPresentationFor } from './insuranceReadiness.js';

// Local modal helpers — avoids circular dep with main.js
const openModal  = id => document.getElementById(id).classList.add('active');
const closeModal = id => document.getElementById(id).classList.remove('active');

let pipelineFilter = 'all';
let pendingDeleteId = null;

// ─── Save ─────────────────────────────────────────────────────────────────────

// Wave A1 save outcome contract: resolves to {status} where status is exactly one
// of refused-auth | refused-name | refused-result | refused-cap | refused-busy |
// saved | save-failed (save-failed adds failureClass:'auth'|'other'). Success
// feedback fires ONLY after the durable server write confirms (await-then-commit).
export async function saveDeal(type) {
  // Pipeline requires a free account (Option A) — anonymous users can analyze a
  // deal and request funding, but SAVING prompts sign-in / account creation.
  if (!isSignedIn()) {
    window.showToast && window.showToast('Create a free account to save deals');
    window.openUpgrade && window.openUpgrade('save');
    return { status: 'refused-auth' };
  }

  const nameId  = type + '-deal-name';
  const notesId = type + '-notes';
  const name    = document.getElementById(nameId).value.trim();
  if (!name) { alert('Give this deal a name first.'); return { status: 'refused-name' }; }

  const result = type === 'flip' ? getLastFlipResult()
    : type === 'ltr'  ? getLastLtrResult()
    : type === 'brrr' ? getLastBrrrResult()
    : getLastRentalResult();
  if (!result) { alert('Analyze the deal first, then save.'); return { status: 'refused-result' }; }

  // Wave 5 (§18-1): capacity is a UNIFORM allowance on every tier — an
  // anti-abuse bound, never a paid differentiator. Tier-blind by design.
  const deals = getDeals();
  if (deals.length >= PIPELINE_ALLOWANCE) {
    window.showToast && window.showToast(`Your pipeline is full (${PIPELINE_ALLOWANCE} deals) — delete a deal you're done with to save a new one`, 4200);
    return { status: 'refused-cap' };
  }

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
    stats:   buildDealStats(type, result),
  };

  // Immutable candidate — the cache is committed by storage only on RPC success.
  const res = await saveDeals([deal, ...deals]);

  if (res.ok) {
    // Keep fields intact — only show brief confirmation (Section 5g)
    window.showToast && window.showToast('Deal saved to pipeline');
    return { status: 'saved' };
  }
  if (res.reason === 'busy') {
    window.showToast && window.showToast('Another pipeline update is in progress.');
    return { status: 'refused-busy' };
  }
  if (res.reason === 'auth') {
    window.showToast && window.showToast('Your session has expired — sign in again to save this deal.', 4200);
    window.openUpgrade && window.openUpgrade('save');
    return { status: 'save-failed', failureClass: 'auth' };
  }
  window.showToast && window.showToast("Couldn't save this deal — connection or server problem. Try again.", 4200);
  return { status: 'save-failed', failureClass: 'other' };
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

// Wave A1 delete outcome contract: resolves to {status} where status is exactly
// one of refused-auth | refused-busy | deleted | delete-failed (delete-failed adds
// failureClass:'auth'|'other'). The row stays visible until persistence succeeds —
// a failed delete never removes it optimistically.
export async function confirmDelete() {
  // Entry auth gate (defense in depth — the signed-out UI can't reach this).
  if (!isSignedIn()) {
    pendingDeleteId = null;
    closeModal('modal-delete');
    window.showToast && window.showToast('Sign in to update your pipeline');
    window.openUpgrade && window.openUpgrade('save');
    return { status: 'refused-auth' };
  }
  // No pending delete = stale/duplicate invocation of an already-settled request.
  if (pendingDeleteId == null) return { status: 'refused-busy' };

  const candidate = getDeals().filter(d => d.id !== pendingDeleteId);
  const res = await saveDeals(candidate);

  if (res.ok) {
    pendingDeleteId = null;
    closeModal('modal-delete');
    renderPipeline();
    window.showToast && window.showToast('Deal deleted');
    return { status: 'deleted' };
  }
  if (res.reason === 'busy') {
    // Keep the row AND the pending id so the user can retry once the lock clears.
    window.showToast && window.showToast('Another pipeline update is in progress.');
    return { status: 'refused-busy' };
  }
  pendingDeleteId = null;
  closeModal('modal-delete');
  if (res.reason === 'auth') {
    window.showToast && window.showToast('Your session has expired — sign in again to update your pipeline.', 4200);
    window.openUpgrade && window.openUpgrade('save');
    return { status: 'delete-failed', failureClass: 'auth' };
  }
  window.showToast && window.showToast("Couldn't delete this deal — connection or server problem. It's still in your pipeline.", 4200);
  return { status: 'delete-failed', failureClass: 'other' };
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
  const list = document.getElementById('pipeline-list');

  // Pipeline is account-scoped (Option A): signed-out users see a sign-in prompt,
  // not a deal list. Analyzing deals and Get Funding stay login-free elsewhere.
  if (!isSignedIn()) {
    list.innerHTML = `<div class="empty-state"><div class="ei">🔒</div><p>Your pipeline lives with your free account.<br>Sign in or create one to save deals and<br>track them across all your devices.</p><button class="btn-redeem" style="margin-top:14px" onclick="openUpgrade('save')">Sign in / Create free account</button></div>`;
    return;
  }

  let deals = getDeals();
  if (pipelineFilter === 'flip')   deals = deals.filter(d => d.type === 'flip');
  else if (pipelineFilter === 'rental') deals = deals.filter(d => d.type === 'rental');
  else if (pipelineFilter === 'hot')    deals = deals.filter(d => d.cls === 'hot');

  if (!deals.length) {
    list.innerHTML = `<div class="empty-state"><div class="ei">📋</div><p>No deals saved yet.<br>Analyze a property and hit Save<br>to build your pipeline.</p></div>`;
    return;
  }
  list.innerHTML = deals.map(d => buildDealCard(d)).join('');
}

function dealRegionLabel(type) {
  return type === 'flip' ? 'Fix & Flip'
    : type === 'ltr'  ? 'Long-Term Rental'
    : type === 'brrr' ? 'BRRR'
    : 'Short-Term Rental';
}

// Card stat row (3 headline metrics) per analyzer type.
function buildDealStats(type, r) {
  if (type === 'flip') return [
    { l: 'Profit', v: fmt(r.profit) },
    // P2-2: this figure is the cash-on-cash return, not a generic ROI. Adopts the
    // label the results screen already uses in Guide mode (flip.js). The value and
    // the formula behind it are untouched — only the word changes.
    { l: 'Cash-on-Cash ROI', v: pct(r.roi) },
    { l: r.ltvLabel || 'LTV', v: pct(r.ltv) },
  ];
  if (type === 'ltr') return [
    { l: 'DSCR',      v: r.dscr != null ? r.dscr.toFixed(2) : 'n/a' },
    { l: 'CoC',       v: pct(r.coc) },
    { l: 'Cash Flow', v: fmt(r.cashFlowMo) },
  ];
  if (type === 'brrr') return [
    { l: 'DSCR',      v: r.dscr != null ? r.dscr.toFixed(2) : 'n/a' },
    { l: 'Cap Left',  v: fmt(r.capitalLeft) },
    { l: 'Recovered', v: pct(r.cashRecoveredPct) },
  ];
  return [
    { l: 'CoC',       v: pct(r.coc) },
    { l: 'Cap',       v: pct(r.capRate) },
    { l: 'Cash Flow', v: fmt(r.cashflow) },
  ];
}

// Phase A: render-time Pending overlay for saved LTR/BRRR deals with unresolved
// insurance ('missing' or 'explicit_zero'). Cards bake verdict/cls/stats at SAVE
// time, so gating must happen at render — this also covers legacy saved deals
// (resultInsuranceStatus falls back on insMissing / coerced ins:0).
function unresolvedInsPresentation(type, data) {
  const insSt = resultInsuranceStatus(data || {});
  const tSt = resultTaxStatus(data || {}); // F-5/F-6: blank expenses pend saved cards too
  return pendingPresentationFor(type, tSt, insSt);
}

// Pending card stats when insurance is unresolved. Every LTR headline stat
// (DSCR/CoC/Cash Flow) is insurance-dependent; BRRR keeps its refi-math stats
// (Cap Left / Recovered) and pends only DSCR.
function pendingDealStats(d) {
  if (d.type === 'ltr') return [
    { l: 'DSCR', v: 'Pending' }, { l: 'CoC', v: 'Pending' }, { l: 'Cash Flow', v: 'Pending' },
  ];
  if (d.type === 'rental') return [ // F-6: CoC/Cap/Cash Flow are all expense-dependent
    { l: 'CoC', v: 'Pending' }, { l: 'Cap', v: 'Pending' }, { l: 'Cash Flow', v: 'Pending' },
  ];
  return [
    { l: 'DSCR', v: 'Pending' },
    ...(Array.isArray(d.stats) ? d.stats.slice(1) : []),
  ];
}

function detailSection(title, rows) {
  return `<div class="detail-section"><div class="detail-title">${title}</div>${
    rows.filter(Boolean).map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv">${r.v}</span></div>`).join('')
  }</div>`;
}

function buildLtrDetail(d) {
  const pend = unresolvedInsPresentation('ltr', d) != null;
  return detailSection('Long-Term Rental (DSCR)', [
    { l: 'Purchase price',    v: d.price != null ? fmt(d.price) : '—' },
    { l: 'Monthly rent',      v: d.rent != null ? fmt(d.rent) : '—' },
    { l: 'Down payment',      v: d.down != null ? d.down + '%' : '—' },
    { l: 'NOI',               v: pend ? 'Pending' : (d.NOI != null ? fmt(d.NOI) : '—') },
    { l: 'DSCR',              v: pend ? 'Pending' : (d.dscr != null ? d.dscr.toFixed(2) : 'n/a') },
    { l: 'Cap rate',          v: pend ? 'Pending' : (d.capRate != null ? pct(d.capRate) : '—') },
    { l: 'Cash-on-cash',      v: pend ? 'Pending' : (d.coc != null ? pct(d.coc) : '—') },
    { l: 'Monthly cash flow', v: pend ? 'Pending' : (d.cashFlowMo != null ? fmt(d.cashFlowMo) : '—') },
    { l: 'Loan / LTV',        v: (d.loan != null ? fmt(d.loan) : '—') + (d.ltv != null ? ' · ' + pct(d.ltv) : '') },
    { l: 'Cash to close',     v: d.cashToClose != null ? fmt(d.cashToClose) : '—' },
  ]);
}

function buildBrrrDetail(d) {
  return detailSection('BRRR (Bridge → DSCR Refi)', [
    { l: 'Purchase price',            v: d.price != null ? fmt(d.price) : '—' },
    { l: 'Rehab (incl. contingency)', v: d.rehabTotal != null ? fmt(d.rehabTotal) : '—' },
    { l: 'ARV',                       v: d.arv != null ? fmt(d.arv) : '—' },
    { l: 'All-in cost',               v: d.allInCost != null ? fmt(d.allInCost) : '—' },
    { l: 'Refi loan',                 v: d.refiLoan != null ? fmt(d.refiLoan) : '—' },
    { l: 'Cash out',                  v: d.cashOut != null ? fmt(d.cashOut) : '—' },
    { l: 'Capital left',              v: d.capitalLeft != null ? fmt(d.capitalLeft) : '—' },
    { l: 'Cash recovered',            v: d.cashRecoveredPct != null ? pct(d.cashRecoveredPct) : '—' },
    { l: 'DSCR',                      v: unresolvedInsPresentation('brrr', d) ? 'Pending' : (d.dscr != null ? d.dscr.toFixed(2) : 'n/a') },
    { l: 'Monthly cash flow',         v: unresolvedInsPresentation('brrr', d) ? 'Pending' : (d.cashFlowMo != null ? fmt(d.cashFlowMo) : '—') },
  ]);
}

function buildDealCard(d) {
  const data       = d.data || {};
  // Phase A: unresolved-insurance overlay for the stored badge/stats (LTR/BRRR only).
  const insP       = unresolvedInsPresentation(d.type, data);
  const cardStats  = insP ? pendingDealStats(d) : d.stats;
  const address    = data.addr ? `<div class="deal-address">${escapeHtml(data.addr)}</div>` : '';
  const detailRows = d.type === 'flip' ? buildFlipDetail(data)
    : d.type === 'ltr'  ? buildLtrDetail(data)
    : d.type === 'brrr' ? buildBrrrDetail(data)
    : buildRentalDetail(data);
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
            <div class="deal-region">${dealRegionLabel(d.type)}</div>
          </div>
          <div class="deal-badge ${insP ? 'warm' : d.cls}">${insP ? insP.tag : d.verdict}</div>
        </div>
        <div class="deal-stats">
          ${cardStats.map(s => `<div class="deal-stat"><div class="dsl">${s.l}</div><div class="dsv">${s.v}</div></div>`).join('')}
        </div>
        <div class="deal-footer">
          <div class="deal-date">Saved ${d.date}</div>
          <button class="card-delete-btn" onclick="event.stopPropagation();requestDelete(${d.id},event)" title="Delete deal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
        <svg class="expand-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="deal-detail">
        ${detailRows}
        ${notesBlock}
        ${getPipelineFundingButtonHTML(d)}
        <div class="detail-actions">
          ${(getActiveTier() === 'investor' || getActiveTier() === 'pro')
            ? `<button class="btn-action" onclick="event.stopPropagation();shareDeal(${d.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            Share
          </button>`
            : `<button class="btn-action" onclick="event.stopPropagation();openUpgrade('general')" title="Deal sharing is an Investor feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Share · Investor
          </button>`}
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
    { l: 'Purchase costs / Sale costs', v: (d.cc1 || '?') + '% / ' + (d.cc2 || '?') + '%' },
    { l: 'Carrying cost/mo',       v: d.carry != null ? fmt(d.carry) : '—' },
    { l: 'Square footage',         v: d.sqft  ? d.sqft.toLocaleString() + ' sqft' : '—' },
  ];
  const metrics = [
    { l: 'Net profit',             v: d.profit   != null ? fmt(d.profit)   : '—' },
    // P2-2: same figure, same formula — named precisely on the expanded surface too.
    { l: 'Cash-on-Cash ROI',       v: d.roi      != null ? pct(d.roi)      : '—' },
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
  const pend = unresolvedInsPresentation('rental', d) != null; // F-6: blank taxes+insurance pends
  const rows = [
    { l: 'Purchase price',         v: d.price   != null ? fmt(d.price)  : '—' },
    { l: 'Down payment',           v: d.down    ? d.down + '%'          : '—' },
    { l: 'Gross annual rent',      v: d.rent    != null ? fmt(d.rent)   : '—' },
    { l: 'Occupancy',              v: d.occ     != null ? d.occ + '%'   : '—' },
    { l: 'Platform fee (Airbnb/VRBO)', v: d.mgmt  != null ? d.mgmt + '%'  : '—' },
    { l: 'Property manager',       v: d.pm      != null ? d.pm + '%'    : '—' },
    { l: 'Taxes + insurance',      v: pend ? 'Pending' : (d.tax != null ? fmt(d.tax) : '—') },
    { l: 'Maintenance',            v: d.maint   != null ? fmt(d.maint)  : '—' },
    { l: 'Furnishing (one-time)',  v: d.furnish != null ? fmt(d.furnish): '—' },
  ];
  const metrics = [
    { l: 'NOI',                    v: pend ? 'Pending' : (d.noi      != null ? fmt(d.noi)      : '—') },
    { l: 'Cap rate',               v: pend ? 'Pending' : (d.capRate  != null ? pct(d.capRate)  : '—') },
    { l: 'Annual debt service',    v: d.debt     != null ? fmt(d.debt)     : '—' },
    { l: 'Annual cash flow',       v: pend ? 'Pending' : (d.cashflow != null ? fmt(d.cashflow) : '—') },
    { l: 'Cash-on-cash',           v: pend ? 'Pending' : (d.coc      != null ? pct(d.coc)      : '—') },
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
