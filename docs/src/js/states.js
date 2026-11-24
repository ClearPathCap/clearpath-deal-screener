// ─── States — one empty / loading / error component (design-system wave) ──────
// Every surface that can be empty, loading or failed renders through these two
// builders, so the three states look and behave the same everywhere:
//   · stateHtml  — icon, optional title, body, optional ONE action (primary,
//                  wraps on a phone — never wider than its column);
//   · skeletonHtml — placeholder cards while data loads (announced once to
//                  screen readers; the shimmer stops under reduced motion).
// Builders return markup only; callers own when each state applies. Every
// string passed in is a trusted literal from the calling module (never user or
// server text), so no escaping happens here.

export function stateHtml({ kind = 'empty', icon = '', title = '', body = '', action = null, live = false } = {}) {
  const role = live || kind !== 'empty' ? ' role="status"' : '';
  return `<div class="state state--${kind}"${role}>`
    + (icon ? `<div class="state-icon" aria-hidden="true">${icon}</div>` : '')
    + (title ? `<div class="state-title">${title}</div>` : '')
    + (body ? `<p class="state-body">${body}</p>` : '')
    + (action ? `<button type="button" class="btn btn--${action.kind || 'primary'} state-action" onclick="${action.onclick}">${action.label}</button>` : '')
    + '</div>';
}

export function skeletonHtml({ cards = 3, label = 'Loading' } = {}) {
  const card = '<div class="skeleton-card" aria-hidden="true"><div class="skeleton-line w-60"></div><div class="skeleton-line w-40"></div><div class="skeleton-line w-80"></div></div>';
  return `<div class="skeleton-list" role="status"><span class="sr-only">${label}</span>${card.repeat(Math.max(1, cards))}</div>`;
}
