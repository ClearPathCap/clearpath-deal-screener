// ─── App entry — page nav, toast, modal, init ─────────────────────────────────

import { analyzeFlip, setFlipPreset, resetFlip }         from './flip.js';
import { analyzeRental, setRentalPreset, resetRental }   from './rental.js';
import { setRepairTier, calcRepair, useRepairEstimate,
         onSelfRenoToggle }                              from './repair.js';
import { saveDeal as _saveDeal, renderPipeline,
         filterPipeline, toggleDeal,
         requestDelete, confirmDelete }                   from './pipeline.js';
import { openShareApp, shareDeal }                        from './share.js';
import { openInstall, triggerInstall, initInstallHint }  from './install.js';
import { initGeolocation, RENTAL_RENT_RANGES }           from './markets.js';
import { initCurrencyInputs, parseComma }               from './format.js';
import { handlePipelineFundingClick }                    from './clearpath.js';
import { ALL_MARKETS, getActiveTier, isDevMode,
         setDevTier, hasSelectedMarkets, getSelectedMarkets,
         setSelectedMarkets, canChangeMarkets,
         nextChangeDate, isMarketUnlocked }              from './tiers.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
window.showToast = showToast;

// ─── Guide Mode (Beginner / Pro) ──────────────────────────────────────────────

export function isBeginnerMode() {
  return localStorage.getItem('guideMode') === 'beginner';
}

function initGuideMode() {
  const mode = localStorage.getItem('guideMode') || 'pro';
  if (mode === 'beginner') {
    document.body.classList.add('beginner-mode');
    document.querySelectorAll('.beginner-toggle-input').forEach(t => t.checked = true);
  }
}

function toggleGuideMode(checked) {
  if (checked) {
    localStorage.setItem('guideMode', 'beginner');
    document.body.classList.add('beginner-mode');
  } else {
    localStorage.setItem('guideMode', 'pro');
    document.body.classList.remove('beginner-mode');
  }
  // Sync all toggle inputs (flip + rental)
  document.querySelectorAll('.beginner-toggle-input').forEach(t => {
    t.checked = checked;
  });
}

// ─── Carrying cost total display ──────────────────────────────────────────────

function updateCarryTotal() {
  const carry = parseComma(document.getElementById('f-carry').value);
  const hold  = +document.getElementById('f-hold').value  || 0;
  const row   = document.getElementById('carry-total-row');
  const txt   = document.getElementById('carry-total-text');
  if (carry && hold) {
    const total = carry * hold;
    txt.textContent = '$' + carry.toLocaleString() + '/mo × ' + hold + ' mo = $' + total.toLocaleString();
    row.style.display = 'block';
  } else {
    row.style.display = 'none';
  }
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
    pmInput.value = '';
    label.textContent = 'Hired Property Manager';
  }
}

// ─── Save deal with sticky state ──────────────────────────────────────────────

function saveDeal(type) {
  _saveDeal(type);
  const btn = document.getElementById(type + '-save-btn');
  if (btn) {
    btn.textContent = 'Saved ✓';
    btn.classList.add('saved');
  }
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
      if (el) {
        el.value = '';
        delete el.dataset.userEdited;
        delete el.dataset.autoFilled;
      }
    });
    document.getElementById('f-hold').value   = 5;
    document.getElementById('f-cc1').value    = 2;
    document.getElementById('f-cc2').value    = 5;
    document.getElementById('f-carry').value  = '900';
    document.getElementById('f-target').value = '40,000';
    document.getElementById('self-reno').checked = true;
    resetFlip();
    renderFlipPresets();
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
    document.getElementById('v-down').value    = 20;
    document.getElementById('v-occ').value     = 65;
    document.getElementById('v-mgmt').value    = 3;
    document.getElementById('v-pm').value      = 0;
    document.getElementById('v-tax').value     = '5,500';
    document.getElementById('v-maint').value   = '3,000';
    document.getElementById('v-furnish').value = '15,000';
    document.getElementById('v-target').value  = 6;
    document.getElementById('self-manage-toggle').checked = true;
    updateSelfManage();
    resetRental();
    renderRentalPresets();
    const btn = document.getElementById('rental-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    document.getElementById('rental-deal-name').value = '';
    document.getElementById('rental-notes').value     = '';
    const hint = document.getElementById('rent-range-hint');
    if (hint) hint.style.display = 'none';
  }
}

// ─── Dynamic preset rendering ─────────────────────────────────────────────────

