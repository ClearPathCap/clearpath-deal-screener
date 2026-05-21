// ─── App entry — page nav, toast, modal, init ─────────────────────────────────

import { analyzeFlip, setFlipPreset, resetFlip }         from './flip.js';
import { analyzeRental, setRentalPreset, resetRental }   from './rental.js';
import { setTier, calcRepair, useRepairEstimate }         from './repair.js';
import { saveDeal as _saveDeal, renderPipeline,
         filterPipeline, toggleDeal,
         requestDelete, confirmDelete }                   from './pipeline.js';
import { openShareApp, shareDeal }                        from './share.js';
import { openInstall, triggerInstall, initInstallHint }  from './install.js';
import { initGeolocation, RENTAL_RENT_RANGES }           from './markets.js';
import { initCurrencyInputs, parseComma }               from './format.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
window.showToast = showToast;

// ─── Beginner / Pro Mode ─────────────────────────────────────────────────────

export function isBeginnerMode() {
  return localStorage.getItem('beginner_mode') === '1';
}

function initBeginnerMode() {
  if (isBeginnerMode()) {
    document.body.classList.add('beginner-mode');
    const toggle = document.getElementById('beginner-toggle');
    if (toggle) toggle.checked = true;
  }
}

function toggleBeginnerMode(checked) {
  if (checked) {
    localStorage.setItem('beginner_mode', '1');
    document.body.classList.add('beginner-mode');
  } else {
    localStorage.removeItem('beginner_mode');
    document.body.classList.remove('beginner-mode');
  }
}

// ─── Carrying cost total display (Section 5f) ─────────────────────────────────

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

// ─── Self-manage toggle (Section 6b) ─────────────────────────────────────────

