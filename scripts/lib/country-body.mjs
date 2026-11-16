// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { geoArea, geoBounds } from 'd3-geo';

/** A polygon at least this share of a country's largest is part of its body (Hokkaido is a fifth of Honshu). */
const BODY_AREA = 0.05;
/** How far a polygon may lie from the body and still join it: this share of the body's span, between the bounds below. */
const BODY_REACH = 0.2;
const REACH_DEGREES = [2, 12];

const round = (value) => Math.round(value * 10) / 10;

/**
 * A country's body as [west, south, east, north]: its largest polygon, and the large polygons that
 * lie near it, taken in until no more join (Hokkaido and Kyushu with Honshu, Sumatra and Papua with
 * Borneo) — not a far territory (French Guiana, Réunion). A body that crosses the antimeridian is
 * its largest polygon alone, west > east.
 */
export function countryBody(geometries) {
    const polygons = geometries.flatMap((geometry) => (geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
        : geometry.type === 'Polygon' ? [geometry] : []));
    if (!polygons.length) return undefined;
    const parts = polygons.map((polygon) => ({ area: geoArea(polygon), box: geoBounds(polygon).flat() }));
    parts.sort((a, b) => b.area - a.area);
    const [main, ...rest] = parts;
    let [w, s, e, n] = main.box;
    if (w > e) return [w, s, e, n].map(round);
    const candidates = rest.filter((part) => part.area >= main.area * BODY_AREA && part.box[0] <= part.box[2]);
    for (let grown = true; grown;) {
        grown = false;
        const reach = Math.min(REACH_DEGREES[1], Math.max(REACH_DEGREES[0], BODY_REACH * Math.max(e - w, n - s)));
        for (let i = candidates.length - 1; i >= 0; i--) {
            const [pw, ps, pe, pn] = candidates[i].box;
            const gap = Math.hypot(Math.max(0, pw - e, w - pe), Math.max(0, ps - n, s - pn));
            if (gap > reach) continue;
            [w, s, e, n] = [Math.min(w, pw), Math.min(s, ps), Math.max(e, pe), Math.max(n, pn)];
            candidates.splice(i, 1);
            grown = true;
        }
    }
    return [w, s, e, n].map(round);
}
