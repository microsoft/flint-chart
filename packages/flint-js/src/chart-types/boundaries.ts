// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The boundaries a map draws: `chartProperties.boundaries`, a named set Flint ships or a file of
 * the chart's own (by URL or inline), resolved into what the map templates read — the data for
 * each object, how a feature's id is read, how a row's key is matched to it, the credit, and the
 * dotted borders.
 *
 * A named set compiles to its URL on Flint's site, under a version folder that never changes once
 * deployed (`scripts/publish-site-geo.mjs`), so a spec draws the same map for as long as the site
 * stands. Flint's renderers never fetch those URLs: they load the copies bundled in the package
 * (`vegalite/boundary-loader.ts`). Unset, a map draws the World Bank's, or the US Census Bureau's
 * for US data.
 */

import type { BoundaryFile, BoundaryIds, ChartCredit } from '../core/types';
import { countryAlpha, keyTypeResolver, resolveCountry, resolveUsState, type GeoResolver, type MapScope } from './geo';

/** How fine a world map's coastlines and borders are drawn: `coarse` for the world, `medium` for a region or a zoom. */
export type WorldDetail = 'coarse' | 'medium';

/** The named world boundaries a chart can choose. */
export const BOUNDARY_NAMES = ['world-bank', 'natural-earth'] as const;
export type BoundaryName = typeof BOUNDARY_NAMES[number];

/** What a boundary file's ids can be. */
export const BOUNDARY_IDS = ['iso-numeric', 'iso3', 'iso2', 'fips', 'as-is'] as const satisfies readonly BoundaryIds[];

/** Where Flint's site publishes the boundaries: one folder per version of the files under `src/geo`. */
export const SITE_GEO = 'https://microsoft.github.io/flint-chart/geo';

/**
 * The published version the package's `src/geo` files are. A published version never changes:
 * new or corrected boundaries go out as the next version, and the site keeps serving the old one
 * for the specs that name it (`scripts/publish-site-geo.mjs` refuses a deploy that would not).
 */
export const GEO_VERSION = 'v1';

const GEO = `${SITE_GEO}/${GEO_VERSION}`;

