// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Where the built-in maps' boundaries come from, and the credit each source asks for.
 *
 * A compiled map names its boundaries by URL, so the spec stays small and renders anywhere online.
 * Every built-in boundary file is published on Flint's site under a version folder that never
 * changes once deployed (`scripts/publish-site-geo.mjs`), so a spec draws the same map for as long
 * as the site stands. Flint's renderers never fetch those URLs — they load the copies bundled in
 * the package (see `vegalite/basemap-loader.ts`) — and a host can replace any part with a topology
 * or URL of its own (`AssembleOptions.basemaps`).
 */

import type { BasemapSource, ChartCredit, MapBasemaps } from '../core/types';
import type { WorldBoundaries } from './geo-frame';

/** How fine a world map's coastlines and borders are drawn: `coarse` for the world, `medium` for a region or a zoom. */
export type WorldDetail = 'coarse' | 'medium';

/** A part of `AssembleOptions.basemaps`: the boundaries one built-in map draws. */
export type BasemapPart = 'worldBank' | 'naturalEarth' | 'us' | 'usAlbers';

/** Where Flint's site publishes the boundaries: one folder per version of the files under `src/geo`. */
export const SITE_GEO = 'https://microsoft.github.io/flint-chart/geo';

/**
 * The published version the package's `src/geo` files are. A published version never changes:
 * new or corrected boundaries go out as the next version, and the site keeps serving the old one
 * for the specs that name it (`scripts/publish-site-geo.mjs` refuses a deploy that would not).
 */
export const GEO_VERSION = 'v1';

const GEO = `${SITE_GEO}/${GEO_VERSION}`;

export const BASEMAP_URLS = {
    worldBank: {
        coarse: `${GEO}/world-bank-coarse.json`,
        medium: `${GEO}/world-bank-medium.json`,
    },
    naturalEarth: `${GEO}/world-110m.json`,
    us: `${GEO}/states-10m.json`,
    usAlbers: `${GEO}/counties-albers-10m.json`,
} as const;

/** The World Bank map's object holding the borders its areas of non-determined legal status share. */
export const DISPUTED_FEATURE = 'disputed';

/** The World Bank's terms: credit under CC BY 4.0, and its disclaimer on the boundaries. */
export const WORLD_BANK_CREDIT: ChartCredit = {
    text: 'Map based on World Bank Official Boundaries (CC BY 4.0)',
    href: 'https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries',
    title: 'The boundaries, colors, denominations, and any other information shown on this map do not imply any judgment on the part of The World Bank concerning the legal status of any territory or the endorsement or acceptance of such boundaries.',
};

/** Who drew each part's default boundaries, reported as a map's `_attribution`. */
const DEFAULT_ATTRIBUTION: Record<BasemapPart, string> = {
    worldBank: 'World Bank Official Boundaries (CC BY 4.0)',
    naturalEarth: 'Natural Earth',
    us: 'US Census Bureau',
    usAlbers: 'US Census Bureau, via us-atlas',
};

/** The part of `basemaps` a world map draws under its boundaries. */
export function worldPart(boundaries: unknown): BasemapPart {
    return boundaries === 'natural-earth' ? 'naturalEarth' : 'worldBank';
}

/** The boundaries a chart asked for, else the World Bank's. */
export function worldBoundaries(chartProperties: Record<string, any> | undefined): WorldBoundaries {
    return chartProperties?.boundaries === 'natural-earth' ? 'natural-earth' : 'world-bank';
}

const isTopology = (value: unknown): boolean => typeof value === 'object' && value !== null && (value as any).type === 'Topology';

/** A part's boundaries at a detail: the host's (one source, or one per detail), else the default URL. */
export function basemapSource(basemaps: MapBasemaps | undefined, part: BasemapPart, detail: WorldDetail = 'coarse'): BasemapSource {
    const given = basemaps?.[part];
    if (part === 'worldBank') {
        if (given && typeof given === 'object' && !isTopology(given)) {
            const levels = given as { coarse?: BasemapSource; medium?: BasemapSource };
            const level = levels[detail] ?? levels.coarse ?? levels.medium;
            if (level) return level;
        } else if (given) {
            return given;
        }
        return BASEMAP_URLS.worldBank[detail];
    }
    return (given as BasemapSource | undefined) || BASEMAP_URLS[part];
}

/** Whether the host gave a part of its own. */
const hostGives = (basemaps: MapBasemaps | undefined, part: BasemapPart): boolean => basemaps?.[part] !== undefined;

/**
 * Whether boundaries are this package's World Bank build — its URL, a copy served under the same file
 * name, or the topology itself (the only one here with a `disputed` object) — and so carry its
 * disputed borders and take its credit.
 */
export function isPackageWorldBank(source: BasemapSource | undefined): boolean {
    if (typeof source === 'string') return /(^|\/)world-bank-(coarse|medium)\.json([?#]|$)/.test(source);
    return isTopology(source) && Boolean((source as any).objects?.[DISPUTED_FEATURE]);
}

/**
 * Whether a part draws boundaries Flint knows — its default, or the package's World Bank build given
 * back — rather than the host's own, whose source, regions and disputed borders are the host's to say.
 */
export function knownBoundaries(basemaps: MapBasemaps | undefined, part: BasemapPart): boolean {
    if (!hostGives(basemaps, part)) return true;
    return part === 'worldBank' && (['coarse', 'medium'] as const).every((detail) => isPackageWorldBank(basemapSource(basemaps, part, detail)));
}

/** Who drew a part's boundaries, for the host to credit; undefined for the host's own, unattributed. */
export function basemapAttribution(basemaps: MapBasemaps | undefined, part: BasemapPart): string | undefined {
    if (hostGives(basemaps, part) && basemaps!.attribution) return basemaps!.attribution;
    return knownBoundaries(basemaps, part) ? DEFAULT_ATTRIBUTION[part] : undefined;
}

/**
 * The credit a map draws at its foot: the host's attribution for boundaries it gave, else the World
 * Bank's for its boundaries; none for public-domain boundaries (Natural Earth, the US Census), nor
 * for the host's own given without an attribution.
 */
export function basemapCredit(basemaps: MapBasemaps | undefined, part: BasemapPart): ChartCredit | undefined {
    if (hostGives(basemaps, part) && basemaps!.attribution) return { text: `Boundaries: ${basemaps!.attribution}` };
    return part === 'worldBank' && knownBoundaries(basemaps, part) ? WORLD_BANK_CREDIT : undefined;
}
