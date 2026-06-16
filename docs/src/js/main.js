// ─── App entry — page nav, toast, modal, init ─────────────────────────────────

import { analyzeFlip, setFlipPreset, resetFlip, getLastFlipResult } from './flip.js';
import { analyzeRental, setRentalPreset, resetRental }              from './rental.js';
import { setRepairTier, calcRepair, useRepairEstimate,
         onSelfRenoToggle }                                          from './repair.js';
import { saveDeal as _saveDeal, renderPipeline,
         filterPipeline, toggleDeal,
         requestDelete, confirmDelete }                              from './pipeline.js';
import { openShareApp, shareDeal }                                   from './share.js';
import { openInstall, triggerInstall, initInstallHint }             from './install.js';
import { ALL_MARKETS as PICKER_ALL, STR_MARKETS, FLIP_MARKETS }     from './markets.js';
import { initCurrencyInputs, parseComma }                           from './format.js';
import { handlePipelineFundingClick }                               from './clearpath.js';
import {
  getActiveTier, isDevMode, setDevTier,
  hasSelectedMarkets, getMarketSlots,
  getMarketForSlot, setMarketSlot,
  getPrimaryMarket, getMarket2,
  completePrimarySelection, recordSlotChange,
  isSlotLocked, slotLockedUntilDate, slotWillLockUntilDate,
  getUnlockedSlotCount, isMarketUnlocked, getMarketLabel,
  migrateMarketStorage,
  redeemCode, devModeVisible,
} from './tiers.js';
import {
  initAuthAndEntitlement, onAuthChange,
  sendOtpCode, verifyOtpCode, signOutAccount, redeemServerCode,
  isSignedIn, getUserEmail,
} from './auth.js';
import { fetchMarketIntel } from './marketIntel.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
window.showToast = showToast;

// ─── Guide Mode (Guide = "on" / "off") ────────────────────────────────────────

function migrateGuideMode() {
  // Standardise on "on" / "off" — migrate old "beginner" / "pro" values
  const raw = localStorage.getItem('guideMode');
  if (raw === 'beginner') localStorage.setItem('guideMode', 'on');
  else if (raw === 'pro')  localStorage.setItem('guideMode', 'off');
  // Remove the old beginner_mode key if present
  localStorage.removeItem('beginner_mode');
}

function initGuideMode() {
  const mode = localStorage.getItem('guideMode') || 'off';
  const isOn = mode === 'on';
  if (isOn) {
    document.body.classList.add('beginner-mode');
  } else {
    document.body.classList.remove('beginner-mode');
  }
  document.querySelectorAll('.beginner-toggle-input').forEach(t => { t.checked = isOn; });
}

function toggleGuideMode(checked) {
  if (checked) {
    localStorage.setItem('guideMode', 'on');
    document.body.classList.add('beginner-mode');
  } else {
    localStorage.setItem('guideMode', 'off');
    document.body.classList.remove('beginner-mode');
  }
  document.querySelectorAll('.beginner-toggle-input').forEach(t => { t.checked = checked; });
  updateOccHint();
}

// ─── Carrying cost total ──────────────────────────────────────────────────────

function updateCarryTotal() {
  const carry = parseComma(document.getElementById('f-carry').value);
  const hold  = +document.getElementById('f-hold').value  || 0;
  const row   = document.getElementById('carry-total-row');
  const txt   = document.getElementById('carry-total-text');
  const lbl   = document.getElementById('hold-cost-label');
  if (carry && hold) {
    const total = carry * hold;
    // Cost-first, in white (so it doesn't get lost in the gray); the math dimmed in parens.
    txt.innerHTML = '<span style="color:#fff;font-weight:600">$' + total.toLocaleString() + '</span> ($' + carry.toLocaleString() + '/mo × ' + hold + ' mo)';
    row.style.display = 'block';
    if (lbl) lbl.style.display = 'block';
  } else {
    row.style.display = 'none';
    if (lbl) lbl.style.display = 'none';
  }
}

// ─── Occupancy hint (item 12) ─────────────────────────────────────────────────

function updateOccHint() {
  const hint = document.getElementById('occ-guide-hint');
  if (hint) {
    const occ = +document.getElementById('v-occ')?.value || 65;
    const nights = Math.round(occ / 100 * 365);
    hint.textContent = `The percentage of nights your property is booked over a year. A ${occ}% rate means roughly ${nights} nights booked. STR markets typically run 55–75% — higher in peak tourist areas, lower in seasonal markets. Your gross rent estimate assumes this rate.`;
  }
  updateEffRevHint();   // keep the booked-revenue preview in sync
}

// Show the effective (booked) revenue so the occupancy discount is never hidden.
// Guards against the "pasted AirDNA revenue + occupancy < 100%" double-discount.
function updateEffRevHint() {
  const hint = document.getElementById('eff-rev-hint');
  if (!hint) return;
  const rent = parseComma(document.getElementById('v-rent')?.value || '');
  const occ  = +document.getElementById('v-occ')?.value || 0;
  if (!rent || !occ) { hint.style.display = 'none'; return; }
  hint.textContent = occ >= 100
    ? 'Using your full-potential figure at 100% occupancy.'
    : '≈ $' + Math.round(rent * occ / 100).toLocaleString() + ' booked revenue at ' + occ + '% occupancy (your entry × occupancy).';
  hint.style.display = 'block';
}

// ─── Self-manage toggle (STR) ─────────────────────────────────────────────────