/** The URL of every file the named sets and the US maps draw. */
export const BOUNDARY_URLS = {
    worldBank: {
        coarse: `${GEO}/world-bank-coarse.json`,
        medium: `${GEO}/world-bank-medium.json`,
    },
    naturalEarth: `${GEO}/world-110m.json`,
    usStates: `${GEO}/states-10m.json`,
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

const isUrl = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value is a boundary file: a URL (or one per detail) or inline shapes, with the fields it may carry well-formed. */
export function isBoundaryFile(value: unknown): value is BoundaryFile {
    if (!isObject(value)) return false;
    const { url, values, feature, ids, key, disputed, attribution } = value;
    const urlOk = isUrl(url) || (isObject(url) && (isUrl(url.coarse) || isUrl(url.medium))
        && [url.coarse, url.medium].every((detail) => detail === undefined || isUrl(detail)));
    const valuesOk = isObject(values);
    if (urlOk === valuesOk) return false;
    if (feature !== undefined && typeof feature !== 'string') return false;
    if (ids !== undefined && !(BOUNDARY_IDS as readonly unknown[]).includes(ids)) return false;
    if (key !== undefined && (typeof key !== 'string' || key === '')) return false;
    if (disputed !== undefined && typeof disputed !== 'string') return false;
    if (attribution !== undefined && typeof attribution !== 'string' && !(isObject(attribution) && typeof attribution.text === 'string')) return false;
    return true;
}

/** The chart's own boundary file, if it gives one. */
export function boundaryFile(chartProperties: Record<string, any> | undefined): BoundaryFile | undefined {
    const value = chartProperties?.boundaries;
    return isBoundaryFile(value) ? value : undefined;
}

/** The named world boundaries a chart asked for, else the World Bank's. */
export function worldBoundaries(chartProperties: Record<string, any> | undefined): BoundaryName {
    return chartProperties?.boundaries === 'natural-earth' ? 'natural-earth' : 'world-bank';
}

/** What a file's ids are: as stated, else FIPS for a US map and ISO numeric for any other. */
export function fileIds(file: BoundaryFile, scope: MapScope): BoundaryIds {
    return file.ids ?? (scope === 'us' ? 'fips' : 'iso-numeric');
}

/** Whether a file's ids name countries, so the world map's framing and globe apply to it. */
export const idsNameCountries = (ids: BoundaryIds): boolean => ids === 'iso-numeric' || ids === 'iso3' || ids === 'iso2';

/** The map a file's ids put the chart on: the world for countries, the US for FIPS, none for the file's own. */
export function fileScope(file: BoundaryFile, inferred: MapScope): MapScope | 'own' {
    const ids = fileIds(file, inferred);
    return idsNameCountries(ids) ? 'world' : ids === 'fips' ? 'us' : 'own';
}

/** A file's data for one object (or the whole GeoJSON), at a detail where it gives two. */
export function fileData(file: BoundaryFile, feature: string | undefined, detail: WorldDetail = 'coarse'): Record<string, unknown> {
    const format = feature ? { type: 'topojson', feature } : { type: 'json', property: 'features' };
    if (file.values) return { values: file.values, format };
    const url = typeof file.url === 'string' ? file.url : (file.url?.[detail] ?? file.url?.coarse ?? file.url?.medium);
    return { url, format };
}

/** The Vega expression reading a feature's id from its `key` (a dotted path), in the form its ids are matched in. */
export function fileKeyExpr(file: BoundaryFile, ids: BoundaryIds): string {
    const path = (file.key ?? 'id').split('.').map((part) => `[${JSON.stringify(part)}]`).join('');
    const value = `datum${path}`;
    if (ids === 'iso-numeric' || ids === 'fips') return `toNumber(${value})`;
    if (ids === 'iso3' || ids === 'iso2') return `upper(toString(${value}))`;
    return `toString(${value})`;
}

/** The field a file's normalised feature key is written to before the join. */
export const FILE_KEY_FIELD = '__geo_key';

/** Match a row's key to a file's ids, as `fileKeyExpr` reads them; `keyType` says what the rows hold. */
export function fileKeyResolver(ids: BoundaryIds, keyType: unknown): (value: unknown) => unknown {
    if (ids === 'as-is') return (value) => (value == null || value === '' ? undefined : String(value).trim());
    if (ids === 'fips') return keyTypeResolver(keyType) ?? resolveUsState;
    const country: GeoResolver = keyTypeResolver(keyType) ?? resolveCountry;
    if (ids === 'iso-numeric') return country;
    return (value) => {
        const id = country(value);
        return id === undefined ? undefined : countryAlpha(id, ids);
    };
}

/** Antarctica's id in a file's ids, so a frame that leaves it out can; undefined where they cannot name it. */
export function fileAntarctica(ids: BoundaryIds): number | string | undefined {
    return ids === 'iso-numeric' ? 10 : ids === 'iso3' ? 'ATA' : ids === 'iso2' ? 'AQ' : undefined;
}

/** The credit a file's `attribution` asks for. */
export function fileCredit(file: BoundaryFile): ChartCredit | undefined {
    const attribution = file.attribution;
    if (typeof attribution === 'string') return attribution.trim() ? { text: `Boundaries: ${attribution.trim()}` } : undefined;
    return attribution?.text?.trim() ? attribution : undefined;
}

/** Who drew a file's boundaries, as the map reports it (`_attribution`). */
export function fileAttribution(file: BoundaryFile): string | undefined {
    const attribution = file.attribution;
    const text = typeof attribution === 'string' ? attribution : attribution?.text;
    return text?.trim() || undefined;
}

/** Who drew each named set's and US map's boundaries, reported as a map's `_attribution`. */
export const NAMED_ATTRIBUTION = {
    'world-bank': 'World Bank Official Boundaries (CC BY 4.0)',
    'natural-earth': 'Natural Earth',
    us: 'US Census Bureau',
    usAlbers: 'US Census Bureau, via us-atlas',
} as const;

/** The credit a named set draws at the map's foot: the World Bank's; none for public-domain boundaries. */
export function namedCredit(name: BoundaryName | 'us'): ChartCredit | undefined {
    return name === 'world-bank' ? WORLD_BANK_CREDIT : undefined;
}

/** The URL a named world set draws at a detail. */
export function namedWorldUrl(name: BoundaryName, detail: WorldDetail = 'coarse'): string {
    return name === 'natural-earth' ? BOUNDARY_URLS.naturalEarth : BOUNDARY_URLS.worldBank[detail];
}
