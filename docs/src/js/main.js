// ─── App entry — page nav, toast, modal, init ─────────────────────────────────

import { analyzeFlip, setFlipPreset, resetFlip }         from './flip.js';
import { analyzeRental, setRentalPreset, resetRental }   from './rental.js';
import { setTier, calcRepair, useRepairEstimate }         from './repair.js';
import { saveDeal, renderPipeline, filterPipeline,
         toggleDeal, requestDelete, confirmDelete }       from './pipeline.js';
import { openShareApp, shareDeal }                        from './share.js';
import { openInstall, triggerInstall, initInstallHint }  from './install.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
window.showToast = showToast;

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
  // flip
  analyzeFlip,
  setFlipPreset,
  resetFlip,
  // rental
  analyzeRental,
  setRentalPreset,
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
});

// ─── Init ─────────────────────────────────────────────────────────────────────

initInstallHint();
