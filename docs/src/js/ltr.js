// ─── Long-Term Rental (LTR / DSCR) analyzer ───────────────────────────────────
// DOM glue over the shared, tested finance engine (finance.js). Monthly-lease,
// DSCR-led — the funnel into Clear Path's DSCR rental-loan product. Mirrors
// rental.js (STR) conventions: l-* field IDs, getLtrMarket regional fallback,
// lastLtrResult, maybeShowFundingButton reuse.

import { fmt, pct, cClass, buildMetrics, buildRows } from './format.js';
import { computeLtr, ltrVerdict, mosLabel } from './finance.js';
import { LTR_MARKETS, ALL_MARKETS } from './markets.js';
import { maybeShowFundingButton } from './clearpath.js';

// Regional rent/vacancy fallback when a slug has no city-level LTR row.
const LTR_REGIONAL_DEFAULTS = {
  'Southeast':     { rent2br: 1500, vacancyRate: 0.06, taxRate: 0.010 },
  'South Central': { rent2br: 1450, vacancyRate: 0.07, taxRate: 0.018 },
  'Midwest':       { rent2br: 1300, vacancyRate: 0.06, taxRate: 0.016 },
  'Mountain West': { rent2br: 1700, vacancyRate: 0.06, taxRate: 0.007 },
  'Pacific':       { rent2br: 2100, vacancyRate: 0.05, taxRate: 0.009 },
  'Northeast':     { rent2br: 1700, vacancyRate: 0.05, taxRate: 0.020 },
};
const LTR_NATIONAL_DEFAULT = LTR_REGIONAL_DEFAULTS['Southeast'];

export function getLtrMarket(slug) {
  if (LTR_MARKETS[slug]) return LTR_MARKETS[slug];
  const entry  = ALL_MARKETS.find(m => m.id === slug);
  const region = entry?.region || 'Southeast';
  return LTR_REGIONAL_DEFAULTS[region] || LTR_NATIONAL_DEFAULT;
}

let lastLtrResult = null;
export function getLastLtrResult() { return lastLtrResult; }

// Field readers — return undefined when blank so finance.js applies its defaults.
const elv = id => document.getElementById(id);
function numOpt(id) { const el = elv(id); if (!el) return undefined; const v = el.value.trim(); return v === '' ? undefined : +v.replace(/,/g, ''); }
function moneyOpt(id) { return numOpt(id); }

export function setLtrPreset(slug, el) {
  if (el) el.classList.add('slot-active');
  const m = getLtrMarket(slug);
  const rentEl = elv('l-rent');
  const vacEl  = elv('l-vac');
  const taxEl  = elv('l-tax');
  // Prefill only when the field is empty or the user hasn't edited it this session.
  if (rentEl && m.rent2br && !rentEl.dataset.userEdited) rentEl.value = Math.round(m.rent2br).toLocaleString();
  if (vacEl && m.vacancyRate != null && !vacEl.dataset.userEdited) vacEl.value = Math.round(m.vacancyRate * 100);
  const price = moneyOpt('l-price');
  if (taxEl && !taxEl.dataset.userEdited && price && m.taxRate != null) {
    taxEl.value = Math.round(price * m.taxRate).toLocaleString();
  }
}

