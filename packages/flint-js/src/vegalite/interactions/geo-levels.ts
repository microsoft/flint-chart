// The parts of map navigation a chart template compiles in. They must not import Vega: templates
// load with the library's main entry, where Vega is an optional peer dependency.

/** A globe: the one projection a drag turns rather than slides. */
export function isGlobeProjection(type: unknown): boolean {
    return type === 'orthographic';
}

/**
 * The rotation of a globe's projection, in degrees. Navigation turns it on a drag; a globe that
 * hides what stands behind it reads it to tell the near side from the far one.
 */
export const GEO_ROTATE_SIGNAL = '__flint_geo_rotate';

/** Names the detail level a multi-level projected chart currently draws. */
export const GEO_LEVEL_SIGNAL = '__flint_geo_level';

/**
 * One runtime detail level of a projected chart. A finer level is entered
 * once the visible longitude span drops to `enter` degrees and left again only
 * above `exit`, so a view that rests near the threshold does not flicker.
 */
export interface GeoLevel {
    name: string;
    enter?: number;
    exit?: number;
}

/**
 * The projection a pre-projected base map was built with. The chart draws
 * such a map with an identity projection, so navigation converts between
 * the map's frame and longitude/latitude through this one.
 */
export interface GeoPreProjection {
    type: string;
    scale?: number;
    translate?: readonly [number, number];
    rotate?: readonly number[];
    center?: readonly [number, number];
    parallels?: readonly [number, number];
}

/** The filter expression that gates one level's features behind the level signal. */
export function geoLevelGate(signal: string, level: string): string {
    return `${signal} === ${JSON.stringify(level)}`;
}