function updateSelfManage() {
  const toggle  = document.getElementById('self-manage-toggle');
  const field   = document.getElementById('self-manage-field');
  const pmInput = document.getElementById('v-pm');
  const label   = document.getElementById('self-manage-label');
  if (toggle.checked) {
    field.style.display = 'none';
    pmInput.value = 0;
    label.textContent = 'Self-managing — no PM fee';
  } else {
    field.style.display = 'block';
    if (!pmInput.value || +pmInput.value === 0) pmInput.value = 8; // default to 8% (item 13)
    label.textContent = 'Hired property manager — ~8% of revenue';
  }
}

// ─── Save deal ────────────────────────────────────────────────────────────────

function saveDeal(type) {
  _saveDeal(type);
  const btn = document.getElementById(type + '-save-btn');
  if (btn) { btn.textContent = 'Saved ✓'; btn.classList.add('saved'); }
  const page = document.getElementById('page-' + (type === 'flip' ? 'flip' : 'rental'));
  const handler = () => {
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    page.removeEventListener('input', handler);
    page.removeEventListener('change', handler);
  };
  page.addEventListener('input', handler);
  page.addEventListener('change', handler);
}

// ─── Clear & New Deal ─────────────────────────────────────────────────────────

function clearNewDeal(type) {
  if (type === 'flip') {
    ['f-addr','f-ask','f-arv','f-rep','sqft'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; delete el.dataset.userEdited; delete el.dataset.autoFilled; }
    });
    document.getElementById('f-hold').value   = 5;
    document.getElementById('f-cc1').value    = 2;
    document.getElementById('f-cc2').value    = 5;
    document.getElementById('f-carry').value  = '900';
    // Task 3: clear user-edited flag so renderMarketSlots resets target to market default
    const targetEl = document.getElementById('f-target');
    if (targetEl) { delete targetEl.dataset.userEdited; targetEl.value = '40,000'; }
    document.getElementById('self-reno').checked = false; // item 7: default unchecked (70% rule)
    resetFlip();
    renderMarketSlots('flip-slots', 'flip');
    const btn = document.getElementById('flip-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    document.getElementById('flip-deal-name').value = '';
    document.getElementById('flip-notes').value     = '';
    calcRepair();
    updateCarryTotal();
  } else {
    ['v-addr','v-price','v-rent'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('v-down').value          = 20;
    document.getElementById('v-occ').value            = 65;
    document.getElementById('v-mgmt').value           = 3;
    document.getElementById('v-pm').value             = 0;
    document.getElementById('v-tax').value            = '5,500';
    document.getElementById('v-maint').value          = '3,000';
    document.getElementById('v-furnish').value        = '15,000';
    document.getElementById('v-target').value         = 6;
    document.getElementById('v-interest-rate').value  = 6.75;
    document.getElementById('self-manage-toggle').checked = false; // default: hired PM
    updateSelfManage();
    resetRental();
    renderMarketSlots('rental-slots', 'rental');
    const btn = document.getElementById('rental-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    document.getElementById('rental-deal-name').value = '';
    document.getElementById('rental-notes').value     = '';
    const hint = document.getElementById('rent-range-hint');
    if (hint) hint.style.display = 'none';
  }
}

// ─── Picker market list (flip+str only, derived from full ALL_MARKETS) ────────

const _pickerEligible = PICKER_ALL.filter(m =>
  m.types && (m.types.includes('flip') || m.types.includes('str'))
);
// De-dupe "City ST" twins: when a base slug and its "-str" sibling are both
// eligible (e.g. charleston-sc + charleston-sc-str render as two identical
// rows), keep only the base — getStrMarket()/the hint resolve its -str data.
const _eligibleIds = new Set(_pickerEligible.map(m => m.id));
const PICKER_MARKETS = _pickerEligible.filter(m =>
  !(m.id.endsWith('-str') && _eligibleIds.has(m.id.slice(0, -4)))
);

// Helper: strip state code from display name for slot button
// "Charlotte NC" → "Charlotte" | "West Palm Beach FL" → "West Palm Beach"
function slotDisplayName(fullName) {
  const clean = fullName.replace(/\s*⚠.*$/, '').trim(); // strip ⚠️ if present
  const parts = clean.split(' ');
  return parts.slice(0, -1).join(' ') || clean; // strip last word (state code)
}

// ─── Active slot state (tracks which slot drives analysis; persisted) ─────────

let _activeSlot = (() => {
  const v = parseInt(localStorage.getItem('activeSlot'), 10);
  return Number.isInteger(v) && v >= 0 && v < 6 ? v : 0;
})();

function setActiveSlot(i) {
  _activeSlot = i;
  try { localStorage.setItem('activeSlot', String(i)); } catch {}
}

// ─── Market slot rendering — 6-slot 3+3 grid ─────────────────────────────────

function renderMarketSlots(containerId, tabType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const unlocked = getUnlockedSlotCount();

  // Guard a restored/stale active slot: must be unlocked AND populated, else
  // fall back to the primary (slot 0) so the highlight/presets are never wrong.
  if (_activeSlot >= unlocked || !getMarketForSlot(_activeSlot)) _activeSlot = 0;

  // Build 6 slot buttons using per-slot storage keys
  const html = [];
  for (let i = 0; i < 6; i++) {
    const marketId = getMarketForSlot(i);

    if (i < unlocked) {
      if (marketId) {
        const fullLabel = getMarketLabel(marketId);   // "Charlotte, NC" format
        const cityOnly  = slotDisplayName(fullLabel.replace(', ', ' ')); // "Charlotte NC" → "Charlotte"
        const isActive  = (i === _activeSlot);
        const slotClass = isActive ? 'slot-active' : 'slot-filled';
        html.push(`<button class="market-slot ${slotClass}" onclick="handleSlotClick(${i},'${marketId}')" data-slot="${i}" title="${fullLabel}">${cityOnly}</button>`);
      } else {
        const placeholder = i === 0 ? 'Pick Market' : 'Region ' + (i + 1);
        html.push(`<button class="market-slot slot-empty" onclick="handleSlotClick(${i},'')" data-slot="${i}">${placeholder}</button>`);
      }
    } else {
      // Locked — upgrade required (no pointer-events:none; click is handled in JS)
      html.push(`<button class="market-slot slot-locked" onclick="handleLockedSlot(${i + 1})">🔒 Region ${i + 1}</button>`);
    }
  }

  container.innerHTML = html.join('');

  // Auto-load the active slot's preset on render
  const activeId = getMarketForSlot(_activeSlot);
  if (activeId) {
    const el = container.querySelector('[data-slot="' + _activeSlot + '"]');
    if (tabType === 'flip') {
      setFlipPreset(activeId, el);
    } else {
      setRentalPreset(activeId, el);
      updateRentRangeHint(activeId);
    }
  }
}

// ─── Slot click handler — Task 5 logic ───────────────────────────────────────

function handleSlotClick(slotIndex, currentMarketId) {
  const tier = getActiveTier();

  // LOCKED slot (3–6) — open upgrade modal
  // (Handled via handleLockedSlot, but guard here in case)

  // EMPTY slot — open picker with no confirmation
  if (!currentMarketId) {
    openMarketPicker(slotIndex, false);
    return;
  }

  // POPULATED + NOT ACTIVE → silently switch active market, show toast, no popup
  if (slotIndex !== _activeSlot) {
    setActiveSlot(slotIndex);
    const label = getMarketLabel(currentMarketId);
    renderMarketSlots('flip-slots',   'flip');
    renderMarketSlots('rental-slots', 'rental');
    showToast('Switched to ' + label);
    return;
  }

  // POPULATED + ALREADY ACTIVE → cooldown/replace flow
  // Pro: no confirmation, open picker directly
  if (tier === 'pro') {
    openMarketPicker(slotIndex, false);
    return;
  }

  // Check if currently locked from a recent change
  if (isSlotLocked(slotIndex)) {
    const lockedUntil = slotLockedUntilDate(slotIndex);
    const tierLabel   = tier === 'investor' ? 'Pro' : 'Investor';
    showToast(`Slot locked until ${lockedUntil}. Upgrade to ${tierLabel} for faster access.`);
    return;
  }

  // Show cooldown confirmation before replacing this slot's market
  const cooldownDays  = tier === 'investor' ? 14 : 30;
  const willLockUntil = slotWillLockUntilDate();
  const msgEl = document.getElementById('market-confirm-text');
  if (msgEl) {
    msgEl.textContent = `Changing a Market Region locks that slot for ${cooldownDays} days. Your next change will be available on ${willLockUntil}. Continue?`;
  }
  _pendingSlotChange = slotIndex;
  openModal('modal-market-confirm');
}

let _pendingSlotChange = -1;

function confirmMarketChange() {
  closeModal('modal-market-confirm');
  if (_pendingSlotChange < 0) return;
  openMarketPicker(_pendingSlotChange, false, true /* isChange */);
}

// ─── Locked slot click ────────────────────────────────────────────────────────

function handleLockedSlot(slotNumber) {
  configureUpgradeModal('region');
  openModal('modal-upgrade');
}

// ─── Market picker ─ input lives in header, only #picker-results is replaced ──

let _pickerSlot      = 0;
let _pickerIsChange  = false;
let _pickerIsFirst   = false;
let _pickerState     = null;
let _pickerStateMap  = null;   // lazy-built once

function openMarketPicker(slotIndex, isFirstLaunch, isChange = false) {
  _pickerSlot     = slotIndex;
  _pickerIsFirst  = isFirstLaunch;
  _pickerIsChange = isChange;
  _pickerState    = null;

  const backdrop  = document.getElementById('modal-market-picker');
  const cancelRow = document.getElementById('picker-cancel-row');
  const search    = document.getElementById('picker-search');

  const cancelBtn = document.getElementById('picker-cancel-btn');
  if (isFirstLaunch) {
    backdrop.dataset.required = 'true';
    if (cancelRow) cancelRow.style.display = 'flex';   // always escapable — never brick the app
    if (cancelBtn) cancelBtn.textContent = 'Skip for now — pick a market later';
    _pickerSetTitle('Choose Your Primary Market');
  } else {
    delete backdrop.dataset.required;
    if (cancelRow) cancelRow.style.display = 'flex';
    if (cancelBtn) cancelBtn.textContent = 'Cancel';
    _pickerSetTitle('Choose a State');
  }

  if (search) search.value = '';

  const map = getPickerStateMap();
  _pickerRenderStateList(Object.keys(map).sort());
  openModal('modal-market-picker');
}

// Dismiss the picker. On first launch, remember the skip so onboarding doesn't
// re-gate every load — the analyzer just uses regional defaults until a market
// is chosen from the slots.
function pickerCancel() {
  if (_pickerIsFirst) localStorage.setItem('onboardingSkipped', '1');
  closeModal('modal-market-picker');
}

// ─── Helper: extract state code from market name ("Charlotte NC" → "NC") ──────
function marketStateCode(m) {
  const clean = m.name.replace(/\s*⚠.*$/, '').trim();
  return clean.split(' ').pop();
}

// ─── Helper: display name for picker market items ─────────────────────────────
function pickerMarketDisplay(m) {
  return m.name.replace(/\s*⚠.*$/, '').trim();
}

// ─── Lazy-built state map ─────────────────────────────────────────────────────
function getPickerStateMap() {
  if (_pickerStateMap) return _pickerStateMap;
  const map = {};
  PICKER_MARKETS.forEach(m => {
    const state = marketStateCode(m);
    if (!state || state.length !== 2 || !/^[A-Z]{2}$/.test(state)) return;
    if (!map[state]) map[state] = [];
    map[state].push(m);
  });
  Object.values(map).forEach(arr =>
    arr.sort((a, b) => pickerMarketDisplay(a).localeCompare(pickerMarketDisplay(b)))
  );
  _pickerStateMap = map;
  return map;
}

function _pickerSetTitle(text) {
  const nav = document.getElementById('picker-nav');
  if (nav) nav.innerHTML = `<div class="picker-title" id="picker-headline">${text}</div>`;
}
function _pickerSetBack(code) {
  const nav = document.getElementById('picker-nav');
  if (nav) nav.innerHTML = `<button class="picker-back" onclick="pickerBack()">&#8592; Back</button><div class="picker-title">${code}</div>`;
}

function _pickerRenderStateList(codes) {
  const map  = getPickerStateMap();
  const list = document.getElementById('picker-results');
  if (!list) return;
  if (!codes.length) { list.innerHTML = '<div class="picker-item disabled"><div class="picker-item-label">No results found</div></div>'; return; }
  list.innerHTML = codes.map(code => {
    const count = map[code].length;
    return `<div class="picker-item picker-state-btn" onclick="pickerSelectState('${code}')"><div class="picker-item-label">${code} (${count})</div><div class="picker-item-arrow">&#8250;</div></div>`;
  }).join('');
}
function _pickerRenderMarkets(markets) {
  const list = document.getElementById('picker-results');
  if (!list) return;
  list.innerHTML = markets.map(m =>
    `<div class="picker-item" onclick="pickerSelectMarket('${m.id}')"><div class="picker-item-label">${pickerMarketDisplay(m)}</div><div class="picker-item-arrow">&#10003;</div></div>`
  ).join('');
}
function _pickerRenderSearchResults(markets) {
  const list = document.getElementById('picker-results');
  if (!list) return;
  list.innerHTML = markets
    .sort((a, b) => pickerMarketDisplay(a).localeCompare(pickerMarketDisplay(b)))
    .map(m =>
      `<div class="picker-item" onclick="pickerSelectMarket('${m.id}')"><div><div class="picker-item-label">${pickerMarketDisplay(m)}</div><div class="picker-item-sub">${marketStateCode(m)}</div></div><div class="picker-item-arrow">&#10003;</div></div>`
    ).join('');
}

// ─── Search — ONLY #picker-results is replaced; input element never touched ──
function pickerSearch(query) {
  const q   = query.trim().toUpperCase();
  const map = getPickerStateMap();

  if (!q) {
    _pickerSetTitle(_pickerIsFirst ? 'Choose Your Primary Market' : 'Choose a State');
    _pickerRenderStateList(Object.keys(map).sort());
    return;
  }

  // 1. Exact 2-letter state code
  if (q.length === 2 && map[q]) {
    _pickerSetBack(q);
    _pickerRenderMarkets(map[q]);
    return;
  }

  // 2. City name substring (2+ chars only — prevents single-letter flood)
  if (q.length >= 2) {
    const cityMatches = PICKER_MARKETS.filter(m => pickerMarketDisplay(m).toUpperCase().includes(q));
    if (cityMatches.length > 0) {
      _pickerSetTitle('Search Results');
      _pickerRenderSearchResults(cityMatches);
      return;
    }
  }

  // 3. State code prefix — narrows state list, no flat market dump
  const stateMatches = Object.keys(map).filter(s => s.startsWith(q)).sort();
  if (stateMatches.length > 0) {
    _pickerSetTitle(_pickerIsFirst ? 'Choose Your Primary Market' : 'Choose a State');
    _pickerRenderStateList(stateMatches);
    return;
  }

  // 4. No match
  const list = document.getElementById('picker-results');
  if (list) list.innerHTML = '<div class="picker-item disabled"><div class="picker-item-label">No results found</div></div>';
}


function pickerSelectState(stateCode) {
  _pickerState = stateCode;
  _pickerSetBack(stateCode);
  _pickerRenderMarkets(getPickerStateMap()[stateCode] || []);
  const search = document.getElementById('picker-search');
  if (search) search.value = '';
}

function pickerSelectMarket(marketId) {
  closeModal('modal-market-picker');

  if (_pickerIsFirst) {
    // First launch — always slot 0
    completePrimarySelection(marketId);
    setActiveSlot(0);
    renderMarketSlots('flip-slots',   'flip');
    renderMarketSlots('rental-slots', 'rental');
    renderGuideMarketIntel();   // item 4: keep Guide intel in sync with selected regions
    return;
  }

  // Adding or changing any slot
  if (_pickerIsChange) {
    recordSlotChange(_pickerSlot); // start cooldown clock
  }
  setMarketSlot(_pickerSlot, marketId);
  // Make the newly set slot active
  setActiveSlot(_pickerSlot);
  renderMarketSlots('flip-slots',   'flip');
  renderMarketSlots('rental-slots', 'rental');
  renderGuideMarketIntel();     // item 4: regenerate region intel

  const label = getMarketLabel(marketId);
  showToast(_pickerIsChange
    ? `Market updated to ${label}`
    : `${label} added as Region ${_pickerSlot + 1}`
  );
}

function pickerBack() {
  _pickerState = null;
  const search = document.getElementById('picker-search');
  if (search) search.value = '';
  _pickerSetTitle(_pickerIsFirst ? 'Choose Your Primary Market' : 'Choose a State');
  _pickerRenderStateList(Object.keys(getPickerStateMap()).sort());
}

// ─── Rent range hint ──────────────────────────────────────────────────────────

function updateRentRangeHint(slug) {
  const hint = document.getElementById('rent-range-hint');
  if (!hint) return;
  const m = STR_MARKETS[slug] || STR_MARKETS[slug + '-str'];   // city data, incl. -str sibling
  if (m && m.revLow && m.revHigh) {
    hint.textContent = 'Estimated range: $' + Math.round(m.revLow / 1000) + 'k – $' + Math.round(m.revHigh / 1000) + 'k/yr';
    hint.style.display = 'block';
  } else {
    // No city-level STR data — say so rather than silently showing a regional average as city data
    hint.textContent = 'No city-level STR data yet — presets shown are a regional estimate.';
    hint.style.display = 'block';
  }
}

function setRentalPresetWithHint(type, el) {
  if (!el) return;
  setRentalPreset(type, el);
  updateRentRangeHint(type);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateRequiredFields(type) {
  const fields = type === 'flip'
    ? [{ id: 'f-ask', label: 'Purchase Price' }, { id: 'f-arv', label: 'ARV' }, { id: 'f-rep', label: 'Repair Costs' }]
    : [{ id: 'v-price', label: 'Purchase Price' }, { id: 'v-rent', label: 'Potential Annual Revenue' }];

  let valid = true;
  fields.forEach(f => {
    const el  = document.getElementById(f.id);
    if (!el) return;
    const val  = el.value.trim();
    const wrap = el.closest('.field');
    let msg    = wrap ? wrap.querySelector('.validation-msg') : null;
    if (!msg && wrap) {
      msg = document.createElement('div');
      msg.className = 'validation-msg';
      wrap.appendChild(msg);
    }
    if (!val || parseComma(val) === 0) {
      el.classList.add('field-error');
      if (msg) msg.textContent = 'Required — enter ' + f.label;
      valid = false;
    } else {
      el.classList.remove('field-error');
      if (msg) msg.textContent = '';
    }
  });
  return valid;
}

function analyzeFlipValidated() {
  if (validateRequiredFields('flip')) analyzeFlip();
}

function analyzeRentalValidated() {
  if (validateRequiredFields('rental')) analyzeRental();
}

// ─── Self-reno toggle — recalc + re-run analysis (item 9) ────────────────────

function updateSelfReno() {
  onSelfRenoToggle();
  // Re-run full flip analysis if results are already showing (item 9)
  if (getLastFlipResult()) analyzeFlipValidated();
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'pipeline') renderPipeline();
  window.scrollTo(0, 0);
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m && !m.dataset.required) m.classList.remove('active');
  });
});

