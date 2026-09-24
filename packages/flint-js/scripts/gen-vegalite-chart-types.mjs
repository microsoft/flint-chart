// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node scripts/gen-vegalite-chart-types.mjs [--check]');
}

// Bootstrap from source, as gen-chart-reference does, without requiring dist.
// Keeping the bundle in memory avoids temporary files and platform-specific cleanup.
const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./vegalite-chart-types.ts', import.meta.url))],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
});
const { generateVegaLiteChartTypes } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const output = new URL('../src/vegalite/chart-types.generated.ts', import.meta.url);
const expected = generateVegaLiteChartTypes();
const actual = existsSync(output) ? readFileSync(output, 'utf8').replace(/\r\n/g, '\n') : undefined;
if (args[0] === '--check') {
    if (actual !== expected) {
        throw new Error('Vega-Lite authoring types are stale. Run npm run gen:chart-types -w packages/flint-js.');
    }
} else if (actual !== expected) {
    writeFileSync(output, expected);
}
