// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/geo
 *
 * The boundaries Flint's built-in maps draw, for a compiled spec that must carry them: pass
 * `basemaps` as `options.basemaps` and the spec draws its maps inline, with no network, wherever it
 * is rendered. Flint's own renderers do not need it — they load these files from the package on a
 * map's first draw. Kept out of the main entry so charts that draw no map do not carry them.
 * Sources and licences are in `NOTICE.md` beside this file.
 */

import type { MapBasemaps } from '../core/types';
import { usAlbers, usStates, world, worldBankCoarse, worldBankMedium } from './topologies.js';

/** World Bank Official Boundaries (CC BY 4.0), the default world map, at its two details: `coarse` for the world, `medium` for a region. */
export const worldBankTopology = { coarse: worldBankCoarse, medium: worldBankMedium };
/** The world's countries at 1:110m (Natural Earth, via vega-datasets): objects `countries` (ISO 3166-1 numeric ids) and `land`. */
export const worldTopology = world;
/** The US states at 1:10m in longitude and latitude (US Census Bureau, via us-atlas): object `states`. */
export const usStatesTopology = usStates;
/** The US states and counties at 1:10m, projected with albersUsa into 975 × 610 (US Census Bureau, via us-atlas): objects `states` and `counties`. */
export const usAlbersTopology = usAlbers;

/** Every built-in map's boundaries, ready for `options.basemaps`. Each map credits its own source, as with the defaults. */
export const basemaps: MapBasemaps = {
    worldBank: worldBankTopology,
    naturalEarth: worldTopology,
    us: usStatesTopology,
    usAlbers: usAlbersTopology,
};