export function analyzeLtr() {
  const price = moneyOpt('l-price');
  const rent  = moneyOpt('l-rent');
  if (!price || !rent) return; // validation handled by wrapper in main.js

  const selfManage = elv('l-self-manage-toggle')?.checked;
  const input = {
    addr:  elv('l-addr')?.value.trim() || '',
    price,
    rentMo: rent,
    down:   numOpt('l-down'),
    vac:    numOpt('l-vac'),
    tax:    moneyOpt('l-tax'),
    ins:    moneyOpt('l-ins'),
    hoa:    moneyOpt('l-hoa'),
    maint:  numOpt('l-maint'),
    pm:     numOpt('l-pm'),
    selfManage,
    capex:  numOpt('l-capex'),
    rate:   numOpt('l-rate'),
    amort:  numOpt('l-amort'),
    points: numOpt('l-points'),
    cc:     numOpt('l-cc'),
    target: numOpt('l-target'),
    ptype:  elv('l-ptype')?.value || 'SFR',
  };

  const m = computeLtr(input);
  const { cls, verdict, vsub } = ltrVerdict(m);
  const dscrText = m.dscr === null ? 'n/a' : m.dscr.toFixed(2);
  const rateDisp = (input.rate == null ? 7.25 : input.rate) + '%';
  const pm = selfManage ? 0 : (input.pm == null ? 8 : input.pm);
  const vacPct = input.vac == null ? 5 : input.vac;

  elv('ltr-verdict').className = 'verdict ' + cls;
  elv('lvtag').textContent   = cls === 'hot' ? 'STRONG SIGNAL' : cls === 'warm' ? 'NEEDS REVIEW' : 'NOT A DEAL';
  elv('lvlabel').textContent = verdict;
  elv('lvsub').textContent   = vsub;

  const mos = mosLabel(m.marginOfSafety);
  elv('ltr-metrics').innerHTML = buildMetrics([
    { label: 'DSCR',             val: dscrText,           cls: m.dscr === null ? 'good' : m.dscr >= 1.25 ? 'good' : m.dscr >= 1.0 ? 'warn' : 'bad' },
    { label: 'Cash-on-Cash',     val: pct(m.coc),         cls: cClass(m.coc, m.target, m.target * 0.6) },
    { label: 'Cap Rate',         val: pct(m.capRate),     cls: cClass(m.capRate, 6, 4.5) },
    { label: 'Monthly Cash Flow',val: fmt(m.cashFlowMo),  cls: cClass(m.cashFlowMo, 200, 0) },
    { label: 'Margin of Safety', val: mos.label,          cls: mos.cls },
  ]);

  const onePctPass = m.onePctRule >= 1.0;
  const rows = [
    { l: 'Gross scheduled rent (annual)',                                        v: fmt(m.rentYr) },
    { l: 'Effective gross income (' + vacPct + '% vacancy)',                     v: fmt(m.EGI) },
    { l: 'Property management' + (pm > 0 ? ' (' + pm + '%)' : ' (self)'),        v: pm > 0 ? '–' + fmt(m.EGI * (pm / 100)) : '$0' },
    { l: 'Maintenance reserve (' + (input.maint == null ? 5 : input.maint) + '%)', v: '–' + fmt(m.rentYr * ((input.maint == null ? 5 : input.maint) / 100)) },
    { l: 'Property taxes',                                                       v: '–' + fmt(input.tax || 0) },
    { l: 'Insurance',                                                            v: '–' + fmt(input.ins || 0) },
    ...((input.hoa || 0) > 0 ? [{ l: 'HOA', v: '–' + fmt((input.hoa || 0) * 12) }] : []),
    { l: 'Net operating income',                                                 v: fmt(m.NOI) },
    { l: 'Annual debt service (' + rateDisp + ')',                               v: '–' + fmt(m.debtYr) },
    { l: 'CapEx reserve (' + (input.capex == null ? 5 : input.capex) + '%, below NOI)', v: '–' + fmt(m.capexRes) },
    { l: 'Net cash flow (annual)', v: fmt(m.cashFlowYr), tot: true, color: m.cashFlowYr >= 0 ? 'var(--accent)' : 'var(--danger)' },
    { l: 'Net cash flow (monthly)',                                             v: fmt(m.cashFlowMo) },
    { l: 'DSCR (NOI ÷ debt service)',                                           v: dscrText },
    { l: 'Cap rate (NOI ÷ price)',                                              v: pct(m.capRate) },
    { l: '1% rule (rent ÷ price)',                                              v: m.onePctRule.toFixed(2) + '% ' + (onePctPass ? '· pass' : '· watch') },
    { l: 'Gross rent multiplier',                                              v: (Math.round(m.grm * 10) / 10) + 'x' },
    { l: 'Cash to close (down + points + closing)',                            v: fmt(m.cashToClose) },
    { l: 'Margin of safety (stress: rent −5%, vacancy +3pts, rate +0.5%)',     v: mos.label },
  ];
  elv('ltr-breakdown').innerHTML = buildRows(rows);

  lastLtrResult = {
    type: 'ltr', addr: input.addr, price: m.price,
    down: input.down == null ? 20 : input.down,
    rent, vac: vacPct, tax: input.tax || 0, ins: input.ins || 0, hoa: input.hoa || 0,
    maint: input.maint == null ? 5 : input.maint, pm, capex: input.capex == null ? 5 : input.capex,
    rate: input.rate == null ? 7.25 : input.rate, amort: input.amort == null ? 30 : input.amort,
    points: input.points == null ? 1 : input.points, cc: input.cc == null ? 2 : input.cc,
    ptype: input.ptype, target: m.target,
    rentYr: m.rentYr, EGI: m.EGI, NOI: m.NOI, capRate: m.capRate, loan: m.loan,
    debtYr: m.debtYr, capexRes: m.capexRes, cashFlowYr: m.cashFlowYr, cashFlowMo: m.cashFlowMo,
    dscr: m.dscr, downAmt: m.downAmt, cashToClose: m.cashToClose, coc: m.coc,
    onePctRule: m.onePctRule, grm: m.grm, ltv: m.ltv, marginOfSafety: m.marginOfSafety,
    verdict, cls, hot: cls === 'hot',
  };

  const r = elv('ltr-results');
  r.style.display = 'block';
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });

  maybeShowFundingButton(lastLtrResult);
}

export function resetLtr() {
  const r = elv('ltr-results');
  if (r) r.style.display = 'none';
  const notes = elv('ltr-notes'); if (notes) notes.value = '';
  const btn = elv('ltr-funding-btn'); if (btn) btn.innerHTML = '';
  lastLtrResult = null;
}
