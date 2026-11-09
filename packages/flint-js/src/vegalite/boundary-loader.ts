// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The named boundaries, served from the package rather than the network.
 *
 * A compiled map names a named set's boundaries by their URL on Flint's site
 * (`chart-types/boundaries.ts`), so the spec renders anywhere online. Flint's renderers give Vega a
 * loader that answers those URLs with the copies the package bundles, imported on a map's first
 * draw: a bundler splits each into a chunk of the host's own, served from the host's own origin, and
 * nothing is fetched from a third party. Where a copy cannot load, the URL is fetched as before.
 */

import { BOUNDARY_URLS } from '../chart-types/boundaries';

type Importer = () => Promise<{ default: unknown }>;

// Imported by the package's own name: each is an entry of the published package, which a host's
// bundler resolves and splits off, wherever this module is bundled from.
const worldBankCoarse: Importer = () => import('flint-chart/geo/lazy/world-bank-coarse');
const worldBankMedium: Importer = () => import('flint-chart/geo/lazy/world-bank-medium');
const world110m: Importer = () => import('flint-chart/geo/lazy/world-110m');
const states10m: Importer = () => import('flint-chart/geo/lazy/states-10m');
const countiesAlbers: Importer = () => import('flint-chart/geo/lazy/counties-albers-10m');

const BUNDLED: Record<string, Importer> = {
    [BOUNDARY_URLS.worldBank.coarse]: worldBankCoarse,
    [BOUNDARY_URLS.worldBank.medium]: worldBankMedium,
    [BOUNDARY_URLS.naturalEarth]: world110m,
    [BOUNDARY_URLS.usStates]: states10m,
    [BOUNDARY_URLS.usAlbers]: countiesAlbers,
    // The URLs earlier releases compiled to, where the bundled copy is the same file byte for byte.
    // (Vega's us-10m.json is not us-atlas's states-10m.json: its ids are numbers, so it is fetched.)
    'https://vega.github.io/vega-lite/data/world-110m.json': world110m,
    'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json': countiesAlbers,
};

const loaded = new Map<string, Promise<unknown>>();

/** The bundled topology a named URL stands for, loaded once; undefined for any other URL. */
export function bundledBoundaries(url: string): Promise<unknown> | undefined {
    const load = BUNDLED[url];
    if (!load) return undefined;
    let topology = loaded.get(url);
    if (!topology) {
        topology = load().then((module) => module.default);
        loaded.set(url, topology);
        topology.catch(() => loaded.delete(url));
    }
    return topology;
}

/** A Vega loader as given, answering the named boundaries' URLs from the package. */
export function withBundledBoundaries<L extends { load: (uri: string, options?: any) => Promise<any> }>(loader: L): L {
    const load = loader.load.bind(loader);
    loader.load = (async (uri: string, options?: any) => {
        const bundled = typeof uri === 'string' ? bundledBoundaries(uri) : undefined;
        if (bundled) {
            try {
                const topology = await bundled;
                // A build that leaves the copies out (a one-file app) stands in null for each.
                if (topology) return topology;
            } catch {
                // The package's copy did not load (a host whose bundler left it out): fetch the URL.
            }
        }
        return load(uri, options);
    }) as L['load'];
    return loader;
}
