// Wave 5 · test-process-only module remap (plan v1.1 C-2): substitutes the
// supabaseClient module INSIDE THE NODE TEST PROCESS via a loader hook.
// Nothing under docs/ carries any test seam — a browser user cannot invoke or
// reach any of this. Usage:
//   node --import ./tests/_hooks/register-stubs.mjs tests/auth.test.mjs
//   node --import ./tests/_hooks/register-stubs.mjs tests/share.test.mjs
import { register } from 'node:module';
register(new URL('./stub-loader.mjs', import.meta.url));