// ─── Upgrade modal — context-aware + tier-aware (item 3) ─────────────────────

// trigger: 'region' | 'save' | 'general'
function configureUpgradeModal(trigger) {
  const tier      = getActiveTier();
  const title     = document.getElementById('upgrade-modal-title');
  const subhead   = document.getElementById('upgrade-subhead');
  const compare   = document.getElementById('upgrade-compare');
  const colInv    = document.getElementById('upgrade-col-investor');
  const colPro    = document.getElementById('upgrade-col-pro');
  const proFeat   = document.getElementById('upgrade-pro-features');
  const topNote   = document.getElementById('upgrade-toptier-note');

  // Context-aware headline by trigger
  const headlines = {
    region: 'Analyze deals in 4 markets, not 2',
    save:   'Never lose a deal you\'ve already found',
    general:'Upgrade Your Plan',
  };
  if (title)   title.textContent = headlines[trigger] || headlines.general;
  if (subhead) subhead.textContent = 'Paid plans unlock real market data for the markets you invest in — funding stays free on every tier.';

  // Reset visibility defaults
  if (compare) compare.style.display = '';
  if (colInv)  colInv.style.display = '';
  if (colPro)  colPro.style.display = '';
  if (topNote) topNote.style.display = 'none';

  if (tier === 'pro') {
    // Already top tier — nothing to sell
    if (compare) compare.style.display = 'none';
    if (topNote) topNote.style.display = 'block';
    if (title)   title.textContent = 'You\'re on Pro';
    if (subhead) subhead.textContent = '';
    return;
  }

  if (tier === 'investor') {
    // Delta framing — show only the Pro column
    if (colInv) colInv.style.display = 'none';
    if (title)  title.textContent = 'You have 4 regions. Pro adds 2 more, plus a dedicated broker.';
    if (proFeat) proFeat.innerHTML = [
      '2 more markets — 6 regions total',
      'A dedicated Clear Path broker who already knows your file before you call',
      'Highest-priority funding across dozens of lenders',
      'Everything in Investor, with no caps',
    ].map(t => `<li>${t}</li>`).join('');
  }
}

