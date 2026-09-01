// ─── App entry — page nav, toast, modal, init ─────────────────────────────────

import { analyzeFlip, setFlipPreset, resetFlip, getLastFlipResult } from './flip.js';
import { analyzeRental, setRentalPreset, resetRental }              from './rental.js';
import { analyzeLtr, setLtrPreset, resetLtr }                       from './ltr.js';
import { analyzeBrrr, setBrrrPreset, resetBrrr }                    from './brrr.js';
import { setRepairTier, calcRepair, useRepairEstimate,
         onSelfRenoToggle, updateRepairRangesForMarket,
         repairFieldShouldSelectOnFocus }                            from './repair.js';
import { saveDeal as _saveDeal, renderPipeline,
         filterPipeline, toggleDeal,
         requestDelete, confirmDelete,
         startDealEdit, cancelDealEdit, saveDealEdits,
         dealEditSelfToggled, dealEditUseEstimate,
         dealEditMarketChanged, dealEditRepTouched }                 from './pipeline.js';
import { openShareApp, shareDeal }                                   from './share.js';
import { openInstall, triggerInstall, initInstallHint }             from './install.js';
import { ALL_MARKETS as PICKER_ALL, STR_MARKETS, FLIP_MARKETS, LTR_MARKETS } from './markets.js';
import { initCurrencyInputs, parseComma, parseNumOpt, isMalformedCurrency, fmt, pct } from './format.js';
import { propertyBand, BAND_RULES,
         computeNegotiationScenario, flipProfitClass, mosLabel }      from './finance.js';
import { handlePipelineFundingClick }                               from './clearpath.js';
import { hydrateMarketsOnAuth, pushMarketChange }                   from './marketSync.js';
import {
  getActiveTier,
  hasSelectedMarkets, getMarketSlots,
  getMarketForSlot, setMarketSlot,
  getPrimaryMarket, getMarket2,
  completePrimarySelection, recordSlotChange,
  isSlotLocked, slotLockedUntilDate, slotWillLockUntilDate,
  getUnlockedSlotCount, isMarketUnlocked, getMarketLabel,
  getActiveMarketId,
  migrateMarketStorage,
  redeemCode,
} from './tiers.js';
import {
  initAuthAndEntitlement, onAuthChange, syncEntitlement,
  sendOtpCode, verifyOtpCode, signOutAccount, redeemServerCode,
  isSignedIn, getUserEmail,
} from './auth.js';
import { supabase } from './supabaseClient.js';
import { fetchMarketIntel } from './marketIntel.js';
import { hydratePipeline, clearPipelineCache, getDeals } from './storage.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
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

// Pure outcome→button mapping (Wave A1): the success state is reachable ONLY
// from a confirmed 'saved' status. label:null means "restore the pre-save label".
function saveButtonUI(status) {
  return status === 'saved'
    ? { label: 'Saved ✓', saved: true }
    : { label: null, saved: false };
}

async function saveDeal(type) {
  const btn = document.getElementById(type + '-save-btn');
  // Never restore a stale success/busy label — a re-save that fails must not
  // resurrect 'Saved ✓' from a previous save.
  const originalLabel = (btn && btn.textContent !== 'Saved ✓' && btn.textContent !== 'Saving…')
    ? btn.textContent : 'Save';
  const originalDisabled = btn ? btn.disabled : false;
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; btn.classList.remove('saved'); }

  let outcome;
  try {
    outcome = await _saveDeal(type);
  } catch (e) {
    // Unexpected failure — pipeline.js owns expected-path feedback; never leave
    // the button disabled or stuck on 'Saving…' (finally below restores it).
    console.warn('Save failed unexpectedly:', e);
  } finally {
    if (btn) {
      const ui = saveButtonUI(outcome && outcome.status);
      btn.disabled = originalDisabled;
      btn.textContent = ui.label == null ? originalLabel : ui.label;
      btn.classList.toggle('saved', ui.saved);
    }
  }

  // Existing revert-on-input behavior — armed only after a genuine success.
  if (outcome && outcome.status === 'saved') {
    const page = document.getElementById('page-' + (type === 'flip' ? 'flip' : 'rental'));
    const handler = () => {
      if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
      page.removeEventListener('input', handler);
      page.removeEventListener('change', handler);
    };
    page.addEventListener('input', handler);
    page.addEventListener('change', handler);
  }
  return outcome;
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
  } else if (type === 'ltr') {
    ['l-addr','l-price','l-rent','l-tax','l-ins'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; delete el.dataset.userEdited; }
    });
    const lt = document.getElementById('l-self-manage-toggle'); if (lt) lt.checked = false;
    resetLtr();
    renderMarketSlots('ltr-slots', 'ltr');
    const btn = document.getElementById('ltr-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    const dn = document.getElementById('ltr-deal-name'); if (dn) dn.value = '';
  } else if (type === 'brrr') {
    ['b-addr','b-price','b-rehab','b-arv','b-rent','b-acqloan','b-tax','b-ins'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; delete el.dataset.userEdited; }
    });
    const bt = document.getElementById('b-self-manage-toggle'); if (bt) bt.checked = false;
    resetBrrr();
    renderMarketSlots('brrr-slots', 'brrr');
    const btn = document.getElementById('brrr-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    const dn = document.getElementById('brrr-deal-name'); if (dn) dn.value = '';
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
  m.types && (m.types.includes('flip') || m.types.includes('str') || m.types.includes('ltr'))
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
    } else if (tabType === 'ltr') {
      setLtrPreset(activeId, el);
    } else if (tabType === 'brrr') {
      setBrrrPreset(activeId, el);
    } else {
      setRentalPreset(activeId, el);
      updateRentRangeHint(activeId);
    }
  } else if (tabType === 'flip') {
    // M-1: the repair estimator's ranges are module state in repair.js, and the
    // ONLY writer was setFlipPreset — reachable just now, inside `if (activeId)`.
    // So updateRepairRangesForMarket's own `else { _ranges = DEFAULT_RANGES }`
    // branch was unreachable whenever the active market went away: clear the
    // slot, or lose it to a tier downgrade or sign-out that locks it while slot 0
    // is empty, and the chips read "Pick Market" while the estimator kept serving
    // the departed market's bands — and kept auto-filling Repair Costs from them.
    // Calling it with null on the empty path makes that reset reachable.
    updateRepairRangesForMarket(null);
  }
}

