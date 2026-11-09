// Read by validation, which loads with the library's main entry: it must not import Vega.
import type { ChartOverlaySpec } from '../../../core/interaction-contracts';

export type OverlayChannel = 'x' | 'x2' | 'y' | 'y2';
export type GeoOverlayChannel = 'longitude' | 'latitude' | 'longitude2' | 'latitude2';

/** Whether an overlay is placed by longitude and latitude, through a map's projection. */
export function isGeoOverlay(spec: ChartOverlaySpec): boolean {
    const encodings = spec.encodings ?? {};
    return !!(encodings.longitude || encodings.latitude || encodings.longitude2 || encodings.latitude2);
}

/**
 * The places a map overlay reads, or undefined when its mark cannot be drawn from them: a point, a
 * text or a line at `longitude`/`latitude`; a rule or a rect between that place and
 * `longitude2`/`latitude2`. A map overlay takes no `x` or `y`.
 */
export function geoOverlayChannels(spec: ChartOverlaySpec): readonly GeoOverlayChannel[] | undefined {
    const encodings = spec.encodings ?? {};
    if (encodings.x || encodings.y || encodings.x2 || encodings.y2) return undefined;
    if (!encodings.longitude || !encodings.latitude) return undefined;
    if (spec.mark === 'rule' || spec.mark === 'rect') {
        return encodings.longitude2 && encodings.latitude2 ? ['longitude', 'latitude', 'longitude2', 'latitude2'] : undefined;
    }
    return encodings.longitude2 || encodings.latitude2 ? undefined : ['longitude', 'latitude'];
}

/** The channels an overlay projects, or undefined when its mark cannot be drawn from them. */
export function overlayChannels(spec: ChartOverlaySpec): readonly OverlayChannel[] | undefined {
    if (isGeoOverlay(spec)) return undefined;
    const has = (channel: OverlayChannel): boolean => !!spec.encodings[channel];
    if (spec.mark !== 'rule' && spec.mark !== 'rect') return has('x') && has('y') ? ['x', 'y'] : undefined;
    if (has('x') && has('y') && has('x2') && has('y2')) return ['x', 'y', 'x2', 'y2'];
    const span = (start: OverlayChannel, end: OverlayChannel): OverlayChannel[] | undefined =>
        spec.mark === 'rect'
            ? (has(start) && has(end) ? [start, end] : undefined)
            : (has(start) && !has(end) ? [start] : undefined);
    if (!has('y') && !has('y2')) return span('x', 'x2');
    if (!has('x') && !has('x2')) return span('y', 'y2');
    return undefined;
}