function renderFlipPresets() {
  const container = document.getElementById('flip-presets');
  if (!container) return;

  const selected = getSelectedMarkets();
  const flipMarkets = ALL_MARKETS.filter(m => m.type === 'flip');

  // Charlotte NC always first and always unlocked
  const ordered = [
    flipMarkets.find(m => m.id === 'charlotte-nc'),
    ...flipMarkets.filter(m => m.id !== 'charlotte-nc' && selected.includes(m.id)),
    ...flipMarkets.filter(m => m.id !== 'charlotte-nc' && !selected.includes(m.id)),
  ].filter(Boolean);

  container.innerHTML = ordered.map((m, i) => {
    const unlocked = isMarketUnlocked(m.id) || m.id === 'charlotte-nc';
    const activeClass = i === 0 ? ' active' : '';
    if (unlocked) {
      return `<button class="preset${activeClass}" onclick="setFlipPreset('${m.id}',this)" data-market-id="${m.id}">${m.label}</button>`;
    } else {
      return `<button class="preset" onclick="handleLockedMarket('${m.label}',this)" data-market-id="${m.id}"><span class="lock-icon">🔒</span> ${m.label}</button>`;
    }
  }).join('');

  // Load first preset values
  const firstPreset = ordered[0];
  const firstEl = container.querySelector('.preset.active');
  if (firstPreset && firstEl) setFlipPreset(firstPreset.id, firstEl);
}

function renderRentalPresets() {
  const container = document.getElementById('rental-presets');
  if (!container) return;

  const selected = getSelectedMarkets();
  const strMarkets = ALL_MARKETS.filter(m => m.type === 'str');

  // Ocean Lakes SC always first and always unlocked
  const ordered = [
    strMarkets.find(m => m.id === 'ocean-lakes-sc'),
    ...strMarkets.filter(m => m.id !== 'ocean-lakes-sc' && selected.includes(m.id)),
    ...strMarkets.filter(m => m.id !== 'ocean-lakes-sc' && !selected.includes(m.id)),
  ].filter(Boolean);

  container.innerHTML = ordered.map((m, i) => {
    const unlocked = isMarketUnlocked(m.id) || m.id === 'ocean-lakes-sc';
    const activeClass = i === 0 ? ' active' : '';
    if (unlocked) {
      return `<button class="preset${activeClass}" onclick="setRentalPreset('${m.id}',this)" data-market-id="${m.id}">${m.label}</button>`;
    } else {
      return `<button class="preset" onclick="handleLockedMarket('${m.label}',this)" data-market-id="${m.id}"><span class="lock-icon">🔒</span> ${m.label}</button>`;
    }
  }).join('');

  // Load first preset values
  const firstPreset = ordered[0];
  const firstEl = container.querySelector('.preset.active');
  if (firstPreset && firstEl) {
    setRentalPreset(firstPreset.id, firstEl);
    updateRentRangeHint(firstPreset.id);
  }
}

// ─── Locked market click intercept ───────────────────────────────────────────

function handleLockedMarket(name) {
  document.getElementById('upgrade-modal-title').textContent = 'Unlock ' + name;
  openModal('modal-upgrade');
}

// Wrap setFlipPreset — locked presets call handleLockedMarket() directly, so no check needed here
function setFlipPresetWrapped(type, el) {
  if (!el) return;
  setFlipPreset(type, el);
}

// ─── Rent range hint ──────────────────────────────────────────────────────────

