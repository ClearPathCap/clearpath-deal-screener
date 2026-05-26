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
import { initGeolocation, RENTAL_RENT_RANGES }                      from './markets.js';
import { initCurrencyInputs, parseComma }                           from './format.js';
import { handlePipelineFundingClick }                               from './clearpath.js';
import {
  MARKET_HIERARCHY, STATE_NAMES, ALL_MARKETS,
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

// ─── Market slot rendering — 6-slot layout ────────────────────────────────────

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
        const label = getMarketLabel(marketId);   // "Charlotte, NC" format
        html.push(`<button class="market-slot slot-active" onclick="handleSlotClick(${i},'${marketId}')" data-slot="${i}">${label}</button>`);
      } else {
        const placeholder = i === 0 ? 'Pick Market' : 'Region ' + (i + 1);
        html.push(`<button class="market-slot slot-empty" onclick="handleSlotClick(${i},'')" data-slot="${i}">${placeholder}</button>`);
      }
    } else {
      // Locked — upgrade required
      html.push(`<button class="market-slot slot-locked" onclick="handleLockedSlot(${i + 1})">🔒 Region ${i + 1}</button>`);
    }
  }

  container.innerHTML = html.join('');

  // Auto-activate primary market's preset on render
  const primaryId = getMarketForSlot(0);
  if (primaryId) {
    const el = container.querySelector('[data-slot="0"]');
    if (tabType === 'flip') {
      setFlipPreset(primaryId, el);
    } else {
      setRentalPreset(primaryId, el);
      updateRentRangeHint(primaryId);
    }
  }
}

// ─── Slot click handler ───────────────────────────────────────────────────────

