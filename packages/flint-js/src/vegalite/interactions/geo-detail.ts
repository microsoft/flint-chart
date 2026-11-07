// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A world map's boundaries sharpen as it is zoomed: the coarse World Bank map draws the world, and
 * once the view comes down to about a continent the medium one takes its place, coarse again on the
 * way out — Data Formulator's thresholds. The map's datasets read their URL from a signal, so the
 * swap is Vega's own reload; Flint's loader serves the finer file from the package.
 */

import { BASEMAP_URLS } from '../../chart-types/basemap-sources';
import { GEO_PROJECTION_SIGNAL } from './navigation-geo';

export const GEO_DETAIL_SIGNAL = '__flint_geo_detail';

/** The projected width of 360° of longitude, in px, past which the medium detail draws, and under which the coarse returns. */
const MEDIUM_ENTER = 3200;
const MEDIUM_EXIT = 2600;

/**
 * Bind the datasets that draw the default coarse World Bank map to the detail signal. A map the host
 * gave its own boundaries, or one framed on a region (drawn at medium detail already), is left alone.
 */
export function injectVegaGeoDetail(vegaSpec: Record<string, any>): boolean {
    const { coarse, medium } = BASEMAP_URLS.worldBank;
    let bound = false;
    for (const dataset of Array.isArray(vegaSpec.data) ? vegaSpec.data : []) {
        if (dataset?.url !== coarse) continue;
        dataset.url = { signal: `${GEO_DETAIL_SIGNAL} === 'medium' ? ${JSON.stringify(medium)} : ${JSON.stringify(coarse)}` };
        bound = true;
    }
    if (bound) vegaSpec.signals = [...(Array.isArray(vegaSpec.signals) ? vegaSpec.signals : []), { name: GEO_DETAIL_SIGNAL, value: 'coarse' }];
    return bound;
}

/** The detail a projection draws at, from the detail shown now. */
export function geoDetailFor(scale: number, current: 'coarse' | 'medium'): 'coarse' | 'medium' {
    const worldWidth = scale * 2 * Math.PI;
    if (worldWidth > MEDIUM_ENTER) return 'medium';
    if (worldWidth < MEDIUM_EXIT) return 'coarse';
    return current;
}

/** Follow a mounted map's zoom with its detail; returns the unsubscribe. */
export function followGeoDetail(view: any): () => void {
    let detail: 'coarse' | 'medium' = view.signal(GEO_DETAIL_SIGNAL) === 'medium' ? 'medium' : 'coarse';
    const listener = (_name: string, projection: any): void => {
        const scale = typeof projection?.scale === 'function' ? Number(projection.scale()) : Number.NaN;
        if (!Number.isFinite(scale)) return;
        const next = geoDetailFor(scale, detail);
        if (next === detail) return;
        detail = next;
        // Not inside the dataflow's own pulse: the reload runs once it has settled.
        queueMicrotask(() => {
            view.signal(GEO_DETAIL_SIGNAL, next);
            void view.runAsync();
        });
    };
    view.addSignalListener(GEO_PROJECTION_SIGNAL, listener);
    return () => view.removeSignalListener(GEO_PROJECTION_SIGNAL, listener);
}
