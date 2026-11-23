# tools/vendor — build-time vendoring for DealFit (Mobile Phase 0)

The site stays **no-build at runtime**: GitHub Pages serves `docs/` as committed. This folder only *regenerates*
`docs/vendor/`, so the app loads no JavaScript or fonts from a CDN. That covers the Supabase SDK (formerly esm.sh) and
Syne and DM Mono (formerly Google Fonts; `shared.html` also requested Outfit, which no stylesheet ever used, so it is not shipped).

| Output (`docs/vendor/`) | Source |
|---|---|
| `supabase-js-2.112.3.js` | `@supabase/supabase-js@2.112.3` and its transitive code (`@supabase/*-js@2.112.3`, `@supabase/phoenix`, `tslib`, `iceberg-js`), bundled by `esbuild@0.28.2` (ESM, browser, ES2020, minified, legal comments kept) |
| `fonts.css` + `fonts/*.woff2` | `@fontsource-variable/syne@5.3.0`, `@fontsource/dm-mono@5.3.0`. Only the subsets and weights the pages used: Syne 400–800 variable, DM Mono 400/500 |
| `LICENSES/` | The license text of every package above: MIT (Supabase, phoenix, iceberg-js), 0BSD (tslib), SIL OFL 1.1 (fonts) |
| `VENDOR_MANIFEST.json` | Versions, npm integrity and the SHA-256 of every output. There are no timestamps, so rebuilds are byte-stable |

**Regenerate** (Node 20+; needs the npm registry):

```
cd tools/vendor
npm ci
npm run vendor
```

**Verify** that the committed `docs/vendor/` is exactly reproducible:

```
cd tools/vendor
npm ci
npm run verify
```

This rebuilds into a temp dir and fails on any byte difference or unexpected file.

**Upgrading the SDK** is a deliberate change:
1. Bump the exact version in `package.json` and `SUPABASE_VERSION` in `build.mjs`, then run `npm install --save-exact`.
2. Run `npm run vendor`.
3. Update the import path in `docs/src/js/supabaseClient.js` and the pins in `tests/transport.test.mjs` and
   `tests/mobilep0.test.mjs`.
4. Re-run every suite.

`node_modules/` is never committed. `.gitattributes` marks `docs/vendor/**` as `-text` so line-ending conversion can never
change the vendored bytes.
