// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// An app that installs one backend's library builds with `flint-chart/react/<backend>` or
// `flint-chart/interactive/<backend>`: bundlers resolve every import, dynamic ones too, so those
// entries must reach no other backend's library (#155).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rendererFactory } from '../src/interactive/mount';
import type { InteractiveRendererAdapter } from '../src/interactive/types';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const BACKEND_LIBRARIES: Record<string, RegExp> = {
    vegalite: /^vega(-lite|-tooltip)?$/,
    echarts: /^echarts(\/|$)/,
    chartjs: /^chart\.js(\/|$)/,
    plotly: /^plotly\.js/,
};

/** Every package a module reaches through static and dynamic imports, type-only imports aside. */
function reachedPackages(entry: string): Set<string> {
    const packages = new Set<string>();
    const seen = new Set<string>();
    const visit = (file: string): void => {
        if (seen.has(file)) return;
        seen.add(file);
        const text = readFileSync(file, 'utf8');
        const specifiers = [
            ...[...text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
            ...[...text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
            ...[...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
        ];
        for (const specifier of specifiers) {
            if (!specifier.startsWith('.')) {
                packages.add(specifier);
                continue;
            }
            const base = resolve(dirname(file), specifier);
            const target = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base.replace(/\.js$/, '.ts')].find(existsSync);
            if (target) visit(target);
        }
    };
    visit(join(SRC, entry));
    return packages;
}

const reachedBackends = (entry: string): string[] => {
    const packages = [...reachedPackages(entry)];
    return Object.keys(BACKEND_LIBRARIES).filter((backend) => packages.some((name) => BACKEND_LIBRARIES[backend].test(name)));
};

describe('backend entries', () => {
    for (const backend of Object.keys(BACKEND_LIBRARIES)) {
        it(`flint-chart/react/${backend} and flint-chart/interactive/${backend} reach ${backend} alone`, () => {
            expect(reachedBackends(`react/${backend}.ts`)).toEqual([backend]);
            expect(reachedBackends(`interactive/${backend}.ts`)).toEqual([backend]);
        });
    }

    it('the default entries still reach every backend', () => {
        const all = Object.keys(BACKEND_LIBRARIES);
        expect(reachedBackends('react/index.ts')).toEqual(all);
        expect(reachedBackends('interactive/index.ts')).toEqual(all);
    });
});

describe('renderer factories', () => {
    const adapter = {} as InteractiveRendererAdapter;
    const given = () => adapter;

    it('takes the host\'s factory over the entry\'s loader', async () => {
        const loaded = () => adapter;
        await expect(rendererFactory({ chartjs: async () => loaded }, { chartjs: given }, 'chartjs')).resolves.toBe(given);
        await expect(rendererFactory({ chartjs: async () => loaded }, undefined, 'chartjs')).resolves.toBe(loaded);
    });

    it('names the import a missing backend needs', async () => {
        await expect(rendererFactory({ vegalite: async () => given }, undefined, 'plotly'))
            .rejects.toThrow(/createPlotlyInteractiveRenderer.*flint-chart\/plotly\/interactive.*flint-chart\/react\/plotly/);
    });
});
