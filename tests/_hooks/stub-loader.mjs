// Resolve hook: any import of docs/src/js/supabaseClient.js (which pulls
// supabase-js from a CDN — unreachable and unwanted in Node) resolves to the
// scripted stub instead. Everything else resolves normally, so auth.js,
// tiers.js, storage.js, share.js etc. under test are the REAL shipped modules.
const STUB = new URL('../_stubs/supabaseClient.stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('/supabaseClient.js') || specifier === './supabaseClient.js') {
    return { url: STUB, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

// The shipped app files are ESM served as .js by GitHub Pages; Node defaults
// bare .js to CommonJS. Force module format for docs/src/js/ INSIDE THE TEST
// PROCESS only — no package.json or repo-layout change ships anywhere.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
  if (url.includes('/docs/src/js/') && url.endsWith('.js')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