function recordUpgradeInterest(tierName) {
  try { localStorage.setItem('upgradeInterest', tierName); } catch {}
  closeModal('modal-upgrade');
  showToast('Thanks — we\'ll email you when ' + (tierName === 'pro' ? 'Pro' : 'Investor') + ' launches.');
}

function upgradeToInvestor() { recordUpgradeInterest('investor'); }
function upgradeToPro()      { recordUpgradeInterest('pro'); }

// ─── Header tier badge — tappable, 5-tap dev trigger (items 3, 7) ────────────

function initTierBadge() {
  const badges = document.querySelectorAll('.tier-badge');
  let tapCount = 0;
  let tapTimer = null;

  badges.forEach(badge => {
    const tier = getActiveTier();
    badge.textContent = tier === 'pro' ? 'PRO' : tier === 'investor' ? 'INVESTOR' : 'STARTER';

    badge.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimer);

      if (tapCount === 1) {
        configureUpgradeModal('general');
        openModal('modal-upgrade');
      }

      tapTimer = setTimeout(() => {
        // Dev Mode is owner-gated: 5 taps only reveal it when unlocked
        // (cpcDevUnlock or ?dev=1). The public never sees it.
        if (tapCount >= 5 && devModeVisible()) {
          closeModal('modal-upgrade');
          openModal('modal-dev');
        }
        tapCount = 0;
      }, 2000);
    });
  });
}

