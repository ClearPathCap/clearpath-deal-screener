# Claude Code — Project Instructions

This file tells Claude Code how to operate inside this repo. Read it before making any changes.

---

## Project context

You are working on **Deal Screener**, a mobile-first PWA for real estate investors, branded under **Clear Path Capital** (private money brokering business owned by Aaron Leach).

Before doing anything substantial, read:
- `PROJECT_BRIEF.md` — what this is, who it's for, business model
- `ROADMAP.md` — phased build plan with checkbox tasks

The current state of the app lives in `v3-reference/deal-screener-v3.html` as a single-file prototype. Your job in Phase 0 is to split this into a proper file structure (described below), preserving exact behavior. After Phase 0, follow the roadmap.

---

## Target file structure

```
clearpath-deal-screener/
├── README.md                  # Public-facing repo intro
├── PROJECT_BRIEF.md           # Business + product context
├── ROADMAP.md                 # Phased task list
├── CLAUDE.md                  # This file
├── .gitignore
├── public/
│   ├── index.html             # Entry point — minimal, references CSS/JS
│   ├── manifest.json          # PWA manifest (replaces inline data URI)
│   ├── version.json           # { "version": "3.1.0", "released": "YYYY-MM-DD" }
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       └── icon-maskable.png
├── src/
│   ├── css/
│   │   └── styles.css         # All styles, one file is fine
│   ├── js/
│   │   ├── main.js            # App entry, page nav, init
│   │   ├── flip.js            # Fix & Flip analyzer
│   │   ├── rental.js          # STR analyzer
│   │   ├── pipeline.js        # Saved deals: render, expand, filter, delete
│   │   ├── repair.js          # Repair cost estimator
│   │   ├── share.js           # Share app + share deal
│   │   ├── install.js         # PWA install logic
│   │   ├── update.js          # Version check + update banner
│   │   ├── format.js          # Number formatting helpers (commas, currency)
│   │   ├── storage.js         # localStorage wrappers
│   │   ├── clearpath.js       # Clear Path Capital integration (qualify + submit)
│   │   └── markets.js         # Market preset data
│   └── partials/              # Optional: HTML chunks if useful
└── deploy.sh                  # Simple bash script: bump version, git push
```

**Why this structure:** Each file has a single concern. New features get a new file, not appended to a 1,000-line blob. CSS stays in one file because there's not enough to justify splitting. No build step — modern browsers handle ES modules natively from `<script type="module">`.

---

## Conventions

### JavaScript
- ES modules (`import` / `export`). Each file in `src/js/` is a module.
- No transpilation, no bundler. Modern Safari and Chrome only (we don't support IE).
- No dependencies unless absolutely necessary. If a feature needs one, raise it as a question first.
- Function names use camelCase. Constants use SCREAMING_SNAKE_CASE.
- Keep DOM access localized — don't sprinkle `document.getElementById` everywhere; centralize selectors per module.

### CSS
- Custom properties for all color, spacing, typography (already in `:root`)
- Mobile-first: base styles target phones, media queries enhance for tablet+
- No framework. No Tailwind. The current vanilla approach is clean and small.
- Maintain the Clear Path color palette: bg `#0a0a0a`, accent `#b8ff57`, text `#f0ede8`.

### HTML
- Semantic where it matters; otherwise pragmatic.
- All interactive elements are tap-target sized (minimum 44×44px).
- Forms have proper `inputmode` attributes (`inputmode="decimal"` for currency).

### Files
- Filenames are lowercase-with-hyphens.
- No file should exceed ~400 lines. Split when it grows past that.

---

## Things that are off-limits without asking first

- Adding a build step (Webpack, Vite, etc.)
- Adding a framework (React, Vue, Svelte)
- Adding dependencies beyond Google Fonts
- Changing the color palette / brand
- Removing existing features
- Adding tracking / analytics scripts beyond what's specified in Phase 2
- Adding service workers (manual update button is the explicit choice)
- Modifying anything outside this repo

If a roadmap item requires one of these, stop and surface the trade-off to Aaron first.

---

## Deploy process

GitHub Pages with the `main` branch serving from `/public`.

`deploy.sh` should:
1. Bump the version in `public/version.json` (semver patch by default)
2. Update `released` date to today
3. `git add -A && git commit -m "deploy: vX.Y.Z" && git push`

When pushed to `main`, GitHub Pages updates automatically (usually 1–2 minutes).

After every deploy, Aaron should tap the "Check for Update" button in the app to verify the new version is detected.

---

## Clear Path Capital integration specifics

The Clear Path intake form lives at `https://clearpathcapfunding.com/#submit`. Inspect its query parameter contract before building the pre-fill link — the current site does not document the URL params publicly, so we may need to coordinate with whoever maintains the Clear Path site, or use a simpler approach (copy a structured summary to clipboard, then navigate the user to the form).

**Default approach for v1 of the integration:**
1. Build a "Submit to Clear Path Capital" button on qualifying deal results
2. On tap: copy a structured deal summary to clipboard + open clearpathcapfunding.com/#submit in a new tab
3. Show a toast: "Deal summary copied — paste into the Additional Notes field"

**Stretch (later):**
- Coordinate with Clear Path site maintainer to accept query params (`?asking=185000&arv=340000&address=...`) and pre-fill the intake form fields directly. This is a much cleaner UX but requires changes to the Clear Path site.

---

## Testing checklist before any deploy

Open the deployed URL in:
- iPhone Safari (Aaron's primary device)
- Android Chrome
- Desktop Chrome
- Desktop Safari

Verify:
- All four tabs work (Fix & Flip, STR, Pipeline, Guide)
- Analyzing a deal produces correct verdict + metrics
- Saving a deal persists across page reload
- Expanding a saved deal shows all fields
- Deleting requires confirmation
- Share menu opens and links work
- Install instructions show correct content per device
- "Check for Update" button works (test by bumping local version then reverting)
- Clear Path CTA appears on qualifying deals and not on others

---

## Communication style with Aaron

- Direct. He doesn't need flattery or hedging.
- When making trade-offs, name them clearly.
- If something on the roadmap is going to be more complex than expected, surface it before starting.
- He has a construction background and runs his own business — he understands "this will take longer because X" better than vague excuses.
- When done with a task, give him: what changed, where, and how to test it. Not a 500-word essay.

---

## Quick reference: current state (v3 prototype)

- Single file: `deal-screener-v3.html`
- ~1,200 lines
- Self-contained (inline manifest, inline icons, inline CSS, inline JS)
- All features working except Phase 1 items in `ROADMAP.md`
- Stored under `v3-reference/` in this repo for reference until Phase 0 split is verified, then can be removed
