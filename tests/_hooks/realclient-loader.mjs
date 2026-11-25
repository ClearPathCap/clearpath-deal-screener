// Test-process-only hook for tests/native.test.mjs. register-stubs.mjs replaces every
// `…/supabaseClient.js` import with a stub; this hook lets that ONE suite load the REAL
// shipped docs/src/js/supabaseClient.js (imported as `…/supabaseClient.js?real`) and the
// vendored SDK as ES modules, so the web session-storage identity is checked against the
// exact production client options (its fetch is the test's in-memory fake: no network), and
// `…/<module>.js?fresh` to re-evaluate a shipped module (share.js reads isNative() at load).
// Nothing under docs/ changes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  if (url.includes('/docs/src/js/') && /\.js\?fresh(=|$)/.test(url)) {   // a fresh instance of a shipped module (top-level values re-evaluated)
    return { format: 'module', source: await readFile(fileURLToPath(url.split('?')[0]), 'utf8'), shortCircuit: true };
  }
  if (url.includes('/docs/src/js/supabaseClient.js?real')) {
    return { format: 'module', source: await readFile(fileURLToPath(url.split('?')[0]), 'utf8'), shortCircuit: true };
  }
  if (url.includes('/docs/vendor/') && url.endsWith('.js')) {
    return { format: 'module', source: await readFile(fileURLToPath(url), 'utf8'), shortCircuit: true };
  }
  return nextLoad(url, context);
}
