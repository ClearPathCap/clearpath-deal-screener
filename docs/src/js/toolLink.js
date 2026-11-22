// ─── ?tool= deep link (public tool pages → the matching analyzer) ────────────
// The static pages under /risk-evaluation/ and /*-calculator/ link into the app
// as /?tool=<name>. This module maps the name to an analyzer and strips the
// parameter so a refresh or bookmark lands on the app normally. It never
// prefills inputs, never opens a modal and never touches storage.

export const TOOL_TARGETS = Object.freeze({
  flip: Object.freeze({ page: 'flip',   view: null }),
  str:  Object.freeze({ page: 'rental', view: 'str' }),
  ltr:  Object.freeze({ page: 'rental', view: 'ltr' }),
  dscr: Object.freeze({ page: 'rental', view: 'ltr' }),
  brrrr: Object.freeze({ page: 'rental', view: 'brrr' }),
});

// Pure: a location.search string → the target, or null for absent/unknown.
export function parseToolParam(search) {
  let name;
  try { name = new URLSearchParams(search || '').get('tool'); } catch { return null; }
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TOOL_TARGETS, key) ? TOOL_TARGETS[key] : null;
}

// Pure: the search string with only `tool` removed ('' when nothing is left).
export function stripToolParam(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { return search || ''; }
  if (!params.has('tool')) return search || '';
  params.delete('tool');
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

// Browser: read + strip in one step. Returns the target or null.
export function consumeToolLink() {
  let target = null;
  try {
    target = parseToolParam(location.search);
    if (new URLSearchParams(location.search).has('tool')) {
      history.replaceState(null, '', location.pathname + stripToolParam(location.search) + (location.hash || ''));
    }
  } catch { return null; }
  return target;
}