// ─── Redeem-code handler (called from the Upgrade modal) ─────────────────────

function showRedeemMsg(msgEl, result) {
  if (!msgEl) return;
  msgEl.textContent = result.msg || '';
  msgEl.className = 'redeem-msg ' + (result.ok ? 'ok' : 'err');
}

async function redeemTierCode() {
  const input = document.getElementById('redeem-code-input');
  const msgEl = document.getElementById('redeem-msg');
  const raw = input ? input.value : '';

  // Owner-only DEV code is handled client-side; everything else goes server-side.
  const local = redeemCode(raw);
  if (!local.deferToServer) {
    showRedeemMsg(msgEl, local);
    if (local.ok) setTimeout(() => location.reload(), 850);
    return;
  }

  showRedeemMsg(msgEl, { ok: true, msg: 'Checking…' });
  const result = await redeemServerCode(raw);
  showRedeemMsg(msgEl, result);
  if (result.ok) {
    // Let the confirmation register, then reload so all tier-gated UI rebuilds.
    setTimeout(() => location.reload(), 850);
  }
}

// ─── Account: magic-link sign-in / sign-out ──────────────────────────────────

async function sendSignInCode() {
  const email = document.getElementById('signin-email')?.value;
  const msgEl = document.getElementById('signin-msg');
  showRedeemMsg(msgEl, { ok: true, msg: 'Sending…' });
  const result = await sendOtpCode(email);
  showRedeemMsg(msgEl, result);
  if (result.ok) {
    const codeStep = document.getElementById('signin-code-step');
    if (codeStep) codeStep.style.display = '';
    document.getElementById('signin-code')?.focus();
  }
}