function updateRentRangeHint(type) {
  const hint = document.getElementById('rent-range-hint');
  if (!hint) return;
  const range = RENTAL_RENT_RANGES[type];
  if (range) {
    hint.textContent = 'Estimated range: $' +
      Math.round(range.low / 1000) + 'k – $' +
      Math.round(range.high / 1000) + 'k/yr';
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
    const el = document.getElementById(f.id);
    if (!el) return;
    const val = el.value.trim();
    const wrap = el.closest('.field');
    let msg = wrap ? wrap.querySelector('.validation-msg') : null;
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

// ─── Header tier badge — tappable, 5-tap dev trigger ─────────────────────────

function initTierBadge() {
  const badges = document.querySelectorAll('.tier-badge');
  let tapCount = 0;
  let tapTimer = null;

  badges.forEach(badge => {
    // Update badge text to reflect active tier
    const tier = getActiveTier();
    badge.textContent = tier === 'investor' ? 'INVESTOR' : tier === 'pro' ? 'PRO' : 'STARTER';
    badge.style.cursor = 'pointer';

    badge.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimer);

      // First tap opens upgrade modal immediately
      if (tapCount === 1) openModal('modal-upgrade');

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
}

// ─── First-launch onboarding ──────────────────────────────────────────────────

function initOnboarding() {
  if (hasSelectedMarkets()) return;
  buildOnboardingGrid();
  openModal('modal-onboarding');
}

// Called from "Change my markets" in upgrade modal
function tryChangeMarkets() {
  if (canChangeMarkets()) {
    closeModal('modal-upgrade');
    onboardingSelected = [];
    buildOnboardingGrid();
    const count = document.getElementById('onboarding-count');
    const btn   = document.getElementById('onboarding-continue');
    if (count) count.textContent = '0 of 2 selected';
    if (btn) btn.disabled = true;
    openModal('modal-onboarding');
  } else {
    const date = nextChangeDate();
    showToast('You can update your Market Regions on ' + date + '. Upgrade to Investor for flexible market access.');
  }
}

function buildOnboardingGrid() {
  const grid = document.getElementById('onboarding-market-grid');
  if (!grid) return;
  grid.innerHTML = ALL_MARKETS.map(m =>
    `<button class="market-chip" data-id="${m.id}" onclick="toggleOnboardingMarket('${m.id}',this)">${m.label}</button>`
  ).join('');
}

let onboardingSelected = [];

function toggleOnboardingMarket(id, el) {
  const idx = onboardingSelected.indexOf(id);
  if (idx >= 0) {
    onboardingSelected.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    if (onboardingSelected.length >= 2) return; // max 2
    onboardingSelected.push(id);
    el.classList.add('selected');
  }
  const count = document.getElementById('onboarding-count');
  const btn   = document.getElementById('onboarding-continue');
  if (count) count.textContent = onboardingSelected.length + ' of 2 selected';
  if (btn) btn.disabled = onboardingSelected.length !== 2;
}

function completeOnboarding() {
  if (onboardingSelected.length !== 2) return;
  setSelectedMarkets(onboardingSelected);
  closeModal('modal-onboarding');
  renderFlipPresets();
  renderRentalPresets();
  showToast('Markets saved — you can change them in 30 days');
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
  setFlipPreset: setFlipPresetWrapped,
  resetFlip,
  // rental
  analyzeRental: analyzeRentalValidated,
  setRentalPreset: setRentalPresetWithHint,
  resetRental,
  // repair
  setTier(name, el) {
    // Routes to dev tier OR repair card tier based on argument
    if (name === 'starter' || name === 'investor' || name === 'pro') {
      setDevTier(name);
    } else {
      setRepairTier(name, el);
    }
  },
  calcRepair,
  useRepairEstimate,
  updateSelfReno: onSelfRenoToggle,
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
  clearNewDeal,
  // market locked click
  handleLockedMarket,
  // onboarding
  toggleOnboardingMarket,
  completeOnboarding,
  tryChangeMarkets,
  // upgrade
  upgradeToInvestor,
  upgradeToPro,
  // pipeline funding (clearpath)
  handlePipelineFundingClick,
});

// ─── Apply tier to UI (guide locks, market locks) ────────────────────────────

function applyTierToUI() {
  const tier = getActiveTier();
  const unlockAll = (tier === 'investor' || tier === 'pro');

  // Guide: hide/show locked overlays based on tier
  document.querySelectorAll('.locked-overlay').forEach(el => {
    el.style.display = unlockAll ? 'none' : '';
  });
  document.querySelectorAll('.locked-content').forEach(el => {
    if (unlockAll) {
      el.style.filter   = 'none';
      el.style.opacity  = '1';
      el.style.pointerEvents = '';
      el.style.userSelect    = '';
    } else {
      el.style.filter   = '';
      el.style.opacity  = '';
      el.style.pointerEvents = '';
      el.style.userSelect    = '';
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

initInstallHint();
initGeolocation();
initGuideMode();
initCurrencyInputs();
updateDevModeIndicator();
initTierBadge();
applyTierToUI();
renderFlipPresets();
renderRentalPresets();
initOnboarding();

// Track manual edits to f-rep so auto-fill stops overriding
const repField = document.getElementById('f-rep');
if (repField) {
  repField.addEventListener('input', () => {
    repField.dataset.userEdited = '1';
    delete repField.dataset.autoFilled;
  });
  repField.addEventListener('focus', () => repField.classList.remove('auto-filled'));
}