// Render the shared market slots into every analyzer's container (hidden ones are
// guarded). Keeps the active-market highlight + presets in sync across all tabs.
function renderAllSlots() {
  renderMarketSlots('flip-slots',   'flip');
  renderMarketSlots('rental-slots', 'rental');
  renderMarketSlots('ltr-slots',    'ltr');
  renderMarketSlots('brrr-slots',   'brrr');
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
    renderAllSlots();
    showToast('Switched to ' + label);
    return;
  }

  // POPULATED + ALREADY ACTIVE → replace flow
  // Track E: replacing an OCCUPIED slot always warns first — Pro included.
  // This is an accidental-change guard, NOT a cooldown/cap: Pro keeps
  // unlimited switching, and switching BETWEEN configured slots above stays
  // the instant fade. Saved deals keep their own underwritten region.
  if (tier === 'pro') {
    const label = getMarketLabel(currentMarketId);
    const msgEl = document.getElementById('market-confirm-text');
    if (msgEl) msgEl.textContent =
      `Replace ${label}? Choosing another region will replace this market slot. ` +
      `Deals already underwritten in ${label} will keep their saved region.`;
    const confirmBtn = document.querySelector('#modal-market-confirm .btn-confirm');
    if (confirmBtn) confirmBtn.textContent = 'Choose another region';
    _pendingSlotChange = slotIndex;
    openModal('modal-market-confirm');
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
  const confirmBtn2 = document.querySelector('#modal-market-confirm .btn-confirm');
  if (confirmBtn2) confirmBtn2.textContent = 'Continue';
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

async function pickerSelectMarket(marketId) {
  closeModal('modal-market-picker');

  // UX wave finding 3: signed in, the SERVER is asked first — its tier-cap and
  // cooldown answer is the authority, and only ok:true commits locally, so two
  // devices can never fork. Signed out, pushMarketChange resolves ok:true
  // without any network and the flow below is byte-identical to the old one.
  const slot = _pickerIsFirst ? 0 : _pickerSlot;
  const res = await pushMarketChange(slot, marketId);
  if (!res.ok) {
    showToast(res.msg || 'That market change isn\'t available right now.');
    return;
  }

  if (_pickerIsFirst) {
    // First launch — always slot 0
    completePrimarySelection(marketId);
    setActiveSlot(0);
    renderAllSlots();
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
  renderAllSlots();
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
    : type === 'ltr'
    ? [{ id: 'l-price', label: 'Purchase Price' }, { id: 'l-rent', label: 'Monthly Rent' }]
    : type === 'brrr'
    ? [{ id: 'b-price', label: 'Purchase Price' }, { id: 'b-rehab', label: 'Rehab Budget' }, { id: 'b-arv', label: 'ARV' }, { id: 'b-rent', label: 'Monthly Rent' }]
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

  // F-3: malformed money input blocks the analysis with a visible message — it is
  // never silently normalized into a plausible number (required OR optional field).
  const CURRENCY_CONTAINERS = { flip: 'page-flip', rental: 'rental-view-str', ltr: 'rental-view-ltr', brrr: 'rental-view-brrr' };
  const box = document.getElementById(CURRENCY_CONTAINERS[type] || '');
  if (box) {
    box.querySelectorAll('[data-currency]').forEach(el => {
      const wrap = el.closest('.field');
      let msg = wrap ? wrap.querySelector('.validation-msg') : null;
      if (!isMalformedCurrency(el.value)) {
        // Clear a stale malformed flag once the field is corrected (required-list
        // fields are managed by the loop above; don't fight its message).
        if (!fields.some(f => f.id === el.id)) {
          el.classList.remove('field-error');
          if (msg && msg.textContent === 'Enter a valid dollar amount') msg.textContent = '';
        }
        return;
      }
      el.classList.add('field-error');
      if (!msg && wrap) {
        msg = document.createElement('div');
        msg.className = 'validation-msg';
        wrap.appendChild(msg);
      }
      if (msg) msg.textContent = 'Enter a valid dollar amount';
      valid = false;
    });
  }
  return valid;
}

// ─── Deal-name auto-default (UX wave finding 2) ──────────────────────────────
// "Save This Deal" defaults to "<street> — <region>" from data already typed
// (e.g. "417 Saddlebrooke Rd — Lake Murray"). Street only — the pipeline card
// already shows the full address, and long names wrap badly on phones. The
// field stays fully editable, and once the user customizes it we never
// overwrite: dataset.autoName records the last value WE wrote, so "current
// value === our last write" is the only state we'll replace.
function maybeDefaultDealName(nameFieldId, addrFieldId) {
  const nameEl = document.getElementById(nameFieldId);
  const addrEl = document.getElementById(addrFieldId);
  if (!nameEl || !addrEl) return;
  const current = nameEl.value.trim();
  if (current && current !== nameEl.dataset.autoName) return;   // user-customized — hands off
  const street = (addrEl.value || '').split(',')[0].trim();
  if (!street) return;
  const marketId = getActiveMarketId();
  const region = marketId ? slotDisplayName(getMarketLabel(marketId).replace(', ', ' ')) : '';
  const auto = region ? street + ' — ' + region : street;
  nameEl.value = auto;
  nameEl.dataset.autoName = auto;
}

function analyzeFlipValidated() {
  if (validateRequiredFields('flip')) {
    analyzeFlip();
    maybeDefaultDealName('flip-deal-name', 'f-addr');
  }
}

function analyzeRentalValidated() {
  if (validateRequiredFields('rental')) analyzeRental();
}

function analyzeLtrValidated()  { if (validateRequiredFields('ltr'))  analyzeLtr();  }
function analyzeBrrrValidated() { if (validateRequiredFields('brrr')) analyzeBrrr(); }

// Rentals sub-toggle: swap the STR / LTR / BRRR sub-views and render that view's
// (shared) market slots so presets prefill into the visible form.
function switchRentalView(view, btn) {
  ['str', 'ltr', 'brrr'].forEach(v => {
    const el = document.getElementById('rental-view-' + v);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('#page-rental .sub-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (view === 'ltr')       renderMarketSlots('ltr-slots',    'ltr');
  else if (view === 'brrr') renderMarketSlots('brrr-slots',   'brrr');
  else                      renderMarketSlots('rental-slots', 'rental');
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
// Track A2 (real external-user onboarding blocker): iOS Safari had THREE
// interacting failures in the auth/plan modal — (1) no body-scroll lock, so
// the page behind rubber-banded and fought the modal for every swipe; (2) the
// modal was sized in large-viewport vh, putting "Not now" beyond the visible
// dynamic viewport under collapsed browser chrome; (3) scrollTop persisted
// across opens, so a reopened modal started mid-content. The law now:
//   · opening ANY modal position-fixes the body at its current scroll (the
//     one true iOS body lock) and remembers the offset;
//   · closing the LAST open modal restores the exact page scroll position;
//   · every open resets the modal's own scrollTop to 0 — one scrolling
//     surface, always starting at the top (P1-B's account-first order intact);
//   · sizing/sticky-footer fixes live in CSS (dvh + sticky .modal-actions).
let _scrollLockY = 0;
let _openModalCount = 0;

function openModal(id)  {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.classList.contains('active')) {
    if (_openModalCount === 0) {
      _scrollLockY = window.scrollY || 0;
      const b = document.body.style;
      b.position = 'fixed'; b.top = (-_scrollLockY) + 'px';
      b.left = '0'; b.right = '0'; b.width = '100%';
    }
    _openModalCount++;
  }
  el.classList.add('active');
  const surface = el.querySelector('.modal, .modal-picker');
  if (surface) surface.scrollTop = 0;           // no stale scroll on reopen
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('active')) {
    _openModalCount = Math.max(0, _openModalCount - 1);
    if (_openModalCount === 0) {
      const b = document.body.style;
      b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
      window.scrollTo(0, _scrollLockY);         // page returns exactly where it was
    }
  }
  el.classList.remove('active');
}

// ─── Design wave · negotiation plan what-if (NON-MUTATING) ───────────────────
// One renderer, two entry points: the analyzer verdict button reads the live
// lastFlipResult ('analyzer'); a Pipeline link/badge passes the saved deal id.
// Every number comes from canonical computeFlip/computeFlipStress via
// computeNegotiationScenario — nothing is written to the form, the result, or
// the saved deal, and closing simply closes. Edge law: §G1 no-workable-price
// and repairs-exceed-ceiling get honest copy, §G2 shows the ceiling
// educationally when the ask is already at/below it, §G3 never fabricates a
// counter when DealFit's high range is unreachable.
function showMaxOfferScenario(ref) {
  // Analyzer results always carry type:'flip'; saved deals carry type at the
  // DEAL level (legacy data blobs may not), so each path checks its own field.
  let data = null;
  if (ref === 'analyzer') {
    const r = getLastFlipResult();
    if (r && r.type === 'flip') data = r;
  } else {
    const deal = getDeals().find(x => x.id === ref && x.type === 'flip');
    if (deal) data = deal.data;
  }
  if (!data) return;
  const sc = computeNegotiationScenario(data);
  const body = document.getElementById('maxoffer-body');
  if (!body) return;
  const row   = (l, v, cls) => `<div class="detail-row"><span class="dl">${l}</span><span class="dv${cls ? ' ' + cls : ''}">${v}</span></div>`;
  const title = (t) => `<div class="detail-title" style="margin-top:12px">${t}</div>`;
  const scenarioRows = (a) => {
    const pCls = flipProfitClass(a.profit, sc.target);
    const mos  = mosLabel(a.marginOfSafety);
    const range = a.rangeStatus === 'in' ? 'Inside DealFit range'
      : a.rangeStatus === 'above' ? 'Above DealFit range' : 'Below DealFit range';
    return [
      row('Projected profit', fmt(a.profit), pCls),
      row('Cash-on-Cash ROI', pct(a.roi), pCls),
      row('Total project cost (incl. selling costs)', fmt(Math.round(a.totalProject))),
      row('Your Min Profit Target', a.targetMet ? 'PASS' : 'FAIL — ' + fmt(sc.target - a.profit) + ' short', a.targetMet ? 'good' : 'bad'),
      row('DealFit suggested range', range, a.rangeStatus === 'below' ? 'warn' : 'good'),
      row('Stress-test profit (ARV −5%, rehab +10%, +1mo)', fmt(Math.round(a.stressedProfit)), a.stressedProfit >= 0 ? 'good' : 'bad'),
      row('Margin of safety', mos.label, mos.cls),
    ].join('');
  };
  if (!sc || sc.noWorkablePrice) {
    body.innerHTML = (sc && sc.ruleCeiling <= 0)
      ? '<p>Repairs exceed the ARV ceiling — no purchase price works on this deal. Walk away.</p>'
      : '<p>No purchase price reaches your ' + (sc ? fmt(sc.target) : 'profit') + ' Min Profit Target on this deal. Lower the target only if the numbers truly support it — otherwise walk away.</p>';
    openModal('modal-maxoffer');
    return;
  }
  const g = sc.guidance;
  const parts = [
    row('Current ask', fmt(sc.originalAsk)),
  ];
  if (sc.askBelowWalkAway) {
    // §G2: the ask already clears the user's ceiling — no counter required.
    parts.push(row('Walk-away ceiling', fmt(sc.walkAway)));
    parts.push('<p style="margin:10px 0 0">The asking price is already at or below your walk-away ceiling — negotiate from the ask; no counter is required. The ceiling is shown for reference.</p>');
  } else if (sc.counter === null) {
    // §G3: DealFit high range unreachable — show the walk-away, say so plainly.
    parts.push(row('Walk-away ceiling', fmt(sc.walkAway)));
    parts.push('<p style="margin:10px 0 0">DealFit&#8217;s suggested project-profit range is not achievable under current assumptions, so no comfortable counter is suggested. Your walk-away ceiling above still holds.</p>');
  } else {
    parts.push(row('Suggested counter', fmt(sc.counter)));
    parts.push(row('Walk-away ceiling', fmt(sc.walkAway)));
    parts.push(row('Cushion to ceiling', fmt(sc.cushionDollars) + ' / ' + (Math.round(sc.cushionPct * 10) / 10) + '%'));
  }
  if (sc.atCounter && !sc.askBelowWalkAway && sc.counter !== null) {
    parts.push(title('At the suggested counter — ' + fmt(sc.counter)));
    parts.push(scenarioRows(sc.atCounter));
  }
  if (sc.atWalkAway) {
    parts.push(title('At the walk-away ceiling — ' + fmt(sc.walkAway)));
    parts.push(scenarioRows(sc.atWalkAway));
  }
  parts.push(title('Your numbers vs DealFit'));
  parts.push(row('Your Min Profit Target', fmt(sc.target)));
  parts.push(row('DealFit suggested project profit', fmt(g.low) + '–' + fmt(g.high) + ' (est.)'));
  if (g.laborAllowance > 0) parts.push(row('Owner-labor allowance (est.)', fmt(Math.round(g.laborAllowance))));
  parts.push('<p style="margin:10px 0 0;font-size:11px">DealFit estimate only. Not a guarantee, an offer, or a lender requirement — sellers accept or reject on their own terms.</p>');
  body.innerHTML = parts.join('');
  openModal('modal-maxoffer');
}

document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => {
    // Through closeModal, never a bare class removal — otherwise the body
    // lock leaks and the page stays frozen after a backdrop dismiss.
    if (e.target === m && !m.dataset.required) closeModal(m.id);
  });
});

// ─── Upgrade modal — context-aware + tier-aware (item 3) ─────────────────────

// The paid framing sentence. It carries the compliance-load-bearing clause
// ("funding stays free on every tier") and must accompany the plan cards in
// BOTH modal views — as the subhead when the plans lead, and as the plans'
// lead-in when the free account leads.
const PAID_PLANS_LEAD =
  'Paid plans unlock real market data for the markets you invest in — funding stays free on every tier.';

// D-1 P1-B — state→presentation mapping for the one shared modal, in the style
// of authChipUI: pure, no DOM, exhaustively testable.
//
// THE DEFECT: every signed-out route into this modal (header Sign in, the Save
// gate, the Pipeline CTA) opened on the Investor/Pro pitch, leaving the free
// email field and Send code below the fold. A visitor who came to make a FREE
// account had to scroll past two Subscribe buttons to find one.
//
// THE LAW: signed out → the free account is the primary action and its controls
// lead; the paid cards keep every price, badge and action, below. Signed in →
// the paid-plan-first upgrade experience is untouched, and no redundant sign-in
// form is inserted (the sign-in row is already hidden when signed in).
//
// `trigger` still selects the signed-in headline. Signed out it does not: the
// headline's job there is to say a free account exists, which no trigger-
// specific upsell line does.
export function upgradeModalLayout(signedIn, trigger) {
  // Wave 5: the 'cap' trigger is gone — pipeline capacity is a uniform
  // allowance on every tier (§18-1), never a reason to upsell.
  const headlines = {
    region: 'Analyze deals in 4 markets, not 2',
    save:   'Never lose a deal you\'ve already found',
    general:'Upgrade Your Plan',
  };
  if (!signedIn) {
    return {
      accountFirst: true,
      title:     'Sign in or create a free account',
      subhead:   'Your pipeline lives with your free account. Sign in or create one to save deals and track them across all your devices.',
      plansLead: PAID_PLANS_LEAD,
    };
  }
  return {
    accountFirst: false,
    title:     headlines[trigger] || headlines.general,
    subhead:   PAID_PLANS_LEAD,
    plansLead: '',
  };
}

// Applies the layout's ordering to the real DOM. Moves the node rather than
// restyling it, so focus order and screen-reader order match what is painted
// (see the CSS note). Every step is optional-guarded: three test harnesses load
// this module against flat element stubs with no tree, and configuring the
// modal must never throw there.
function applyAccountPriority(accountFirst) {
  const shell = document.getElementById('upgrade-modal-body');
  if (shell?.classList?.toggle) shell.classList.toggle('account-first', !!accountFirst);

  const account = document.getElementById('account-block');
  const anchor  = accountFirst
    ? document.getElementById('upgrade-compare')   // above the plan cards
    : document.getElementById('redeem-block');     // back to its authored slot
  const parent  = account?.parentNode;
  if (!parent || !anchor || !account || typeof parent.insertBefore !== 'function') return;
  if (anchor.parentNode !== parent) return;        // unexpected tree — leave it alone
  if (account.nextSibling === anchor) return;      // already in place
  parent.insertBefore(account, anchor);
}

// trigger: 'region' | 'save' | 'cap' | 'general'
function configureUpgradeModal(trigger) {
  const tier      = getActiveTier();
  const title     = document.getElementById('upgrade-modal-title');
  const subhead   = document.getElementById('upgrade-subhead');
  const plansLead = document.getElementById('upgrade-plans-lead');
  const compare   = document.getElementById('upgrade-compare');
  const colInv    = document.getElementById('upgrade-col-investor');
  const colPro    = document.getElementById('upgrade-col-pro');
  const proFeat   = document.getElementById('upgrade-pro-features');
  const topNote   = document.getElementById('upgrade-toptier-note');
  const manageBtn = document.getElementById('manage-sub-btn');

  const layout = upgradeModalLayout(isSignedIn(), trigger);

  if (title)   title.textContent   = layout.title;
  if (subhead) subhead.textContent = layout.subhead;
  if (plansLead) {
    plansLead.textContent   = layout.plansLead;
    plansLead.style.display = layout.plansLead ? '' : 'none';
  }

  // Reset visibility defaults
  if (compare) compare.style.display = '';
  if (colInv)  colInv.style.display = '';
  if (colPro)  colPro.style.display = '';
  if (topNote) topNote.style.display = 'none';
  if (manageBtn) manageBtn.style.display = 'none';   // paid tiers only (R4A3A)

  applyAccountPriority(layout.accountFirst);

  // Signed out, the tier branches below cannot apply: they describe YOUR plan,
  // and there is no account to hold one. Returning here also means a stale tier
  // cache can never stand a signed-out visitor in front of "You're on Investor"
  // with no way to sign in. The plan cards stay visible — available, below.
  if (!isSignedIn()) return;

  if (tier === 'pro') {
    // Already top tier — nothing to sell
    if (compare) compare.style.display = 'none';
    if (topNote) { topNote.style.display = 'block'; topNote.textContent = 'You\'re on Pro — every feature is unlocked.'; }
    if (manageBtn) manageBtn.style.display = '';
    if (title)   title.textContent = 'You\'re on Pro';
    if (subhead) subhead.textContent = '';
    return;
  }

  if (tier === 'investor') {
    // LAUNCH BLOCKER (paid→paid): with Portal plan switching deferred
    // (Amendment 1), a second Checkout creates a SECOND Stripe subscription,
    // not a switch — the server refuses (plan_change_unavailable) and the UI
    // offers no actionable paid CTA on any paid tier. The server remains the
    // authority; this is UX/defense-in-depth only.
    if (compare) compare.style.display = 'none';
    if (topNote) { topNote.style.display = 'block'; topNote.textContent = 'You\'re on Investor — plan changes aren\'t available yet.'; }
    if (manageBtn) manageBtn.style.display = '';
    if (title)   title.textContent = 'You\'re on Investor';
    if (subhead) subhead.textContent = '';
    return;
  }
}

// ─── Checkout — trusted server path (Wave 5) ─────────────────────────────────
// The client names an abstract tier and receives a Stripe-hosted URL — or a
// refusal. Nothing here grants entitlement: paid state exists only when the
// server writes a grant and current_tier() reports it after a sync. While the
// payment gate is closed (pre-launch), the server refuses and the UI says so.

// Safe transport diagnostic (R1 stabilization): a pre-fetch failure used to
// vanish into one generic toast with zero evidence. Log ONLY name/message/
// status — never tokens, headers, session objects, bodies, or identifiers.
export function functionsFailureSummary(op, error) {
  return {
    op,
    kind: error?.context?.status != null ? 'http' : 'transport',
    name: typeof error?.name === 'string' ? error.name : typeof error,
    message: String(error?.message ?? error ?? 'unknown').slice(0, 200),
    status: typeof error?.context?.status === 'number' ? error.context.status : null,
  };
}
function logFunctionsFailure(op, error) {
  try { console.error('[dealfit] functions failure', functionsFailureSummary(op, error)); }
  catch { /* diagnostics must never break the flow */ }
}

async function startCheckout(tierName) {
  if (!isSignedIn()) { openUpgrade('general'); showToast('Sign in first — your plan attaches to your account.'); return; }
  showToast('Opening secure checkout…');
  try {
    const { data, error } = await supabase.functions.invoke('checkout', { body: { tier: tierName } });
    if (error || !data) {
      // Refusals are server-truth; render them honestly. The body's error code
      // outranks the bare status: two distinct 409 refusals exist
      // (already_entitled vs plan_change_unavailable).
      const ctx = error?.context;
      let code = null;
      try { code = (await ctx.clone().json())?.error ?? null; } catch { /* non-JSON or no body */ }
      if (code === 'plan_change_unavailable') { showToast('Plan changes aren\'t available yet.'); return; }
      if (ctx?.status === 403) { showToast('Checkout isn\'t open yet — paid plans are coming soon.'); return; }
      if (ctx?.status === 409) { showToast('You already have this tier on your account.'); return; }
      if (ctx?.status === 429) { showToast('One moment — a checkout is already starting.'); return; }
      logFunctionsFailure('checkout', error);
      showToast('Checkout is unavailable right now. Nothing was charged.');
      return;
    }
    if (data.url) { location.href = data.url; return; }
    logFunctionsFailure('checkout', { name: 'MalformedResponse', message: 'success response carried no url' });
    showToast('Checkout is unavailable right now. Nothing was charged.');
  } catch (e) {
    logFunctionsFailure('checkout', e);
    showToast('Checkout is unavailable right now. Nothing was charged.');
  }
}

// Stripe-hosted Customer Portal (owner decision #7 RESOLVED: Portal = YES for
// launch — payment methods + period-end cancellation; plan switching stays
// off). One activation = one portal invocation; a comp-only paid tier has no
// stripe_customers mapping and gets the truthful no_subscription answer.
async function manageSubscription() {
  if (manageSubscription._busy) return;
  manageSubscription._busy = true;
  try {
    const { data, error } = await supabase.functions.invoke('portal', { body: {} });
    if (!error && data?.url) { location.href = data.url; return; }
    let code = null;
    try { code = (await error?.context?.clone()?.json())?.error ?? null; } catch { /* non-JSON or no body */ }
    if (code === 'no_subscription') { showToast('No Stripe subscription is linked to this account.'); return; }
    if (error) logFunctionsFailure('portal', error);
  } catch (e) { logFunctionsFailure('portal', e); }
  finally { manageSubscription._busy = false; }
  showToast('Subscription management isn\'t available yet.');
}

// Checkout return (success/cancel redirect): a TRIGGER only, never proof of
// payment — reconcile reads authoritative Stripe state server-side and repairs
// the grant if the webhook write was lost; the UI then re-syncs from the server.
function handleCheckoutReturn() {
  let flag = null;
  try { flag = new URLSearchParams(location.search).get('checkout'); } catch { return; }
  if (!flag) return;
  try { history.replaceState(null, '', location.pathname); } catch {}
  if (flag === 'cancel') { showToast('Checkout canceled — nothing was charged.'); return; }
  if (flag !== 'success') return;
  showToast('Finalizing your plan…');
  supabase.functions.invoke('reconcile', { body: {} })
    .then((r) => { if (r?.error) logFunctionsFailure('reconcile', r.error); })
    .catch((e) => { logFunctionsFailure('reconcile', e); })
    .then(() => syncEntitlement())
    .then(() => { refreshTierUI(); showToast('Your plan is active on this account.'); })
    .catch((e) => { logFunctionsFailure('checkout-return', e); showToast('Payment received — your plan will appear after the next sign-in.'); });
}

// ─── Header tier badge — tappable, 5-tap dev trigger (items 3, 7) ────────────

function initTierBadge() {
  const badges = document.querySelectorAll('.tier-badge');
  let tapCount = 0;
  let tapTimer = null;

  badges.forEach(badge => {
    const tier = getActiveTier();
    badge.textContent = tier === 'pro' ? 'PRO' : tier === 'investor' ? 'INVESTOR' : 'STARTER';

    badge.addEventListener('click', () => {
      // Wave 5 (SR-3): the 5-tap dev panel is gone — the badge just opens the
      // upgrade/account modal.
      configureUpgradeModal('general');
      openModal('modal-upgrade');
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

// ── Wave A1 auth chip (util-bar) ─────────────────────────────────────────────
// Pure state→presentation mapping. `init` (ready=false) shows a neutral chip and
// no action until the first auth resolution completes — isSignedIn()===false is
// NOT evidence that initialization finished. Never exposes the email.
function authChipUI(ready, signedIn) {
  if (!ready) return { label: '…', aria: 'Checking sign-in status', action: null };
  return signedIn
    ? { label: 'Signed in', aria: 'Account — signed in', action: 'account' }
    : { label: 'Sign in',  aria: 'Sign in',              action: 'signin' };
}

let _authReady = false;

function renderAuthChip() {
  const chip = document.getElementById('auth-chip');
  if (!chip) return;
  const ui = authChipUI(_authReady, isSignedIn());
  chip.textContent = ui.label;
  chip.setAttribute('aria-label', ui.aria);
}

function handleAuthChipClick() {
  const ui = authChipUI(_authReady, isSignedIn());
  if (!ui.action) return;   // init state: inert until auth readiness resolves
  // Both views live in the existing upgrade modal's account block — signed-out
  // shows the sign-in row, signed-in shows the account row (updateAccountUI).
  openUpgrade(ui.action === 'account' ? 'general' : 'save');
}

// Re-render every tier-dependent surface after the server tier resolves (boot)
// or after sign-in/out — without re-binding the badge's tap listener.
function refreshTierUI() {
  const t = getActiveTier();
  const label = t === 'pro' ? 'PRO' : t === 'investor' ? 'INVESTOR' : 'STARTER';
  document.querySelectorAll('.tier-badge').forEach(b => { b.textContent = label; });
  applyTierToUI();
  renderAllSlots();
  renderGuideMarketIntel();
  updateAccountUI();
  renderAuthChip();
}

// Wave 5 (SR-3): the dev-mode banner and its indicator are gone with Dev Mode
// itself. The nav-lock invariants (tests/layout.test.mjs) are re-pinned in the
// same commit: the .dev-mode-banner element, its CSS offset rule, and the JS
// toggle no longer exist — the nav is unconditionally top:0.

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
  const ltr    = LTR_MARKETS[slug];
  const label  = getMarketLabel(slug);            // "Charlotte, NC"
  if (!flip && !str && !ltr) return '';
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

  // Long-term rental — free numbers from LTR_MARKETS; analyst note from the server (Pro).
  if (ltr) {
    rows.push(`<div class="guide-item"><div class="gi-label">Long-term rent (2BR) · cap rate</div><div class="gi-val">$${Math.round(ltr.rent2br).toLocaleString()}/mo · ${(ltr.capRate * 100).toFixed(1)}% cap · ${Math.round(ltr.vacancyRate * 100)}% vac.</div>${note(intel && intel.ltr_note)}</div>`);
  }

  // Source link — the server returns source_url / ltr_source_url only for Pro.
  const src = intel && (intel.source_url || intel.ltr_source_url);
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

// Wave 5 (SR-1, launch-blocking compliance): the old ladder sold preferential
// funding treatment as a paid benefit. That violates the product law — paid
// tiers buy DealFit APPLICATION FEATURES ONLY; Starter, Investor, and Pro
// receive identical CPC Get Funding pathway, routing, and review treatment.
// The replacement states that law to every tier; tests/tierlaw.test.mjs pins
// the prohibited-claim sweep across the whole shipped bundle.
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
      <h3>How Funding Works</h3>
      <p class="gi-note" style="margin-bottom:10px">Get Funding works the same on every tier — free, Investor, and Pro all reach Clear Path Capital the same way, with the same review. Paid tiers add DealFit app features, never funding treatment.</p>
      ${rung('starter', 'Starter — Free', 'Analyze deals, save your pipeline, and submit to Clear Path Capital — at no cost.')}
      ${rung('investor', 'Investor', 'Everything in Starter, plus server-verified quantitative market intel for your regions and one-tap deal-summary sharing.')}
      ${rung('pro', 'Pro', 'Everything in Investor, plus the full analyst layer — notes and sources for every market you track.')}
    </div>`;
}

// Investor-only "Upgrade to Pro" card — the Pro delta is app features only (SR-1).
function buildInvestorUpgradeCTA() {
  return `
    <div class="guide-pro-cta">
      <div class="gpc-eyebrow">You're on Investor</div>
      <div class="gpc-title">Pro adds the full analyst layer</div>
      <ul class="gpc-list">
        <li>All 6 of your markets (vs 4)</li>
        <li>Full analyst notes &amp; sources for every market — not just the numbers</li>
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
  // rental sub-views: Long-Term (LTR / DSCR) + BRRR
  switchRentalView,
  analyzeLtr: analyzeLtrValidated,
  setLtrPreset,
  resetLtr,
  analyzeBrrr: analyzeBrrrValidated,
  setBrrrPreset,
  resetBrrr,
  // Wave 5 (SR-3): the subscription-tier branch of setTier is GONE — no
  // window-exposed control may mutate paid display state. Rehab-cost tiers
  // (Light/Mid/Full, repair.js) are unrelated to subscriptions and keep their
  // setter under an unambiguous name.
  setRepairTier,
  startCheckout,
  manageSubscription,
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
  // pipeline edit-in-place (UX wave) — canonical-engine recompute lives in pipeline.js
  startDealEdit,
  cancelDealEdit,
  saveDealEdits,
  // repair-provenance corrective: governed self-toggle swap + explicit estimator re-adopt
  dealEditSelfToggled,
  dealEditUseEstimate,
  // Track D: non-mutating max-offer what-if (analyzer + pipeline entry points)
  showMaxOfferScenario,
  dealEditMarketChanged,
  dealEditRepTouched,
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
  // upgrade — Wave 5: real checkout via the trusted server path (SR-4)
  redeemTierCode,
  sendSignInCode,
  verifySignInCode,
  signOutAccount: doSignOut,
  openUpgrade,
  // auth chip (Wave A1) — pure mappers exposed for the executable test suite
  handleAuthChipClick,
  authChipUI,
  saveButtonUI,
  // D-1 P1-B signed-out modal priority — same pure-mapper contract
  upgradeModalLayout,
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
initTierBadge();
handleCheckoutReturn();   // Wave 5: checkout return is a sync TRIGGER, never entitlement
applyTierToUI();
renderAllSlots();
renderGuideMarketIntel();   // item 4: build region intel from selected markets
initOnboarding();

// Server-side entitlement: read the user's real tier on load (and again on any
// sign-in/out), then refresh every tier-gated surface. The synchronous render
// above paints from the cached tier for speed; this corrects it from the server.
onAuthChange(refreshTierUI);
onAuthChange(syncPipelineOnAuth);
onAuthChange(syncMarketsOnAuth);   // UX wave finding 3: market slots follow the account
// Wave A1 (auth chip readiness): the boot promise is the proven completion
// boundary — it resolves only after the initial getSession() settled, the auth
// subscription is wired, and the first entitlement sync + notify ran. Until
// then the chip stays in its neutral init state; no timers, no guessing.
initAuthAndEntitlement().then(() => {
  _authReady = true;
  renderAuthChip();
});

// Keep the (account-scoped) pipeline in step with auth: pull it from the server on
// sign-in / session restore, drop it on sign-out. Re-render if the pipeline tab is
// open so it reflects the change without a manual nav.
async function syncPipelineOnAuth() {
  if (isSignedIn()) await hydratePipeline();
  else clearPipelineCache();
  if (document.getElementById('page-pipeline')?.classList.contains('active')) {
    renderPipeline();
  }
}

// UX wave finding 3: pull the account's market slots down (and push local-only
// slots up) whenever auth resolves, then re-render every slot surface. Sign-out
// deliberately does NOT clear local slots — signed-out users keep the existing
// local behavior, and hydrateMarketsOnAuth is a no-op for them. Runs after
// refreshTierUI in the onAuthChange chain, so the server-side tier caps that
// set_user_market applies match the tier the UI just resolved.
async function syncMarketsOnAuth() {
  const res = await hydrateMarketsOnAuth();
  if (res.status === 'synced' && (res.pulled > 0 || res.pushed > 0)) {
    renderAllSlots();            // M-1 stays correct: the empty path resets ranges
    renderGuideMarketIntel();
  }
}

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
  // P2-1: while the value on screen is still the estimator's, focusing the field
  // offers it up for replacement instead of parking a caret mid-number. A pointer
  // press fires focus BEFORE it places the caret, so that one release would
  // collapse the selection we just made — suppress exactly that release, never a
  // later one, so a second click still positions the caret normally.
  let selectOnRelease = false;
  repField.addEventListener('focus', () => {
    repField.classList.remove('auto-filled');
    if (!repairFieldShouldSelectOnFocus(repField.dataset)) return;
    selectOnRelease = true;
    try { repField.select(); } catch { /* older engines: caret stays put */ }
  });
  repField.addEventListener('mouseup', e => {
    if (!selectOnRelease) return;
    selectOnRelease = false;
    e.preventDefault();
  });
  repField.addEventListener('blur', () => { selectOnRelease = false; });
}

// ─── Multifamily band sync (LTR + BRRR) ───────────────────────────────────────
// Unit count drives the financing band: 1–4 standard DSCR, 5–8 small-multifamily
// DSCR (tighter LTV + higher reserve defaults), 9+ commercial (manual review). When
// the band changes, refresh the band-derived % fields to that band's defaults — but
// never clobber a field the user has explicitly edited (programmatic .value writes
// don't fire 'input', so they stay "default"; user typing marks it edited).
['l-down','l-vac','l-pm','l-maint','l-capex','b-vac','b-pm','b-maint','b-capex'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => { el.dataset.userEdited = '1'; });
});
function syncBandDefaults(prefix) {
  const unitsEl = document.getElementById(prefix + '-units');
  const band = propertyBand(unitsEl ? parseNumOpt(unitsEl.value) : undefined);
  const rentLabel = document.getElementById(prefix + '-rent-label');
  if (rentLabel) rentLabel.textContent = band === '5-8' ? 'Total gross monthly rent (all units)' : 'Monthly Rent';

  // (a) Property-type auto-sync — a 5+ unit deal can never honestly sit on SFR / 2–4.
  // 5–8 → "5–8 Unit", 9+ → "9+ Unit" (re-asserted on every units change). For 1–4,
  // only reset a STALE "5–8 Unit"/"9+ Unit" left over from a higher count; otherwise
  // leave the user's SFR/2–4/Condo/Townhome choice (unit count doesn't pick type in 1–4).
  const ptypeEl = document.getElementById(prefix + '-ptype');
  if (ptypeEl) {
    if (band === '5-8') ptypeEl.value = '5–8 Unit';
    else if (band === '9plus') ptypeEl.value = '9+ Unit';
    else if (ptypeEl.value === '5–8 Unit' || ptypeEl.value === '9+ Unit') ptypeEl.value = '2–4 Unit';
  }

  // (b) Live 9+ hint before Analyze. Marked with its own class so it only ever clears
  // its OWN live hint — never a post-Analyze banner (analyzeLtr/Brrr write here too).
  const notice = document.getElementById(prefix + '-band-notice');
  if (notice) {
    if (band === '9plus') {
      notice.style.display = 'block';
      notice.className = 'band-notice band-notice-warn band-live-hint';
      notice.innerHTML = '9+ units — commercial multifamily, manual CPC review on submit.';
    } else if (notice.classList.contains('band-live-hint')) {
      notice.style.display = 'none';
      notice.innerHTML = '';
      notice.className = 'band-notice';
    }
  }

  const rules = BAND_RULES[band];
  if (!rules) return band;                          // 9+ has no calculator defaults
  const fields = prefix === 'l'
    ? { down: rules.down, vac: rules.vac, pm: rules.pm, maint: rules.maint, capex: rules.capex }
    : { vac: rules.vac, pm: rules.pm, maint: rules.maint, capex: rules.capex };   // BRRR has no down field
  for (const [suf, val] of Object.entries(fields)) {
    const el = document.getElementById(prefix + '-' + suf);
    if (el && !el.dataset.userEdited) el.value = val;
  }
  return band;
}
['l','b'].forEach(p => {
  const u = document.getElementById(p + '-units');
  if (u) u.addEventListener('input', () => syncBandDefaults(p));
});