async function verifySignInCode() {
  const email = document.getElementById('signin-email')?.value;
  const code  = document.getElementById('signin-code')?.value;
  const msgEl = document.getElementById('signin-msg');
  showRedeemMsg(msgEl, { ok: true, msg: 'Verifying…' });
  const result = await verifyOtpCode(email, code);
  showRedeemMsg(msgEl, result);
  // On success, onAuthChange → refreshTierUI → updateAccountUI flips to signed-in.
}

async function doSignOut() {
  await signOutAccount();
  updateAccountUI();
  location.reload();
}

function updateAccountUI() {
  const signedIn = isSignedIn();
  const signinRow = document.getElementById('signin-row');
  const accountRow = document.getElementById('account-row');
  if (signinRow)  signinRow.style.display  = signedIn ? 'none' : '';
  if (accountRow) accountRow.style.display = signedIn ? '' : 'none';
  const emailEl = document.getElementById('account-email');
  if (emailEl) emailEl.textContent = getUserEmail();
  // Reset the sign-in steps when signed out (back to the email step).
  if (!signedIn) {
    const codeStep = document.getElementById('signin-code-step');
    if (codeStep) codeStep.style.display = 'none';
    const codeInput = document.getElementById('signin-code');
    if (codeInput) codeInput.value = '';
  }
}

// Re-render every tier-dependent surface after the server tier resolves (boot)
// or after sign-in/out — without re-binding the badge's tap listener.
function refreshTierUI() {
  const t = getActiveTier();
  const label = t === 'pro' ? 'PRO' : t === 'investor' ? 'INVESTOR' : 'STARTER';
  document.querySelectorAll('.tier-badge').forEach(b => { b.textContent = label; });
  updateDevModeIndicator();
  applyTierToUI();
  renderMarketSlots('flip-slots',   'flip');
  renderMarketSlots('rental-slots', 'rental');
  renderGuideMarketIntel();
  updateAccountUI();
}

// ─── Dev mode indicator ───────────────────────────────────────────────────────

