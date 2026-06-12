# Spec — Cleanup + Theme Swap + CPC Funding Bridge
**Prepared for Claude Code | Cowork-authored 2026-06-12**
**One session, three parts, in order. App lives in `docs/` (ignore any stale `public/` references in older docs).**
**Hand-off line for A-Aron:** "Read SPEC_THEME_AND_FUNDING.md and build it."

---

## Part 0 — Repo cleanup (defects from QA_PHASE1_ADDENDUM_REPORT.md)

0.1 **Canonical mark:** A-Aron's decision: **( ) ChatGPT mark / ( ) clearpath-mark-transparent.png** ← he checks one before handoff. If transparent: copy `Logo/clearpath-mark-transparent.png` over `docs/icons/clearpath-mark.png` (Rev 6b as written).
0.2 **Regenerate PWA icons:** from the canonical mark produce `docs/icons/icon-192.png` (192×192) and `docs/icons/icon-512.png` (512×512, with ~15% safe-zone padding for maskable). manifest.json already references these names — no manifest edit needed.
0.3 **Bump `docs/version.json`** → `{ "version": "3.2.0", "released": "<today>" }`.
0.4 **Commit everything** (pending deletions, new Logo files, specs, this work): message `Phase 1 close-out: icons, theme, CPC funding bridge`.

## Part 1 — Theme swap: lime → CPC green (per CPC_INTEGRATION_SPEC palette decision)

The codebase is well-tokenized; this is small. Canonical accent: **`#22c55e`** (match the constant the CPC site consolidated on).

1.1 `docs/src/css/styles.css` line 5: `--accent:#22c55e; --accent-dim:rgba(34,197,94,0.12);` (keep `--accent-text:#0a0a0a` — verify contrast of dark text on #22c55e buttons; if muddy, switch `--accent-text` to `#ffffff` for buttons only).
1.2 `styles.css` line 383 `.funding-icon{background-color:#b8ff57…}` → `var(--accent)`.
1.3 `docs/src/js/clearpath.js` lines 109 & 128: inline `background-color:#b8ff57` → remove inline style entirely (the `.funding-icon` class now covers it).
1.4 `docs/favicon.svg`: `fill="#b8ff57"` → `#22c55e`.
1.5 **Hot Deal verdict exception (per integration spec):** the lime may survive ONLY as the Hot Deal verdict highlight. Add `--verdict-hot:#b8ff57;` to :root and point the Hot Deal verdict style at it. A-Aron eyeballs both options post-build; if green wins there too, set `--verdict-hot` to `var(--accent)` — one-line revert.
1.6 Add "Powered by Clear Path Capital" footer: small muted text + `Logo/ClearPath.png` wordmark (copy a compressed <50KB version into `docs/icons/`), linking to https://clearpathcapfunding.com/?src=dealscreener. Place at the bottom of the app shell in `index.html`, styled subtle (11px, var(--muted)).
1.7 manifest.json `theme_color`/`background_color` stay `#0a0a0a` (correct as-is).

**Verify:** hard reload → no lime anywhere except (possibly) Hot Deal verdict; buttons legible; footer renders on all four tabs.

## Part 2 — CPC funding bridge (implements Deal Screener side of CPC_INTEGRATION_SPEC.md)

Current behavior (`clearpath.js`): copies clipboard summary, opens bare `https://clearpathcapfunding.com/`. Upgrade to pre-filled URL; CPC site already implements the receiving side (Edit 7, live).

2.1 New `docs/src/js/funding.js`:
```js
import { getActiveTier } from './tiers.js';

const CPC_BASE = 'https://clearpathcapfunding.com/';

// deal: normalized field object; returns full pre-fill URL per CPC_INTEGRATION_SPEC contract
export function buildCpcUrl(deal) {
  const p = new URLSearchParams();
  p.set('src', 'dealscreener');
  p.set('tier', getActiveTier());            // starter | investor | pro
  const map = { pp:'pp', rehab:'rehab', arv:'arv', loan:'loan', addr:'addr',
                city:'city', state:'state', ptype:'ptype', purpose:'purpose', exit:'exit' };
  for (const [k, param] of Object.entries(map)) {
    const v = deal[k];
    if (v !== undefined && v !== null && v !== '') p.set(param, String(v));
  }
  return CPC_BASE + '?' + p.toString() + '#submit';
}

// CPC published box: loan ≤ 90% LTC AND ≤ 70% ARV AND $150K–$5M
export function qualifiesForCpc({ loan, ltc, arv }) {
  if (!loan || loan < 150000 || loan > 5000000) return false;
  if (ltc !== undefined && ltc > 0.90) return false;
  if (arv && loan / arv > 0.70) return false;
  return true;
}
```
2.2 `clearpath.js`: build the deal object from the same results the summary builders already use (flip: pp=ask, rehab=rep, arv=arv, loan=computed max loan, purpose='flip', exit='sale'; rental/STR: purpose='rental'/'str', exit='hold'). Replace `window.open(CPC_URL,…)` with `window.open(buildCpcUrl(deal),…)`. **Keep the clipboard summary** exactly as-is (fallback per spec).
2.3 Numbers raw (no commas/$, round to integer). Address URL-encoding is handled by URLSearchParams — do not pre-encode.
2.4 Gate button visibility with `qualifiesForCpc` where the button is injected (flip + rental). Non-qualifying deals: hide button (no teaser, no explanation — analyzer stays neutral).
2.5 Pipeline tab: saved deals that qualify get the same button via the same code path.

**Verify (manual + console):**
1. Flip deal, qualifying → button visible; click → new tab URL contains `src=dealscreener&tier=starter&pp=…&arv=…#submit`; CPC form pre-fills and scrolls to submit.
2. `setTier('pro')` → URL `tier=pro`; CPC email summary shows `[Pro — Dedicated Broker Requested]` source line.
3. Loan $100K (under box) → no button.
4. Address with spaces/# → arrives intact in CPC form.
5. Clipboard summary still copies on click.

## Out of scope (do NOT build)
GitHub Pages deploy (A-Aron runbook exists), auth/backend, Stripe, LTR/BRRR analyzers, custom market region.
