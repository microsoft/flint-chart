// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCompile } from './compile.js';

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === '-h' || raw[0] === '--help' || raw[0] === '-v' || raw[0] === '--version') {
    const code = await runCompile(raw);
    process.exit(code);
  }
  const argv = raw[0] === 'compile' ? raw.slice(1) : raw;
  const code = await runCompile(argv);
  process.exit(code);
}

const isEntry = process.argv[1] !== undefined && (() => {
  try {
    return resolvePath(process.argv[1]) === resolvePath(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isEntry) {
  main().catch((err) => {
    process.stderr.write(`flint failed: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