function updateSelfManage() {
  const toggle = document.getElementById('self-manage-toggle');
  const field  = document.getElementById('self-manage-field');
  const pmInput = document.getElementById('v-pm');
  const label  = document.getElementById('self-manage-label');
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

// ─── Save deal with sticky state (Section 5g) ────────────────────────────────

function saveDeal(type) {
  _saveDeal(type);
  // Turn save button green "Saved ✓" and mark fields as clean
  const btn = document.getElementById(type + '-save-btn');
  if (btn) {
    btn.textContent = 'Saved ✓';
    btn.classList.add('saved');
  }
  // Watch for any field change to revert button to unsaved state
  const page = document.getElementById('page-' + (type === 'flip' ? 'flip' : 'rental'));
  const handler = () => {
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    page.removeEventListener('input', handler);
    page.removeEventListener('change', handler);
  };
  page.addEventListener('input', handler);
  page.addEventListener('change', handler);
}

// ─── Clear & New Deal — full reset (Section 5h / 6) ─────────────────────────

function clearNewDeal(type) {
  if (type === 'flip') {
    // Clear all input fields
    ['f-addr','f-ask','f-arv','f-rep','sqft'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; if (el.dataset) delete el.dataset.userEdited; }
    });
    document.getElementById('f-hold').value   = 5;
    document.getElementById('f-cc1').value    = 2;
    document.getElementById('f-cc2').value    = 5;
    document.getElementById('f-carry').value  = '900';
    document.getElementById('f-target').value = '40,000';
    document.getElementById('self-reno').checked = true;
    // Clear results
    resetFlip();
    // Reset preset to Charlotte
    document.querySelectorAll('#page-flip .preset').forEach(p => p.classList.remove('active'));
    document.querySelector('#page-flip .preset[data-tier="free"]').classList.add('active');
    // Reset save button
    const btn = document.getElementById('flip-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    document.getElementById('flip-deal-name').value = '';
    document.getElementById('flip-notes').value     = '';
    // Reset repair card
    calcRepair();
    updateCarryTotal();
  } else {
    // Clear all STR input fields
    ['v-addr','v-price','v-rent'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('v-down').value    = 20;
    document.getElementById('v-occ').value     = 65;
    document.getElementById('v-mgmt').value    = 15;
    document.getElementById('v-pm').value      = 0;
    document.getElementById('v-tax').value     = '5,500';
    document.getElementById('v-maint').value   = '3,000';
    document.getElementById('v-furnish').value = '15,000';
    document.getElementById('v-target').value  = 6;
    document.getElementById('self-manage-toggle').checked = true;
    updateSelfManage();
    // Clear results
    resetRental();
    // Reset preset to Ocean Lakes
    document.querySelectorAll('#page-rental .preset').forEach(p => p.classList.remove('active'));
    document.querySelector('#page-rental .preset[data-tier="free"]').classList.add('active');
    // Reset save button
    const btn = document.getElementById('rental-save-btn');
    if (btn) { btn.textContent = 'Save'; btn.classList.remove('saved'); }
    document.getElementById('rental-deal-name').value = '';
    document.getElementById('rental-notes').value     = '';
    // Reset rent range hint
    const hint = document.getElementById('rent-range-hint');
    if (hint) hint.style.display = 'none';
  }
}

// ─── Tier: locked preset click intercept (Section 7) ─────────────────────────

function handleLockedPreset(name) {
  document.getElementById('upgrade-modal-title').textContent = 'Unlock ' + name;
  document.getElementById('upgrade-modal-body').textContent  =
    'Unlock ' + name + ' and all Pro markets with Deal Screener Pro.';
  openModal('modal-upgrade');
}

// Wrap setFlipPreset and setRentalPreset to intercept locked presets
function setFlipPresetWrapped(type, el) {
  if (el.dataset.tier === 'pro') {
    const name = el.textContent.replace('🔒','').trim();
    handleLockedPreset(name);
    return;
  }
  setFlipPreset(type, el);
}

// ─── Rent range hint display (Section 6d) ────────────────────────────────────

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

// Combined: lock check + preset load + hint update
function setRentalPresetWithHint(type, el) {
  if (el.dataset.tier === 'pro') {
    const name = el.textContent.replace('🔒','').trim();
    handleLockedPreset(name);
    return;
  }
  setRentalPreset(type, el);
  updateRentRangeHint(type);
}

// ─── Required field validation (Section 6e) ──────────────────────────────────

function validateRequiredFields(type) {
  // Called from analyzeFlip/analyzeRental wrappers (not yet — validation done inline)
  // This helper highlights empty required fields
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

// Wrap analyze functions with validation
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

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); });
});

// ─── Expose globals (called from inline HTML onclick handlers) ────────────────

Object.assign(window, {
  // nav
  showPage,
  // modals
  openModal,
  closeModal,
  // flip — use validated wrapper for analyze, wrapped for locked presets
  analyzeFlip: analyzeFlipValidated,
  setFlipPreset: setFlipPresetWrapped,
  resetFlip,
  // rental — use validated wrapper for analyze, wrapped for locked presets
  analyzeRental: analyzeRentalValidated,
  setRentalPreset: setRentalPresetWithHint,
  resetRental,
  // repair
  setTier,
  calcRepair,
  useRepairEstimate,
  updateSelfReno: calcRepair, // alias — called by self-reno toggle onchange
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
  // beginner mode
  toggleBeginnerMode,
  // UX
  updateCarryTotal,
  updateSelfManage,
  clearNewDeal,
});

// ─── Init ─────────────────────────────────────────────────────────────────────

initInstallHint();
initGeolocation();
initBeginnerMode();
initCurrencyInputs();

// Mark f-rep as user-edited when they type in it (so auto-fill stops overriding)
const repField = document.getElementById('f-rep');
if (repField) {
  repField.addEventListener('input', () => { repField.dataset.userEdited = '1'; });
  repField.addEventListener('focus', () => { repField.classList.remove('auto-filled'); });
}
// Show rent range for default Ocean Lakes preset on STR tab load
updateRentRangeHint('ocean-lakes');
