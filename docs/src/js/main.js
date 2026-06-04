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
import { ALL_MARKETS as PICKER_ALL, STR_MARKETS }                   from './markets.js';
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
} from './tiers.js';

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
    txt.textContent = '$' + carry.toLocaleString() + '/mo × ' + hold + ' mo = $' + total.toLocaleString();
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
  if (!hint) return;
  const occ = +document.getElementById('v-occ')?.value || 65;
  const nights = Math.round(occ / 100 * 365);
  hint.textContent = `The percentage of nights your property is booked over a year. A ${occ}% rate means roughly ${nights} nights booked. STR markets typically run 55–75% — higher in peak tourist areas, lower in seasonal markets. Your gross rent estimate assumes this rate.`;
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
    label.textContent = 'Self-Managing — saves 8–12% annually';
  } else {
    field.style.display = 'block';
    if (!pmInput.value || +pmInput.value === 0) pmInput.value = 8; // default to 8% (item 13)
    label.textContent = 'Hired Property Manager';
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
    document.getElementById('f-target').value = '40,000';
    document.getElementById('self-reno').checked = true;
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

const PICKER_MARKETS = PICKER_ALL.filter(m =>
  m.types && (m.types.includes('flip') || m.types.includes('str'))
);

// Helper: strip state code from display name for slot button
// "Charlotte NC" → "Charlotte" | "West Palm Beach FL" → "West Palm Beach"
function slotDisplayName(fullName) {
  const clean = fullName.replace(/\s*⚠.*$/, '').trim(); // strip ⚠️ if present
  const parts = clean.split(' ');
  return parts.slice(0, -1).join(' ') || clean; // strip last word (state code)
}

// ─── Active slot state (one per tab-type, tracks which slot drives analysis) ──

let _activeSlot = 0;  // slot index of whichever slot is currently driving analysis

// ─── Market slot rendering — 6-slot 3+3 grid ─────────────────────────────────

function renderMarketSlots(containerId, tabType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const unlocked = getUnlockedSlotCount();

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
    _activeSlot = slotIndex;
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
  document.getElementById('upgrade-modal-title').textContent = `Unlock Region ${slotNumber}`;
  openModal('modal-upgrade');
}

// ─── 2-step market picker: State → Market with search ────────────────────────

let _pickerSlot      = 0;
let _pickerIsChange  = false;    // true when replacing an existing market
let _pickerIsFirst   = false;    // true when this is first-launch
let _pickerState     = null;

function openMarketPicker(slotIndex, isFirstLaunch, isChange = false) {
  _pickerSlot     = slotIndex;
  _pickerIsFirst  = isFirstLaunch;
  _pickerIsChange = isChange;
  _pickerState    = null;

  const backdrop  = document.getElementById('modal-market-picker');
  const cancelRow = document.getElementById('picker-cancel-row');
  const title     = document.getElementById('picker-headline');
  const search    = document.getElementById('picker-search');

  if (isFirstLaunch) {
    backdrop.dataset.required = 'true';
    if (cancelRow) cancelRow.style.display = 'none';
    if (title) title.textContent = 'Choose Your Primary Market';
  } else {
    delete backdrop.dataset.required;
    if (cancelRow) cancelRow.style.display = 'flex';
    if (title) title.textContent = 'Choose a State';
  }

  // Reset search input
  if (search) search.value = '';

  // Show step 1 (state list), hide step 2 (market list)
  document.getElementById('picker-step-1').style.display = 'flex';
  document.getElementById('picker-step-2').style.display = 'none';

  pickerBuildStateList('');
  openModal('modal-market-picker');
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

function pickerSearch(term) {
  const q = term.trim().toLowerCase();

  if (!q) {
    document.getElementById('picker-step-1').style.display = 'flex';
    document.getElementById('picker-step-2').style.display = 'none';
    pickerBuildStateList('');
    return;
  }

  // Check for direct market name matches (skip state step)
  const directMatches = PICKER_MARKETS.filter(m => {
    const displayName = pickerMarketDisplay(m).toLowerCase();
    return displayName.includes(q) || m.id.includes(q.replace(/\s+/g, '-'));
  });

  if (directMatches.length > 0) {
    const titleEl = document.getElementById('picker-step2-title');
    if (titleEl) titleEl.textContent = 'Search Results';
    const list = document.getElementById('picker-markets');
    list.innerHTML = directMatches
      .sort((a, b) => pickerMarketDisplay(a).localeCompare(pickerMarketDisplay(b)))
      .map(m => `<div class="picker-item" onclick="pickerSelectMarket('${m.id}')">
        <div>
          <div class="picker-item-label">${pickerMarketDisplay(m)}</div>
          <div class="picker-item-sub">${marketStateCode(m)}</div>
        </div>
        <div class="picker-item-arrow">✓</div>
      </div>`).join('');
    document.getElementById('picker-step-1').style.display = 'none';
    document.getElementById('picker-step-2').style.display = 'flex';
    return;
  }

  // No direct match — filter state list
  pickerBuildStateList(q);
  document.getElementById('picker-step-1').style.display = 'flex';
  document.getElementById('picker-step-2').style.display = 'none';
}

function pickerBuildStateList(filterQ) {
  // Build state→markets map from PICKER_MARKETS, optionally filtered
  const stateMap = {};
  PICKER_MARKETS.forEach(m => {
    const state  = marketStateCode(m);
    // Guard: skip entries with no valid 2-letter uppercase state code
    if (!state || state.length !== 2 || !/^[A-Z]{2}$/.test(state)) return;
    const display = pickerMarketDisplay(m).toLowerCase();
    const stateL  = state.toLowerCase();
    if (!filterQ ||
        display.includes(filterQ) ||
        m.id.includes(filterQ.replace(/\s+/g, '-')) ||
        stateL.includes(filterQ)) {
      if (!stateMap[state]) stateMap[state] = [];
      stateMap[state].push(m);
    }
  });

  const stateKeys = Object.keys(stateMap).sort();

  const list = document.getElementById('picker-states');
  if (!stateKeys.length) {
    list.innerHTML = '<div class="picker-item disabled"><div class="picker-item-label">No markets found</div></div>';
    return;
  }
  list.innerHTML = stateKeys.map(code => {
    const count = stateMap[code].length;
    return `<div class="picker-item picker-state-btn" onclick="pickerSelectState('${code}')">
      <div class="picker-item-label">${code} (${count})</div>
      <div class="picker-item-arrow">›</div>
    </div>`;
  }).join('');
}

function pickerSelectState(stateCode) {
  _pickerState = stateCode;
  const markets = PICKER_MARKETS
    .filter(m => marketStateCode(m) === stateCode)
    .sort((a, b) => pickerMarketDisplay(a).localeCompare(pickerMarketDisplay(b)));
  const titleEl = document.getElementById('picker-step2-title');
  if (titleEl) titleEl.textContent = stateCode;
  const list = document.getElementById('picker-markets');
  list.innerHTML = markets.map(m =>
    `<div class="picker-item" onclick="pickerSelectMarket('${m.id}')">
      <div class="picker-item-label">${pickerMarketDisplay(m)}</div>
      <div class="picker-item-arrow">✓</div>
    </div>`
  ).join('');
  document.getElementById('picker-step-1').style.display = 'none';
  document.getElementById('picker-step-2').style.display = 'flex';
}

function pickerSelectMarket(marketId) {
  closeModal('modal-market-picker');

  if (_pickerIsFirst) {
    // First launch — always slot 0
    completePrimarySelection(marketId);
    _activeSlot = 0;
    renderMarketSlots('flip-slots',   'flip');
    renderMarketSlots('rental-slots', 'rental');
    return;
  }

  // Adding or changing any slot
  if (_pickerIsChange) {
    recordSlotChange(_pickerSlot); // start cooldown clock
  }
  setMarketSlot(_pickerSlot, marketId);
  // Make the newly set slot active
  _activeSlot = _pickerSlot;
  renderMarketSlots('flip-slots',   'flip');
  renderMarketSlots('rental-slots', 'rental');

  const label = getMarketLabel(marketId);
  showToast(_pickerIsChange
    ? `Market updated to ${label}`
    : `${label} added as Region ${_pickerSlot + 1}`
  );
}

function pickerBack() {
  // If on step 2 (market list), go back to step 1 (state list)
  _pickerState = null;
  const search = document.getElementById('picker-search');
  if (search) search.value = '';
  pickerBuildStateList('');
  document.getElementById('picker-step-1').style.display = 'flex';
  document.getElementById('picker-step-2').style.display = 'none';
}

// ─── Rent range hint ──────────────────────────────────────────────────────────

function updateRentRangeHint(slug) {
  const hint = document.getElementById('rent-range-hint');
  if (!hint) return;
  const m = STR_MARKETS[slug];
  if (m && m.revLow && m.revHigh) {
    hint.textContent = 'Estimated range: $' + Math.round(m.revLow / 1000) + 'k – $' + Math.round(m.revHigh / 1000) + 'k/yr';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
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
    : [{ id: 'v-price', label: 'Purchase Price' }, { id: 'v-rent', label: 'Gross Annual Rent' }];

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

// ─── Upgrade modal ────────────────────────────────────────────────────────────

function upgradeToInvestor() {
  // TODO: wire to Stripe payment link
  showToast('Investor tier — coming soon');
}

function upgradeToPro() {
  // TODO: wire to Stripe payment link
  showToast('Pro tier — coming soon');
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
      tapCount++;
      clearTimeout(tapTimer);

      if (tapCount === 1) {
        document.getElementById('upgrade-modal-title').textContent = 'Upgrade Your Plan';
        openModal('modal-upgrade');
      }

      tapTimer = setTimeout(() => {
        if (tapCount >= 5) {
          closeModal('modal-upgrade');
          openModal('modal-dev');
        }
        tapCount = 0;
      }, 2000);
    });
  });
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

// ─── First-launch onboarding — gate on primaryMarket (Task 3) ────────────────

function initOnboarding() {
  if (localStorage.getItem('primaryMarket')) return;
  openMarketPicker(0, true /* isFirstLaunch */);
}

// ─── Expose globals (called from inline HTML onclick handlers) ────────────────

Object.assign(window, {
  // nav
  showPage,
  // modals
  openModal,
  closeModal,
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
initOnboarding();
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

// Scroll padding needs recalculate after layout settles
window.addEventListener('load', updateScrollPadding);
window.addEventListener('resize', updateScrollPadding);