function updateDevModeIndicator() {
  const banner = document.getElementById('dev-mode-banner');
  if (!banner) return;
  if (isDevMode()) {
    banner.textContent = 'DEV MODE — ' + getActiveTier().toUpperCase();
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ─── Apply tier to UI ─────────────────────────────────────────────────────────

function applyTierToUI() {
  const tier      = getActiveTier();
  const unlockAll = (tier === 'investor' || tier === 'pro');
  document.querySelectorAll('.locked-overlay').forEach(el => {
    el.style.display = unlockAll ? 'none' : '';
  });
  document.querySelectorAll('.locked-content').forEach(el => {
    el.style.filter = unlockAll ? 'none' : '';
    el.style.opacity = unlockAll ? '1' : '';
  });
}

// ─── Region-keyed Guide intel (item 4) ───────────────────────────────────────

// Open the upgrade modal with a given trigger (used by generated intel blocks)
function openUpgrade(trigger) {
  configureUpgradeModal(trigger || 'general');
  openModal('modal-upgrade');
}

function _kFmt(v) { return '$' + Math.round(v / 1000) + 'k'; }

// Build the intel HTML for a single market slug. Free numbers come from the bundle;
// premium notes/sources come from `intel` (the server's get_market_intel row, or
// null) — already tier-gated server-side, so editing localStorage can't unlock them.
function buildRegionIntel(slug, tier, intel) {
  const flip   = FLIP_MARKETS[slug];
  const str    = STR_MARKETS[slug];
  const label  = getMarketLabel(slug);            // "Charlotte, NC"
  if (!flip && !str) return '';
  const isPro  = tier === 'pro';                  // for the depth tag only
  const note   = txt => txt ? `<div class="gi-note">${txt}</div>` : '';  // server already gated by tier

  const rows = [];

  if (flip) {
    rows.push(`<div class="guide-item"><div class="gi-label">Median ARV · Days on market</div><div class="gi-val">$${Math.round(flip.medianArv / 1000)}k · ${flip.dom} days</div>${note(intel && intel.rehab_note)}</div>`);
    rows.push(`<div class="guide-item"><div class="gi-label">Disciplined offer (ARV rule)</div><div class="gi-val">${Math.round(flip.arvRuleLow * 100)}–${Math.round(flip.arvRuleHigh * 100)}% of ARV − repairs</div></div>`);
    rows.push(`<div class="guide-item"><div class="gi-label">Mid rehab (hired-out)</div><div class="gi-val">$${flip.repairLow}–${flip.repairHigh}/sf</div></div>`);
    rows.push(`<div class="guide-item"><div class="gi-label">Typical monthly hold</div><div class="gi-val">$${flip.monthlyHoldLow.toLocaleString()}–$${flip.monthlyHoldHigh.toLocaleString()}</div></div>`);
  }

  // STR viability — free numbers from STR_MARKETS; analyst note from the server.
  if (str) {
    rows.push(`<div class="guide-item"><div class="gi-label">STR potential</div><div class="gi-val">${_kFmt(str.revLow)}–${_kFmt(str.revHigh)}/yr · ${Math.round(str.occLow * 100)}–${Math.round(str.occHigh * 100)}% occ.</div>${note(intel && (intel.benchmark_note || intel.regulatory_note))}</div>`);
  } else if (intel && intel.str_viability) {
    rows.push(`<div class="guide-item"><div class="gi-label">STR potential</div><div class="gi-val">${intel.str_viability}${intel.str_rev_low ? ' · ' + _kFmt(intel.str_rev_low) + '–' + _kFmt(intel.str_rev_high) + '/yr' : ''}</div></div>`);
  }

  // Source link — the server returns source_url only for Pro.
  const src = intel && intel.source_url;
  if (src) rows.push(`<div class="guide-item"><div class="gi-label">Source</div><div class="gi-note"><a class="hint-link" href="${src}" target="_blank" rel="noopener">${new URL(src).hostname.replace('www.', '')}</a></div></div>`);

  // Pro gets a richer header tag so the added depth is legible
  const depthTag = isPro
    ? '<span class="intel-depth pro">Pro · full intel</span>'
    : (tier === 'investor' ? '<span class="intel-depth">Investor · benchmarks</span>' : '');

  const cityOnly = label.split(',')[0];
  return `
    <div class="locked-section">
      <div class="locked-content">
        <div class="guide-section">
          <h3>${label} Market Intel ${depthTag}</h3>
          ${rows.join('')}
        </div>
      </div>
      <div class="locked-overlay">
        <div class="locked-overlay-inner">
          <div class="locked-icon">🔒</div>
          <div class="locked-label">${cityOnly} Intel</div>
          <div class="locked-msg">Investor unlocks your market benchmarks · Pro adds analyst notes &amp; sources</div>
          <button class="locked-upgrade-btn" onclick="openUpgrade('region')">Upgrade to Unlock</button>
        </div>
      </div>
    </div>`;
}

// Funding-priority ladder — sells priority, not access. Visible to every tier
// so the value is legible; current tier is highlighted. Relative language only.
function buildFundingLadderHTML(tier) {
  const rung = (key, name, lines) => {
    const active = key === tier;
    return `<div class="ladder-rung${active ? ' active' : ''}">
      <div class="ladder-tier">${name}${active ? ' <span class="ladder-you">you</span>' : ''}</div>
      <div class="ladder-text">${lines}</div>
    </div>`;
  };
  return `
    <div class="guide-section">
      <h3>How Funding Priority Works</h3>
      <p class="gi-note" style="margin-bottom:10px">Funding is free on every tier — paid tiers move you toward the front of the queue and add hands-on help. The free funnel stays fast.</p>
      ${rung('starter', 'Starter — Free', 'Submit your deal and get a standard review and funding decision — at no cost.')}
      ${rung('investor', 'Investor', 'Everything in Starter, plus a <strong>first look</strong> — your deal moves toward the front of the queue — and a one-tap deal-summary export to send partners or lenders.')}
      ${rung('pro', 'Pro', 'Highest priority, plus a Clear Path broker <strong>pre-reviews your file before the call</strong> and packages it hands-on. Cross-device cloud sync coming.')}
    </div>`;
}

// Investor-only "Upgrade to Pro" card — makes the Pro delta legible in the Guide.
function buildInvestorUpgradeCTA() {
  return `
    <div class="guide-pro-cta">
      <div class="gpc-eyebrow">You're on Investor</div>
      <div class="gpc-title">Pro adds the hands-on layer</div>
      <ul class="gpc-list">
        <li>All 6 of your markets (vs 4)</li>
        <li>Full analyst notes &amp; sources for every market — not just the numbers</li>
        <li>Highest-priority funding + a broker who pre-reviews your file before the call</li>
        <li>Cross-device cloud sync (coming)</li>
      </ul>
      <button class="btn-redeem gpc-btn" onclick="openUpgrade('general')">See Pro</button>
    </div>`;
}

let _guideRenderToken = 0;
async function renderGuideMarketIntel() {
  const container = document.getElementById('guide-market-intel');
  if (!container) return;
  const token = ++_guideRenderToken;
  const tier  = getActiveTier();
  const slugs = getMarketSlots();   // every populated slot

  const paint = (intelMap) => {
    let html;
    if (!slugs.length) {
      html = '<div class="guide-item"><div class="gi-note">Pick a market region on the Fix &amp; Flip or Rentals tab to see its benchmarks here.</div></div>';
    } else {
      html = slugs.map(s => buildRegionIntel(s, tier, intelMap && intelMap.get(s))).filter(Boolean).join('');
    }
    // Investor sees what Pro adds; the funding ladder is shown to everyone.
    if (tier === 'investor') html += buildInvestorUpgradeCTA();
    html += buildFundingLadderHTML(tier);
    container.innerHTML = html;
    applyTierToUI();  // re-apply lock state to the freshly generated locked sections
  };

  paint(null);  // free numbers immediately — no blank flash while the depth loads

  // Premium depth (analyst notes/sources) for investor/pro — fetched + tier-gated
  // server-side. A render token drops a stale fetch if a newer render started.
  if (slugs.length && (tier === 'investor' || tier === 'pro')) {
    const intelMap = await fetchMarketIntel(slugs);
    if (token !== _guideRenderToken) return;
    if (intelMap.size) paint(intelMap);
  }
}

// ─── First-launch onboarding — gate on primaryMarket (Task 3) ────────────────

function initOnboarding() {
  if (localStorage.getItem('primaryMarket') || localStorage.getItem('onboardingSkipped')) return;
  openMarketPicker(0, true /* isFirstLaunch */);
}

// ─── Expose globals (called from inline HTML onclick handlers) ────────────────

Object.assign(window, {
  // nav
  showPage,
  // modals
  openModal,
  closeModal,
  pickerCancel,
  // flip
  analyzeFlip: analyzeFlipValidated,
  setFlipPreset,
  resetFlip,
  // rental
  analyzeRental: analyzeRentalValidated,
  setRentalPreset: setRentalPresetWithHint,
  resetRental,
  // dev tier switch (console: setTier('investor'))
  setTier(name, el) {
    if (name === 'starter' || name === 'investor' || name === 'pro') {
      setDevTier(name);  // writes localStorage.tier
      location.reload(); // reload so all tier-gated UI rebuilds cleanly
    } else {
      setRepairTier(name, el);
    }
  },
  // Exit Dev Mode: clear the owner dev flag + cached tier, then reload so the
  // app re-syncs the real (server) entitlement instead of the dev override.
  exitDevMode() {
    localStorage.removeItem('cpcDevUnlock');
    localStorage.removeItem('tier');
    location.reload();
  },
  calcRepair,
  useRepairEstimate,
  updateSelfReno,
  // pipeline
  saveDeal,
  renderPipeline,
  filterPipeline,
  toggleDeal,
  requestDelete,
  confirmDelete,
  // share
  openShareApp,
  shareDeal,
  // install
  openInstall,
  triggerInstall,
  // guide mode
  toggleGuideMode,
  // UX helpers
  updateCarryTotal,
  updateSelfManage,
  updateOccHint,
  updateEffRevHint,
  clearNewDeal,
  // market slots
  handleSlotClick,
  handleLockedSlot,
  // market picker (2-step)
  pickerSearch,
  pickerSelectState,
  pickerSelectMarket,
  pickerBack,
  confirmMarketChange,
  // upgrade
  upgradeToInvestor,
  upgradeToPro,
  redeemTierCode,
  sendSignInCode,
  verifySignInCode,
  signOutAccount: doSignOut,
  openUpgrade,
  // pipeline funding (clearpath)
  handlePipelineFundingClick,
});

// ─── Init ─────────────────────────────────────────────────────────────────────

// Migrations must run first — before any storage reads
migrateMarketStorage();   // marketSlots[] → primaryMarket / market_2
migrateGuideMode();       // "beginner"/"pro" → "on"/"off"

initInstallHint();
initGuideMode();
initCurrencyInputs();
updateDevModeIndicator();
initTierBadge();
applyTierToUI();
renderMarketSlots('flip-slots',   'flip');
renderMarketSlots('rental-slots', 'rental');
renderGuideMarketIntel();   // item 4: build region intel from selected markets
initOnboarding();

// Server-side entitlement: read the user's real tier on load (and again on any
// sign-in/out), then refresh every tier-gated surface. The synchronous render
// above paints from the cached tier for speed; this corrects it from the server.
onAuthChange(refreshTierUI);
initAuthAndEntitlement();

// Task 3: track when user manually edits the Min Profit Target
document.getElementById('f-target')?.addEventListener('input', () => {
  document.getElementById('f-target').dataset.userEdited = '1';
});
updateOccHint();
updateSelfManage();       // initialise PM field to 8% (default: hired PM)

// Track manual edits to f-rep so auto-fill stops overriding
const repField = document.getElementById('f-rep');
if (repField) {
  repField.addEventListener('input', () => {
    repField.dataset.userEdited = '1';
    delete repField.dataset.autoFilled;
  });
  repField.addEventListener('focus', () => repField.classList.remove('auto-filled'));
}