function handleSlotClick(slotIndex, currentMarketId) {
  const tier = getActiveTier();

  // Empty slot = first add → open picker directly, no warning (item 6)
  if (!currentMarketId) {
    openMarketPicker(slotIndex, false);
    return;
  }

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

  // Show confirmation popup before opening picker (item 6)
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

// ─── 3-step market picker (item 5) ───────────────────────────────────────────

let _pickerSlot      = 0;
let _pickerIsChange  = false;    // true when replacing an existing market
let _pickerIsFirst   = false;    // true when this is first-launch
let _pickerRegion    = null;
let _pickerState     = null;

function openMarketPicker(slotIndex, isFirstLaunch, isChange = false) {
  _pickerSlot     = slotIndex;
  _pickerIsFirst  = isFirstLaunch;
  _pickerIsChange = isChange;
  _pickerRegion   = null;
  _pickerState    = null;

  const backdrop = document.getElementById('modal-market-picker');
  const cancelRow = document.getElementById('picker-cancel-row');
  const title     = document.getElementById('picker-headline');

  if (isFirstLaunch) {
    backdrop.dataset.required = 'true';
    if (cancelRow) cancelRow.style.display = 'none';
    if (title) title.textContent = 'Choose Your Primary Market';
    document.getElementById('picker-subhead').textContent = 'Pick the region where you invest most.';
  } else {
    delete backdrop.dataset.required;
    if (cancelRow) cancelRow.style.display = 'flex';
    if (title) title.textContent = 'Change Market Region';
    document.getElementById('picker-subhead').textContent = 'Select a region, then your state, then your market.';
  }

  pickerShowStep(1);
  openModal('modal-market-picker');
}

function pickerShowStep(step) {
  [1, 2, 3].forEach(n => {
    document.getElementById('picker-step-' + n).style.display = n === step ? 'flex' : 'none';
  });
  if (step === 1) pickerBuildRegions();
  if (step === 2) pickerBuildStates();
  if (step === 3) pickerBuildMarkets();
}

function pickerBuildRegions() {
  const list = document.getElementById('picker-regions');
  const regions = Object.keys(MARKET_HIERARCHY);
  list.innerHTML = regions.map(region => {
    const states     = MARKET_HIERARCHY[region];
    const mktCount   = Object.values(states).flat().length;
    const hasMarkets = mktCount > 0;
    return `<div class="picker-item${hasMarkets ? '' : ' disabled'}" onclick="${hasMarkets ? `pickerSelectRegion('${region}')` : ''}">
      <div>
        <div class="picker-item-label">${region}</div>
        <div class="picker-item-sub">${hasMarkets ? mktCount + ' market' + (mktCount !== 1 ? 's' : '') : 'No markets yet'}</div>
      </div>
      ${hasMarkets ? '<div class="picker-item-arrow">›</div>' : ''}
    </div>`;
  }).join('');
}

function pickerSelectRegion(region) {
  _pickerRegion = region;
  pickerShowStep(2);
}

function pickerBuildStates() {
  const states     = MARKET_HIERARCHY[_pickerRegion] || {};
  const stateKeys  = Object.keys(states).sort();
  const titleEl    = document.getElementById('picker-step2-title');
  if (titleEl) titleEl.textContent = _pickerRegion;
  const list = document.getElementById('picker-states');
  list.innerHTML = stateKeys.map(code => {
    const mkts  = states[code];
    const count = mkts.length;
    const name  = STATE_NAMES[code] || code;
    return `<div class="picker-item" onclick="pickerSelectState('${code}')">
      <div>
        <div class="picker-item-label">${name}</div>
        <div class="picker-item-sub">${count} market${count !== 1 ? 's' : ''}</div>
      </div>
      <div class="picker-item-arrow">›</div>
    </div>`;
  }).join('');
}

function pickerSelectState(stateCode) {
  _pickerState = stateCode;
  pickerShowStep(3);
}

function pickerBuildMarkets() {
  const mkts   = (MARKET_HIERARCHY[_pickerRegion] || {})[_pickerState] || [];
  const titleEl = document.getElementById('picker-step3-title');
  if (titleEl) titleEl.textContent = STATE_NAMES[_pickerState] || _pickerState;
  const list = document.getElementById('picker-markets');
  list.innerHTML = mkts.map(m =>
    `<div class="picker-item" onclick="pickerSelectMarket('${m.id}')">
      <div class="picker-item-label">${m.label}</div>
      <div class="picker-item-arrow">✓</div>
    </div>`
  ).join('');
}

function pickerSelectMarket(marketId) {
  closeModal('modal-market-picker');

  if (_pickerIsFirst) {
    // First launch — always slot 0, uses completePrimarySelection to set all flags
    completePrimarySelection(marketId);
    renderMarketSlots('flip-slots', 'flip');
    renderMarketSlots('rental-slots', 'rental');
    return;
  }

  // Adding or changing any slot
  if (_pickerIsChange) {
    recordSlotChange(_pickerSlot); // start cooldown clock
  }
  setMarketSlot(_pickerSlot, marketId);
  renderMarketSlots('flip-slots', 'flip');
  renderMarketSlots('rental-slots', 'rental');

  const label = getMarketLabel(marketId);
  showToast(_pickerIsChange
    ? `Market Region updated to ${label}`
    : `${label} added as Region ${_pickerSlot + 1}`
  );
}

function pickerBack() {
  if (_pickerState) { _pickerState = null; pickerShowStep(2); return; }
  if (_pickerRegion) { _pickerRegion = null; pickerShowStep(1); }
}

// ─── Rent range hint ──────────────────────────────────────────────────────────

function updateRentRangeHint(type) {
  const hint = document.getElementById('rent-range-hint');
  if (!hint) return;
  const range = RENTAL_RENT_RANGES[type];
  if (range) {
    hint.textContent = 'Estimated range: $' + Math.round(range.low / 1000) + 'k – $' + Math.round(range.high / 1000) + 'k/yr';
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
      }, 400);
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
  updateScrollPadding();
}

// ─── Scroll padding — fix content hidden under sticky nav (item 2) ───────────

function updateScrollPadding() {
  const nav    = document.querySelector('.nav');
  const banner = document.getElementById('dev-mode-banner');
  if (!nav) return;
  const bannerH = (banner && banner.style.display !== 'none') ? banner.offsetHeight : 0;
  document.documentElement.style.scrollPaddingTop = (nav.offsetHeight + bannerH) + 'px';
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

// ─── First-launch onboarding ──────────────────────────────────────────────────

function initOnboarding() {
  if (hasSelectedMarkets()) return;
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
      setDevTier(name);  // writes localStorage.tier; no reload
      // Update badge text live on all tabs
      document.querySelectorAll('.tier-badge').forEach(b => {
        b.textContent = getActiveTier().toUpperCase();
      });
      // Re-render market slots (slot count may change)
      renderMarketSlots('flip-slots',   'flip');
      renderMarketSlots('rental-slots', 'rental');
      applyTierToUI();
      updateDevModeIndicator();
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
  // market picker
  pickerSelectRegion,
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
initGeolocation();
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
