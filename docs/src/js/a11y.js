// ─── Accessibility helpers (native-readiness wave, local) ───────────────────
// A few list rows are <div role="button" tabindex="0" onclick=…> (the repair
// tiers, the market-picker rows). A real <button> would be the better long-term
// markup, but those rows carry the design wave's styling, so this wave makes
// them reachable without restyling: Tab reaches them (tabindex), screen readers
// call them buttons (role), and Enter / Space activate them here — the same
// keys a native button answers to. Native buttons, links and form fields are
// never touched. Web and app alike; no data is read or written.
export function activatesRowButton(e) {
  if (!e || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return false;
  const el = e.target;
  if (!el || !el.getAttribute || el.getAttribute('role') !== 'button') return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}
let _on = false;
export function initA11y(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (_on || !d || !d.addEventListener) return false;
  _on = true;
  d.addEventListener('keydown', (e) => {
    if (!activatesRowButton(e)) return;
    e.preventDefault();                  // Space would otherwise scroll the page
    e.target.click();
  });
  return true;
}
