// Test-process-only loader for tests/f7sdk.test.mjs (lane-2 review F7). It points
// docs/src/js/supabaseClient.js at a REAL vendored-SDK client whose URL is a dead
// loopback address and whose fetch is the test's in-memory fake, so the SDK's own
// auth events (SIGNED_IN on tab-visible, TOKEN_REFRESHED) drive the shipped
// auth.js + marketSync.js with no network. It also loads the vendored SDK as ESM
// (the repo's package.json says "type": "commonjs"). Nothing under docs/ changes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CLIENT = new URL('../_stubs/supabaseClient.realsdk.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('/supabaseClient.js') || specifier === './supabaseClient.js') {
    return { url: CLIENT, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.includes('/docs/vendor/') && url.endsWith('.js')) {
    return { format: 'module', source: await readFile(fileURLToPath(url), 'utf8'), shortCircuit: true };
  }
  return nextLoad(url, context);
}
