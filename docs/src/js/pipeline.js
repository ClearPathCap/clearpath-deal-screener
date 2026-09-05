// ─── Pipeline: saved deals, render, expand, filter, delete ───────────────────

import { fmt, pct, escapeHtml, parseComma } from './format.js';
import { getDeals, saveDeals, hydratePipeline, PIPELINE_ALLOWANCE } from './storage.js';
import { isSignedIn } from './auth.js';
import { getLastFlipResult, getFlipMarket } from './flip.js';
import { repairEstimateSnapshotFor } from './repair.js';
import { getLastRentalResult } from './rental.js';
import { getLastLtrResult } from './ltr.js';
import { getLastBrrrResult } from './brrr.js';
import { getPipelineFundingButtonHTML } from './clearpath.js';
import { getActiveTier, getActiveMarketId, getMarketLabel } from './tiers.js';
import { ALL_MARKETS } from './markets.js';
import { resultInsuranceStatus, resultTaxStatus, pendingPresentationFor } from './insuranceReadiness.js';
import { computeFlip, computeFlipStress, flipVerdict, validateInputs, flipProfitClass,
         flipNegotiationGuidance } from './finance.js';

// Local modal helpers — avoids circular dep with main.js
// Track A2: modals must go through the central lock-aware helpers (body
// scroll-lock + restore + scroll reset). window.openModal is published by
// main.js; the bare-class fallback keeps Node test harnesses working.
const openModal  = id => (window.openModal  || (i => document.getElementById(i).classList.add('active')))(id);
const closeModal = id => (window.closeModal || (i => document.getElementById(i).classList.remove('active')))(id);

let pipelineFilter = 'all';
let pendingDeleteId = null;

// ─── Save ─────────────────────────────────────────────────────────────────────

// Wave A1 save outcome contract: resolves to {status} where status is exactly one
// of refused-auth | refused-name | refused-result | refused-cap | refused-busy |
// saved | save-failed (save-failed adds failureClass:'auth'|'stale'|'other' —
// 'stale' is the UX-wave silent-wipe guard: hydration unproven, nothing written,
// recover by rehydrate + retry). Success
// feedback fires ONLY after the durable server write confirms (await-then-commit).
// ─── Saved-deal review (owner law 2026-09-05) ────────────────────────────────
// A saved deal is a historical analysis snapshot. Code updates never rewrite
// it; the user may explicitly review and re-analyze it with current DealFit,
// and nothing persisted changes until the user taps "Update Saved Deal". This
// module holds only the pending-review identity — the analyzer prefill, the
// protection of prefilled values, and the banner are DOM glue in main.js.
// While a review is pending, saveDeal() replaces THAT record in place.
let reviewingDealId = null;
export function getReviewingDealId() { return reviewingDealId; }
export function beginDealReview(id) {
  const deal = getDeals().find(d => d.id === id);
  if (!deal) return null;
  reviewingDealId = id;
  return deal;
}
export function endDealReview() { reviewingDealId = null; }
// main.js registers the UI exit here so a delete of the reviewed deal ends the
// review everywhere (pipeline.js owns persistence, not the analyzer DOM).
let reviewEndedHook = null;
export function onDealReviewEnded(fn) { reviewEndedHook = fn; }

