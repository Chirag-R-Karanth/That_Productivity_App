/**
 * `@prodapp/shared-types` is built with `emitDeclarationOnly`, so it ships no
 * JavaScript. A backend `import { SOME_CONST }` from it type-checks perfectly
 * and then crashes the container at boot with ERR_MODULE_NOT_FOUND — the build
 * stays green, so only a running image catches it.
 *
 * This runs as part of the backend build and fails on any value import.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const distDir = new URL('../dist/', import.meta.url).pathname;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (extname(full) !== '.js') continue;
    const source = readFileSync(full, 'utf8');
    // A type-only import is erased by tsc, so anything left is a real one.
    for (const match of source.matchAll(/(?:import|export)[^'"]*from\s*['"](@prodapp\/shared-types)['"]/g)) {
      offenders.push(`${full}: ${match[0]}`);
    }
  }
}

walk(distDir);

if (offenders.length > 0) {
  console.error('Runtime import(s) of @prodapp/shared-types found in the build:');
  for (const o of offenders) console.error(`  ${o}`);
  console.error('\nImport the type with `import type` and put any runtime constants');
  console.error('in src/lib/timetableKinds.ts (or another backend module).');
  process.exit(1);
}

console.log('no runtime imports of @prodapp/shared-types in dist');
