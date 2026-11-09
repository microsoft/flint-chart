// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/geo
 *
 * The boundaries Flint's named sets and US maps draw, bundled. `inlineBoundaries` writes them into a
 * compiled spec in place of their URLs, so a renderer with no network — vl-convert, a sandboxed
 * iframe, an offline app — draws the map. Flint's own renderers do not need it: they load these
 * files from the package on a map's first draw. Kept out of the main entry so charts that draw no
 * map do not carry them. Sources and licences are in `NOTICE.md` beside this file.
 */

import { BOUNDARY_URLS } from '../chart-types/boundaries';
import { usAlbers, usStates, world, worldBankCoarse, worldBankMedium } from './topologies.js';

/** World Bank Official Boundaries (CC BY 4.0), `boundaries: 'world-bank'`, at its two details: `coarse` for the world, `medium` for a region. */
export const worldBankTopology = { coarse: worldBankCoarse, medium: worldBankMedium };
/** Natural Earth's countries at 1:110m, `boundaries: 'natural-earth'` (via vega-datasets): objects `countries` (ISO 3166-1 numeric ids) and `land`. */
export const naturalEarthTopology = world;
/** The US states at 1:10m in longitude and latitude (US Census Bureau, via us-atlas): object `states`. */
export const usStatesTopology = usStates;
/** The US states and counties at 1:10m, projected with albersUsa into 975 × 610 (US Census Bureau, via us-atlas): objects `states` and `counties`. */
export const usAlbersTopology = usAlbers;

/** Each URL a compiled map names, and the bundled shapes it stands for (with the identical files earlier releases named). */
const BY_URL: Record<string, unknown> = {
    [BOUNDARY_URLS.worldBank.coarse]: worldBankCoarse,
    [BOUNDARY_URLS.worldBank.medium]: worldBankMedium,
    [BOUNDARY_URLS.naturalEarth]: world,
    [BOUNDARY_URLS.usStates]: usStates,
    [BOUNDARY_URLS.usAlbers]: usAlbers,
    'https://vega.github.io/vega-lite/data/world-110m.json': world,
    'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json': usAlbers,
};

/**
 * A compiled Vega-Lite (or Vega) spec with every named boundary file written in, in place of its
 * URL, so it draws with no network. The spec given is left as it was. Files of the chart's own keep
 * their URLs.
 */
export function inlineBoundaries<T>(spec: T): T {
    const visit = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(visit);
        if (!node || typeof node !== 'object') return node;
        const out: Record<string, unknown> = {};
        // Rows and shapes already inline hold no URL to replace.
        for (const [key, value] of Object.entries(node)) out[key] = key === 'values' || key === 'datasets' ? value : visit(value);
        if (typeof out.url === 'string' && Object.prototype.hasOwnProperty.call(BY_URL, out.url)) {
            out.values = BY_URL[out.url];
            delete out.url;
        }
        return out;
    };
    return visit(spec) as T;
}