// Compact "why does this saved result have these numbers" line for the
// EXPANDED card only — the analyzer's materially important RAW inputs, never
// derived outputs. The collapsed card stays as it is.
function savedInputsLine(d) {
  const x = d.data || {};
  const money = (v) => (v != null && Number.isFinite(+v)) ? fmt(+v) : null;
  const pctOf = (v) => (v != null && Number.isFinite(+v)) ? (+v) + '%' : null;
  let parts;
  if (d.type === 'ltr') {
    parts = [money(x.rent) && 'Rent ' + money(x.rent) + '/mo', pctOf(x.vac) && 'Vacancy ' + pctOf(x.vac),
             pctOf(x.down) && 'Down ' + pctOf(x.down), (+x.units > 1) && (+x.units) + ' units',
             (+x.util > 0) && 'Utilities ' + money(x.util) + '/yr'];
  } else if (d.type === 'brrr') {
    parts = [money(x.price) && 'Price ' + money(x.price), money(x.rehab) && 'Rehab ' + money(x.rehab),
             money(x.arv) && 'ARV ' + money(x.arv), money(x.rent) && 'Rent ' + money(x.rent) + '/mo', pctOf(x.vac) && 'Vacancy ' + pctOf(x.vac),
             (+x.util > 0) && 'Utilities ' + money(x.util) + '/yr'];
  } else if (d.type === 'rental') {
    parts = [money(x.rent) && 'Rent ' + money(x.rent) + '/yr', pctOf(x.occ) && 'Occupancy ' + pctOf(x.occ), pctOf(x.down) && 'Down ' + pctOf(x.down),
             (+x.util > 0) && 'Utilities ' + money(x.util) + '/yr'];
  } else {
    parts = [money(x.ask) && 'Ask ' + money(x.ask), money(x.arv) && 'ARV ' + money(x.arv),
             money(x.rep) && 'Repairs ' + money(x.rep), (+x.hold > 0) && (+x.hold) + ' mo hold'];
  }
  parts = parts.filter(Boolean);
  if (!parts.length) return '';
  return `<div class="saved-inputs"><span class="si-label">Saved inputs</span><span class="si-values">${parts.join(' · ')}</span></div>`;
}

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

  const deals = getDeals();
  const notes = document.getElementById(notesId).value.trim();
  let candidate, onOk;
  // Saved-deal review law (2026-09-05): while this analyzer is reviewing a saved
  // deal, Save means "Update Saved Deal" — replace THAT record in place: same id,
  // provenance kept (date / savedAt / market stamp), name + notes from the form,
  // the reviewed raw inputs + fresh derived outputs, updated stamps. No
  // duplicate, and nothing else in the pipeline moves.
  const reviewing = reviewingDealId != null ? deals.find(d => d.id === reviewingDealId) : null;
  if (reviewing && reviewing.type === type) {
    const now = new Date();
    const updatedDeal = {
      ...reviewing, name, notes,
      verdict: result.verdict, cls: result.cls,
      data: result, stats: buildDealStats(type, result),
      updatedAt: now.toISOString(),
      updated:   now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    candidate = deals.map(x => x.id === reviewing.id ? updatedDeal : x);
    onOk = () => {
      // Only THIS review ends — a newer review started while the RPC was in
      // flight keeps its pending state.
      if (reviewingDealId === reviewing.id) reviewingDealId = null;
      window.showToast && window.showToast('Saved deal updated');
      return { status: 'saved', mode: 'updated', id: reviewing.id };
    };
  } else {
    // Wave 5 (§18-1): capacity is a UNIFORM allowance on every tier — an
    // anti-abuse bound, never a paid differentiator. Tier-blind by design.
    if (deals.length >= PIPELINE_ALLOWANCE) {
      window.showToast && window.showToast(`Your pipeline is full (${PIPELINE_ALLOWANCE} deals) — delete a deal you're done with to save a new one`, 4200);
      return { status: 'refused-cap' };
    }
    // UX wave finding 3 (retention rule): stamp the market this deal was
    // underwritten against AT SAVE TIME. The user's active region can change later
    // (or sync in from another device) without rewriting what this analysis meant.
    // Additive fields — legacy deals without them render fine.
    const marketId = getActiveMarketId();
    const deal  = {
      id:      Date.now(),
      name,
      type,
      verdict: result.verdict,
      cls:     result.cls,
      notes,
      date:    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      savedAt: new Date().toISOString(),
      market:      marketId || null,
      marketLabel: marketId ? getMarketLabel(marketId) : null,
      data:    result,
      stats:   buildDealStats(type, result),
    };
    candidate = [deal, ...deals];
    onOk = () => {
      // Keep fields intact — only show brief confirmation (Section 5g)
      window.showToast && window.showToast('Deal saved to pipeline');
      return { status: 'saved' };
    };
  }

  // Immutable candidate — the cache is committed by storage only on RPC success.
  const res = await saveDeals(candidate);

  if (res.ok) return onOk();
  if (res.reason === 'busy') {
    window.showToast && window.showToast('Another pipeline update is in progress.');
    return { status: 'refused-busy' };
  }
  if (res.reason === 'auth') {
    window.showToast && window.showToast('Your session has expired — sign in again to save this deal.', 4200);
    window.openUpgrade && window.openUpgrade('save');
    return { status: 'save-failed', failureClass: 'auth' };
  }
  if (res.reason === 'stale') {
    // Silent-wipe guard fired: the server was never heard this session, so a
    // wholesale replace could have erased real deals. Honest + recoverable:
    // nothing changed, a fresh hydrate is kicked off, the user just retries.
    window.showToast && window.showToast("Couldn't verify your saved pipeline with the server — nothing was changed. Retry in a moment.", 4200);
    hydratePipeline().then(() => renderPipeline()).catch(() => {});
    return { status: 'save-failed', failureClass: 'stale' };
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
// failureClass:'auth'|'stale'|'other'; 'stale' = silent-wipe guard, see saveDeal).
// The row stays visible until persistence succeeds —
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

  const doomed = getDeals().find(d => d.id === pendingDeleteId);
  const candidate = getDeals().filter(d => d.id !== pendingDeleteId);
  const res = await saveDeals(candidate);

  if (res.ok) {
    // Deleting the deal under review ends that review (nothing to update anymore).
    if (doomed && reviewingDealId === doomed.id) { reviewingDealId = null; if (reviewEndedHook) reviewEndedHook(doomed.type); }
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
  if (res.reason === 'stale') {
    window.showToast && window.showToast("Couldn't verify your saved pipeline with the server — nothing was deleted. Retry in a moment.", 4200);
    hydratePipeline().then(() => renderPipeline()).catch(() => {});
    return { status: 'delete-failed', failureClass: 'stale' };
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
    : type === 'brrr' ? 'BRRRR'
    : 'Short-Term Rental';
}

// Card stat row (3 headline metrics) per analyzer type.
function buildDealStats(type, r) {
  if (type === 'flip') return [
    // Track C: display-law class, scaled by the user's own Min Profit Target.
    { l: 'Profit', v: fmt(r.profit), cls: flipProfitClass(r.profit, r.target) },
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

function buildLtrDetail(d, deal) {
  const pend = unresolvedInsPresentation('ltr', d) != null;
  // Parity corrective: the same isolated guidance action the flip detail
  // carries — never while income is pending (the verdict itself is pending).
  const guide = (deal && !pend && d.price > 0)
    ? `<button class="whatif-link" onclick="event.stopPropagation();showMaxOfferScenario(${deal.id})">See what to dig into →</button>`
    : '';
  return guide + detailSection('Long-Term Rental (DSCR)', [
    { l: 'Purchase price',    v: d.price != null ? fmt(d.price) : '—' },
    { l: 'Monthly rent',      v: d.rent != null ? fmt(d.rent) : '—' },
    { l: 'Down payment',      v: d.down != null ? d.down + '%' : '—' },
    { l: 'Owner-paid utilities', v: fmt(d.util || 0) + '/yr' },
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
  return detailSection('BRRRR (Bridge → DSCR Refi)', [
    { l: 'Purchase price',            v: d.price != null ? fmt(d.price) : '—' },
    { l: 'Rehab (incl. contingency)', v: d.rehabTotal != null ? fmt(d.rehabTotal) : '—' },
    { l: 'ARV',                       v: d.arv != null ? fmt(d.arv) : '—' },
    { l: 'All-in cost',               v: d.allInCost != null ? fmt(d.allInCost) : '—' },
    { l: 'Refi loan',                 v: d.refiLoan != null ? fmt(d.refiLoan) : '—' },
    { l: 'Owner-paid utilities',      v: fmt(d.util || 0) + '/yr' },
    { l: 'Cash out',                  v: d.cashOut != null ? fmt(d.cashOut) : '—' },
    { l: 'Capital left',              v: d.capitalLeft != null ? fmt(d.capitalLeft) : '—' },
    { l: 'Cash recovered',            v: d.cashRecoveredPct != null ? pct(d.cashRecoveredPct) : '—' },
    { l: 'DSCR',                      v: unresolvedInsPresentation('brrr', d) ? 'Pending' : (d.dscr != null ? d.dscr.toFixed(2) : 'n/a') },
    { l: 'Monthly cash flow',         v: unresolvedInsPresentation('brrr', d) ? 'Pending' : (d.cashFlowMo != null ? fmt(d.cashFlowMo) : '—') },
  ]);
}

// ─── Render-time canonical verdict (stale-badge corrective) ──────────────────
// LIVE DEFECT: the badge printed the verdict STRING persisted at save time, so
// a deal saved before the guidance wave kept showing "Counter at Max Offer —
// Walk Away" while the negotiation modal (which derives fresh) already knew
// "Counter at $175K — Walk Above $185,750". The badge now re-derives the
// CURRENT verdict from the saved underwriting inputs through the same
// canonical chain the analyzer runs — computeFlip → computeFlipStress →
// flipNegotiationGuidance → flipVerdict — at render time. Nothing is written
// back to the record (stored text remains underwriting history); legacy or
// incomplete data falls back to the stored text unchanged. No second finance
// formula exists here. Exported for the Node suites.
export function liveFlipVerdict(data) {
  try {
    const eng = {
      ask: data.ask, arv: data.arv, rep: data.rep, hold: data.hold,
      cc1: (data.cc1 ?? 2) / 100, cc2: (data.cc2 ?? 5) / 100, carry: data.carry,
      loan: data.loan || 0, rate: data.rate ?? 0.10, points: data.points ?? 0.03,
      self: !!data.self, target: data.target,
    };
    if (![eng.ask, eng.arv, eng.rep, eng.hold, eng.carry].every(Number.isFinite)) return null;
    const nego = flipNegotiationGuidance(eng);
    if (!nego) return null;
    const e = computeFlip(eng);
    const s = computeFlipStress({ ...eng, financed: eng.loan > 0, target: nego.target });
    return flipVerdict({
      profit: e.profit, roi: e.roi, target: nego.target, maxOffer: e.maxOffer,
      marginOfSafety: s.marginOfSafety, stressedProfit: s.stressedProfit,
      self: eng.self, ask: eng.ask, nego,
    });
  } catch { return null; }
}

function buildDealCard(d) {
  const data       = d.data || {};
  // Phase A: unresolved-insurance overlay for the stored badge/stats (LTR/BRRR only).
  const insP       = unresolvedInsPresentation(d.type, data);
  // Stale-badge corrective: the ONE header badge (visible collapsed AND
  // expanded) shows the current canonical signal when derivable; the stored
  // verdict/cls remain the fallback and the persisted record is untouched.
  const live       = (d.type === 'flip' && !insP) ? liveFlipVerdict(data) : null;
  const badgeCls   = live ? live.cls : (insP ? 'warm' : d.cls);
  const badgeText  = live ? live.verdict : (insP ? insP.tag : d.verdict);
  const cardStats  = insP ? pendingDealStats(d) : d.stats;
  // Track C at render time: legacy deals have no baked class — derive it live
  // for flip cards (never while an insurance/tax pend overlay is active).
  const shownStats = (d.type === 'flip' && !insP && data.profit != null && cardStats.length)
    ? [{ ...cardStats[0], cls: flipProfitClass(data.profit, data.target) }, ...cardStats.slice(1)]
    : cardStats;
  const address    = data.addr ? `<div class="deal-address">${escapeHtml(data.addr)}</div>` : '';
  const detailRows = d.type === 'flip' ? buildFlipDetail(data, d)
    : d.type === 'ltr'  ? buildLtrDetail(data, d)
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
          ${((d.type === 'flip' && !insP && data.maxOffer > 0) || (d.type === 'ltr' && !insP && data.price > 0))
            /* LIVE DEFECT FIX: the verdict badge was an inert div inside the
               header's toggleDeal delegation, so tapping "COUNTER AT MAX
               OFFER" only expanded the card. A verdict with a governed
               guidance scenario is a real button: native Enter/Space
               activation, and stopPropagation so activation never reaches the
               card toggle. Parity corrective: LTR joins flip (DealFit
               Guidance); STR/BRRR have no guidance model yet and stay inert
               divs — a button that opens nothing would be worse. */
            ? `<button type="button" class="deal-badge ${badgeCls} badge-action" aria-haspopup="dialog"
                 title="${d.type === 'ltr' ? 'See what to dig into' : 'See this deal at DealFit&#8217;s max offer'}"
                 onclick="event.stopPropagation();showMaxOfferScenario(${d.id})">${badgeText}</button>`
            : `<div class="deal-badge ${badgeCls}">${badgeText}</div>`}
        </div>
        <div class="deal-stats">
          ${shownStats.map(s => `<div class="deal-stat"><div class="dsl">${s.l}</div><div class="dsv${s.cls ? ' ' + s.cls : ''}">${s.v}</div></div>`).join('')}
        </div>
        <div class="deal-footer">
          <div class="deal-date">Saved ${d.date}${d.updated ? ' · Updated ' + d.updated : ''}</div>
          <button class="card-delete-btn" onclick="event.stopPropagation();requestDelete(${d.id},event)" title="Delete deal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
        <svg class="expand-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="deal-detail">
        ${savedInputsLine(d)}
        ${detailRows}
        ${notesBlock}
        ${getPipelineFundingButtonHTML(d)}
        <div class="detail-actions review-row">
          <button class="btn-action" onclick="event.stopPropagation();reviewDeal(${d.id})" title="Prefill the analyzer with this deal's saved inputs">Review &amp; Re-analyze</button>
        </div>
        <div class="detail-actions">
          ${d.type === 'flip' ? `<button class="btn-action" onclick="event.stopPropagation();startDealEdit(${d.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            Edit
          </button>` : ''}
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

// ─── Edit-in-place (UX wave finding 1) ───────────────────────────────────────
// The Pipeline is the WORKING deal record — seller price drops, the GC's bid
// replaces the planning estimate, hold slips a month — so a saved deal must be
// editable where it lives instead of forcing a new save per adjustment.
//
// ARCHITECTURAL LAW (dispatch, verbatim intent): there is ONE Fix & Flip
// engine. This editor recomputes through the SAME canonical functions the
// analyzer uses — computeFlip / computeFlipStress / flipVerdict in finance.js —
// so an edited saved deal and a freshly analyzed one can never disagree.
// Flip-only this wave: flip was the analyzer without a pure engine (that gap is
// what this wave closed); LTR/BRRR/STR already have pure engines and follow in
// a later wave.
//
// Units at the boundary (the saved schema is uneven by history): saved cc1/cc2
// are WHOLE numbers, saved rate/points are FRACTIONS. The form shows all four
// as percentages; conversion happens exactly once, here.

// One deal in edit at a time; entering edit on another card re-renders first.
let editingDealId = null;

const peField = (card, key) => card ? card.querySelector(`[data-pe="${key}"]`) : null;
const peNum   = (card, key, fallback) => {
  const el = peField(card, key);
  const v = el ? parseComma(el.value) : NaN;
  return Number.isFinite(v) && el.value.trim() !== '' ? v : fallback;
};

// Defect-2 corrective: the deal's market association must be EDITABLE, never
// inferred. Options come from the canonical catalog (sorted by label); an
// already-stamped id not in the catalog (custom/retired region) is preserved as
// its own option so opening the editor can never silently drop it.
function buildMarketOptions(currentId) {
  const opts = ALL_MARKETS
    .map(m => ({ id: m.id, label: getMarketLabel(m.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (currentId && !opts.some(o => o.id === currentId)) {
    opts.unshift({ id: currentId, label: getMarketLabel(currentId) });
  }
  return opts.map(o =>
    `<option value="${escapeHtml(o.id)}"${o.id === currentId ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');
}

function buildFlipEditForm(d) {
  const data = d.data || {};
  const money = (v) => v != null && Number.isFinite(+v) ? (+v).toLocaleString() : '';
  const ratePct   = data.rate   != null ? +(data.rate * 100).toFixed(2)   : 10;
  const pointsPct = data.points != null ? +(data.points * 100).toFixed(2) : 3;

  // Ownership at form open. Persisted ownership wins; a legacy deal (nothing
  // persisted) recovers DealFit control ONLY on an exact match against the
  // governed current estimate for its own saved context — else manual.
  const isLegacy = data.repSource !== 'estimator' && data.repSource !== 'manual';
  let owned = data.repSource === 'estimator' ? 'estimator' : 'manual';
  if (isLegacy && data.sqft && d.market) {
    const est = repairEstimateSnapshotFor(data.sqft, getFlipMarket(d.market));
    if (est && data.rep === (data.self ? est.selfMid : est.hiredMid)) owned = 'estimator';
  }
  return `
    <div class="detail-section deal-edit-form">
      <div class="detail-title">Edit Deal</div>
      <div class="field full"><label>Deal name</label>
        <input type="text" data-pe="name" value="${escapeHtml(d.name)}"></div>
      <div class="field-row">
        <div class="field"><label>Asking Price</label>
          <div class="input-wrap"><span class="pfx">$</span><input type="text" inputmode="numeric" class="has-pfx" data-pe="ask" value="${money(data.ask)}"></div></div>
        <div class="field"><label>ARV</label>
          <div class="input-wrap"><span class="pfx">$</span><input type="text" inputmode="numeric" class="has-pfx" data-pe="arv" value="${money(data.arv)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Repair Costs</label>
          <div class="input-wrap"><span class="pfx">$</span><input type="text" inputmode="numeric" class="has-pfx" data-pe="rep"
            data-rep-owned="${owned}" data-rep-legacy="${isLegacy && owned !== 'estimator' ? '1' : ''}"
            oninput="this.dataset.repOwned='manual';this.dataset.repLegacy='';dealEditRepTouched(${d.id})" value="${money(data.rep)}"></div>
          <div class="field-hint" data-pe="rephint">${repHintHTML(d.id, owned)}</div>
        </div>
        <div class="field"><label>Hold (months)</label>
          <div class="input-wrap"><input type="number" data-pe="hold" value="${data.hold ?? 5}"><span class="sfx">mo</span></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Buying Costs %</label>
          <div class="input-wrap"><input type="number" class="has-sfx" data-pe="cc1" value="${data.cc1 ?? 2}"><span class="sfx">%</span></div></div>
        <div class="field"><label>Selling Costs %</label>
          <div class="input-wrap"><input type="number" class="has-sfx" data-pe="cc2" value="${data.cc2 ?? 5}"><span class="sfx">%</span></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Carrying Cost / mo</label>
          <div class="input-wrap"><span class="pfx">$</span><input type="text" inputmode="numeric" class="has-pfx" data-pe="carry" value="${money(data.carry)}"></div></div>
        <div class="field"><label>Min Profit Target</label>
          <div class="input-wrap"><span class="pfx">$</span><input type="text" inputmode="numeric" class="has-pfx" data-pe="target" value="${money(data.target)}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Loan Amount <span>(blank = all-cash)</span></label>
          <div class="input-wrap"><span class="pfx">$</span><input type="text" inputmode="numeric" class="has-pfx" data-pe="loan" value="${data.loan ? money(data.loan) : ''}"></div></div>
        <div class="field"><label>Square Footage</label>
          <div class="input-wrap"><input type="text" inputmode="numeric" data-pe="sqft" value="${data.sqft ? (+data.sqft).toLocaleString() : ''}"></div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Interest Rate %</label>
          <div class="input-wrap"><input type="number" step="0.1" class="has-sfx" data-pe="rate" value="${ratePct}"><span class="sfx">%</span></div></div>
        <div class="field"><label>Points %</label>
          <div class="input-wrap"><input type="number" step="0.1" class="has-sfx" data-pe="points" value="${pointsPct}"><span class="sfx">%</span></div></div>
      </div>
      <div class="toggle-row deal-edit-toggle">
        <div><div class="toggle-label">Self-Renovating</div>
        <div class="toggle-sub">Only if you perform the renovation labor yourself</div></div>
        <label class="toggle"><input type="checkbox" data-pe="self" onchange="dealEditSelfToggled(${d.id})" ${data.self ? 'checked' : ''}><div class="toggle-track"></div></label>
      </div>
      <div class="field full"><label>Underwritten in <span>(market/region)</span></label>
        <select data-pe="market" onchange="dealEditMarketChanged(${d.id})">
          <option value="">— No region —</option>
          ${buildMarketOptions(d.market)}
        </select>
        ${!d.market ? `<div class="field-hint">This deal was saved before regions were recorded — pick the market it was underwritten against. The deal keeps it even if your active market changes later.</div>` : ''}
      </div>
      <div class="field full"><label>Notes <span>(optional)</span></label>
        <textarea data-pe="notes">${escapeHtml(d.notes || '')}</textarea></div>
      <div class="detail-actions deal-edit-actions">
        <button class="btn-action" onclick="event.stopPropagation();cancelDealEdit(${d.id})">Cancel</button>
        <button class="btn-action primary" onclick="event.stopPropagation();saveDealEdits(${d.id})">Save Changes</button>
      </div>
      <div class="redeem-msg" data-pe="msg"></div>
    </div>
  `;
}

// Defect-1 corrective: the self toggle inside the editor. THE OWNERSHIP LAW:
//   estimator-owned  → swap to the OTHER governed midpoint from the deal's
//                      frozen underwriting snapshot (numbers the real estimator
//                      produced — no recomputation, no band drift);
//   user-owned       → the dollar amount is the user's; never touch it
//                      (downstream math still reacts to `self` at Save, e.g.
//                      the 75%/70% max-offer rule — that is the engine's law);
//   legacy/unknown   → no snapshot exists; never mutate anything.
// ─── Repair-budget ownership (FINAL RULING) ──────────────────────────────────
// Two user-facing states, no internal jargon:
//   DEALFIT ESTIMATE  — the budget is DealFit-controlled: Self-Renovating and
//                       region changes update it LIVE through the one governed
//                       estimator (current sqft + explicitly selected market via
//                       the canonical resolver). No Save needed to see it move.
//   MANUAL            — the instant the user types a number it is theirs:
//                       toggles and region changes never overwrite it. The
//                       "Use DealFit estimate" action is the explicit way back.
// Legacy deals (no persisted ownership) recover DealFit control ONLY when the
// saved value EXACTLY equals the governed current estimate for the deal's own
// context (sqft + explicitly saved/selected market + self state) — never
// approximate, never from the deal name.

// The estimate for the CURRENT editor context (form values first, saved deal
// as fallback). Null when square footage is missing.
function editorFreshEstimate(card, deal) {
  const sqft = peNum(card, 'sqft', deal?.data?.sqft ?? 0) || 0;
  if (!sqft) return null;
  const mktEl = peField(card, 'market');
  const marketId = mktEl ? (mktEl.value || null) : (deal?.market ?? null);
  return repairEstimateSnapshotFor(sqft, marketId ? getFlipMarket(marketId) : null);
}

// Plain-English state line under the Repair Costs field (ruled copy).
function repHintHTML(dealId, owned) {
  return owned === 'estimator'
    ? 'DealFit estimate — updates with renovation mode'
    : `Manual repair budget · <a href="#" class="rep-action" onclick="dealEditUseEstimate(${dealId});return false;">Use DealFit estimate</a>`;
}
function setRepHint(card, dealId, owned) {
  const hint = peField(card, 'rephint');
  if (hint) hint.innerHTML = repHintHTML(dealId, owned);
}

export function dealEditSelfToggled(id) {
  const deal = getDeals().find(d => d.id === id);
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  const repEl = peField(card, 'rep');
  if (!repEl || repEl.dataset.repOwned !== 'estimator') return;   // manual: protected
  const est = editorFreshEstimate(card, deal);
  if (!est) return;
  const mid = peField(card, 'self')?.checked ? est.selfMid : est.hiredMid;
  if (Number.isFinite(+mid)) repEl.value = (+mid).toLocaleString();
}

// Region change inside the editor: DealFit-controlled budgets follow the new
// region through the canonical resolver; manual budgets are untouched. A pure
// legacy value (no persisted ownership, user hasn't typed) may RECOVER DealFit
// control here — exact match only — the moment enough context exists.
export function dealEditMarketChanged(id) {
  const deal = getDeals().find(d => d.id === id);
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  const repEl = peField(card, 'rep');
  if (!repEl) return;
  const est = editorFreshEstimate(card, deal);
  if (repEl.dataset.repOwned === 'estimator') {
    if (!est) return;
    const mid = peField(card, 'self')?.checked ? est.selfMid : est.hiredMid;
    if (Number.isFinite(+mid)) repEl.value = (+mid).toLocaleString();
    return;
  }
  if (repEl.dataset.repLegacy === '1' && est) {
    const current = parseComma(repEl.value) || 0;
    const mid = peField(card, 'self')?.checked ? est.selfMid : est.hiredMid;
    if (current === mid) {                                  // EXACT match only
      repEl.dataset.repOwned = 'estimator';
      setRepHint(card, id, 'estimator');
    }
  }
}

// Typing in the field makes the number the user's — refresh the state line.
export function dealEditRepTouched(id) {
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  setRepHint(card, id, 'manual');
}

// "Use DealFit estimate" — the explicit hand-back. Computes the governed
// CURRENT estimate (form sqft + selected market + current self state), replaces
// the manual number, and restores live DealFit control immediately.
export function dealEditUseEstimate(id) {
  const deal = getDeals().find(d => d.id === id);
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  const repEl = peField(card, 'rep');
  if (!repEl || !deal) return;
  const msgEl = peField(card, 'msg');
  const est = editorFreshEstimate(card, deal);
  if (!est) {
    if (msgEl) { msgEl.textContent = 'Enter square footage first — the estimator needs it.'; msgEl.className = 'redeem-msg err'; }
    return;
  }
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'redeem-msg'; }
  const mid = peField(card, 'self')?.checked ? est.selfMid : est.hiredMid;
  if (!Number.isFinite(+mid)) return;
  repEl.value = (+mid).toLocaleString();
  repEl.dataset.repOwned = 'estimator';
  repEl.dataset.repLegacy = '';
  setRepHint(card, id, 'estimator');
}

export function startDealEdit(id) {
  const deal = getDeals().find(d => d.id === id);
  if (!deal || deal.type !== 'flip') return;
  if (editingDealId !== null && editingDealId !== id) renderPipeline();  // close any other edit
  editingDealId = id;
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  if (!card) return;
  const detail = card.querySelector('.deal-detail');
  if (!detail) return;
  detail.innerHTML = buildFlipEditForm(deal);
  card.classList.add('expanded');
}

// Cancel restores the prior saved values with ZERO mutation: nothing was
// written anywhere, so a full re-render from the untouched cache is the proof.
export function cancelDealEdit(id) {
  editingDealId = null;
  renderPipeline();
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  if (card) card.classList.add('expanded');
}

// Save recalculates through the canonical engine, rebakes verdict/cls/stats,
// and persists via the SAME saveDeals coordinator every other mutation uses —
// busy lock, auth gate, await-then-commit, and whole-array semantics (which is
// what carries every other deal, canary included, forward intact).
export async function saveDealEdits(id) {
  const deals = getDeals();
  const deal  = deals.find(d => d.id === id);
  if (!deal || deal.type !== 'flip') return { status: 'not-found' };
  const card = document.querySelector('.deal-card[data-id="' + id + '"]');
  const msgEl = peField(card, 'msg');
  const say = (t) => { if (msgEl) { msgEl.textContent = t; msgEl.className = 'redeem-msg err'; } };

  const name = (peField(card, 'name')?.value || '').trim();
  if (!name) { say('Give this deal a name.'); return { status: 'refused-name' }; }

  const old = deal.data || {};
  const ask    = peNum(card, 'ask',    old.ask);
  const arv    = peNum(card, 'arv',    old.arv);
  const rep    = peNum(card, 'rep',    old.rep ?? 0);
  const hold   = peNum(card, 'hold',   old.hold ?? 5) || 5;
  const cc1W   = peNum(card, 'cc1',    old.cc1 ?? 2);      // whole numbers in the form
  const cc2W   = peNum(card, 'cc2',    old.cc2 ?? 5);
  const carry  = peNum(card, 'carry',  old.carry ?? 900) || 900;
  const target = peNum(card, 'target', old.target ?? 40000) || 40000;
  const sqft   = peNum(card, 'sqft',   old.sqft ?? 0) || 0;
  const rateW  = peNum(card, 'rate',   old.rate != null ? old.rate * 100 : 10);
  const pointsW= peNum(card, 'points', old.points != null ? old.points * 100 : 3);
  const loanEl = peField(card, 'loan');
  const loan   = loanEl && loanEl.value.trim() !== '' ? (parseComma(loanEl.value) || 0) : 0;
  const self   = !!peField(card, 'self')?.checked;
  const notes  = (peField(card, 'notes')?.value || '').trim();

  if (!ask || !arv) { say('Asking price and ARV are required.'); return { status: 'invalid' }; }
  const vErr = validateInputs('flip', { ask, rep, loan, price: ask, cc1: cc1W, cc2: cc2W, rate: rateW, points: pointsW });
  if (vErr.errors.length) { say(vErr.errors[0].label + ' ' + vErr.errors[0].message); return { status: 'invalid' }; }

  // ONE canonical engine — identical calls to the analyzer's.
  const cc1 = cc1W / 100, cc2 = cc2W / 100, rate = rateW / 100, points = pointsW / 100;
  const eng = computeFlip({ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self });
  const { stressedProfit, marginOfSafety } = computeFlipStress({
    ask, arv, rep, cc1, cc2, carry, hold, financed: eng.financed, loan, rate, points, target,
  });
  // Design wave: same derived negotiation guidance as the analyzer, so an
  // edited deal re-derives the SAME dynamic counter verdict — one law.
  const nego = flipNegotiationGuidance({ ask, arv, rep, hold, cc1, cc2, carry, loan, rate, points, self, target });
  const { cls, verdict } = flipVerdict({
    profit: eng.profit, roi: eng.roi, target, maxOffer: eng.maxOffer, marginOfSafety, stressedProfit, self, ask, nego,
  });

  // Defect-1: persist repair ownership. 'estimator' ONLY when the field still
  // carries estimator ownership AND the dollar equals the snapshot's midpoint
  // for the chosen self state — anything else is the user's number now. A
  // snapshot adopted THIS session (legacy adoption, pre-push ruling) outranks
  // the stored one and is what gets persisted; otherwise the stored snapshot
  // rides forward as underwriting history.
  const repEl = peField(card, 'rep');
  const repSource = repEl?.dataset?.repOwned === 'estimator' ? 'estimator' : 'manual';
  const est = repSource === 'estimator' ? editorFreshEstimate(card, deal) : old.repEstimate;

  // Defect-2: the deal's market association comes from the EXPLICIT selector —
  // never from the active market, never from name/address text. A missing
  // selector (defensive) preserves the existing association unchanged.
  const mktEl = peField(card, 'market');
  const market = mktEl ? (mktEl.value || null) : (deal.market ?? null);

  const newData = {
    ...old,                       // preserves addr and any legacy extras untouched by the form
    type: 'flip', ask, arv, rep, hold,
    repSource,
    ...(est ? { repEstimate: est } : {}),   // an adopted snapshot persists; absent stays absent

    cc1: cc1W, cc2: cc2W,         // schema convention: whole numbers
    carry, target, sqft, self,
    loan, rate, points,           // schema convention: fractions
    financed: eng.financed, finCost: eng.finCost, loanInt: eng.loanInt, loanFees: eng.loanFees,
    cashIn: eng.cashIn, ltc: eng.ltc,
    profit: eng.profit, roi: eng.roi, ltv: eng.ltvVal, ltvLabel: eng.ltvLabel, maxOffer: eng.maxOffer,
    buyCost: eng.buyCost, sellCost: eng.sellCost, holdCost: eng.holdCost, totalIn: eng.totalIn,
    marginOfSafety, stressedProfit, verdict, cls, hot: cls === 'hot',
  };
  const updatedDeal = {
    ...deal, name, notes,
    verdict, cls,
    market,
    marketLabel: market ? getMarketLabel(market) : null,
    data: newData,
    stats: buildDealStats('flip', newData),
    updatedAt: new Date().toISOString(),
    updated:   new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };

  const candidate = deals.map(x => x.id === id ? updatedDeal : x);
  const res = await saveDeals(candidate);
  if (res.ok) {
    editingDealId = null;
    window.showToast && window.showToast('Deal updated');
    renderPipeline();
    const c2 = document.querySelector('.deal-card[data-id="' + id + '"]');
    if (c2) c2.classList.add('expanded');
    return { status: 'saved' };
  }
  if (res.reason === 'busy') { say('Another pipeline update is in progress.'); return { status: 'refused-busy' }; }
  if (res.reason === 'auth') { say('Your session has expired — sign in again.'); return { status: 'save-failed', failureClass: 'auth' }; }
  if (res.reason === 'stale') {
    say("Couldn't verify your saved pipeline with the server — nothing was changed. Retry in a moment.");
    hydratePipeline().then(() => renderPipeline()).catch(() => {});
    return { status: 'save-failed', failureClass: 'stale' };
  }
  say("Couldn't save changes — connection or server problem. Try again.");
  return { status: 'save-failed', failureClass: 'other' };
}

function buildFlipDetail(d, deal) {
  const rows = [
    { l: 'Asking price',           v: d.ask  != null ? fmt(d.ask)  : '—' },
    { l: 'After Repair Value (ARV)', v: d.arv != null ? fmt(d.arv)  : '—' },
    { l: 'Repair budget',          v: d.rep  != null ? fmt(d.rep) + (d.self ? ' (self-perform)' : '') : '—' },
    { l: 'Hold period',            v: d.hold ? d.hold + ' months' : '—' },
    { l: 'Buying costs / Selling costs', v: (d.cc1 || '?') + '% / ' + (d.cc2 || '?') + '%' },
    { l: 'Carrying cost/mo',       v: d.carry != null ? fmt(d.carry) : '—' },
    { l: 'Square footage',         v: d.sqft  ? d.sqft.toLocaleString() + ' sqft' : '—' },
    // Finding 3 retention rule: the market this analysis was underwritten
    // against, stamped at save time — the active region moving later (or
    // syncing in from another device) never rewrites it. Legacy deals lack it.
    ...(deal && deal.marketLabel ? [{ l: 'Underwritten in', v: escapeHtml(deal.marketLabel) }] : []),
  ];
  const metrics = [
    { l: 'Net profit',             v: d.profit   != null ? fmt(d.profit)   : '—',
      cls: d.profit != null ? flipProfitClass(d.profit, d.target) : null },
    // P2-2: same figure, same formula — named precisely on the expanded surface too.
    { l: 'Cash-on-Cash ROI',       v: d.roi      != null ? pct(d.roi)      : '—' },
    { l: 'Max offer (your number)',v: d.maxOffer != null ? fmt(d.maxOffer) : '—' },
    { l: 'LTV at asking',          v: d.ltv      != null ? pct(d.ltv)      : '—' },
    // UX wave finding 7: this row ADDS selling costs to totalIn (which excludes
    // them), while the analyzer's cash row excludes them — the two looked
    // contradictory under generic names. Named by what it actually is; math unchanged.
    { l: 'Total project cost (incl. selling costs)', v: (d.totalIn != null && d.sellCost != null) ? fmt(d.totalIn + d.sellCost) : '—' },
  ];
  return `
    <div class="detail-section">
      <div class="detail-title">Property &amp; Inputs</div>
      ${rows.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv">${r.v}</span></div>`).join('')}
    </div>
    <div class="detail-section">
      <div class="detail-title">Key Numbers</div>
      ${metrics.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv${r.cls ? ' ' + r.cls : ''}">${r.v}</span></div>`).join('')}
    </div>
    ${deal && d.maxOffer > 0 ? `<button class="whatif-link" onclick="event.stopPropagation();showMaxOfferScenario(${deal.id})">Plan the counter & walk-away →</button>` : ''}
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
    { l: 'Owner-paid utilities',   v: fmt(d.util || 0) + '/yr' },
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
      ${metrics.map(r => `<div class="detail-row"><span class="dl">${r.l}</span><span class="dv${r.cls ? ' ' + r.cls : ''}">${r.v}</span></div>`).join('')}
    </div>
  `;
  // Parity sweep (2026-09-04): a flip-only "Plan the counter" line had been
  // pasted here referencing an undeclared `deal` — a ReferenceError for every
  // saved STR card that blanked the whole pipeline render. STR has no
  // governed guidance model, so the correct surface is none, not a dead button.
}
