import { resampleStops, type AuthoredColorScale, type NeutralBand } from '../core/color-controls';
import { stepColorScale } from './color-classes';
import { fitBinnedKeyLength } from './theme';

const COLOR_CHANNELS = ['color', 'fill', 'stroke'] as const;
const AGGREGATE_OPS = ['sum', 'average', 'mean', 'median', 'min', 'max'];
const BINNED = ['quantize', 'quantile', 'threshold'];

function walk(node: any, visit: (n: any) => void): void {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) {
        if (Array.isArray(node[key])) for (const child of node[key]) walk(child, visit);
    }
    if (node.spec) walk(node.spec, visit);
}

const markType = (mark: any): string | undefined => (typeof mark === 'string' ? mark : mark?.type);

/** Each colour encoding of the field on a drawn (non-text) mark. */
function colorEncodings(spec: any, field: string): any[] {
    const fields = new Set([field, ...AGGREGATE_OPS.map((op) => `${field}_${op}`)]);
    const out: any[] = [];
    walk(spec, (node) => {
        if (markType(node.mark) === 'text') return;
        for (const channel of COLOR_CHANNELS) {
            const enc = node.encoding?.[channel];
            if (enc?.field && fields.has(enc.field)) out.push(enc);
        }
    });
    return out;
}

/**
 * The colour scales where the templates drew the author's named scheme as that name, before a
 * theme lays its ramp. A name the templates read as more than a name (a calendar's `github` is a
 * quantile scale) is the theme's to keep, and is left out.
 */
export function snapshotColorScales(spec: any, ctl: AuthoredColorScale): Map<any, any> {
    const snapshot = new Map<any, any>();
    if (!ctl.scheme) return snapshot;
    for (const enc of colorEncodings(spec, ctl.field)) {
        const named = typeof enc.scale?.scheme === 'string' ? enc.scale.scheme : enc.scale?.scheme?.name;
        if (named === ctl.scheme) snapshot.set(enc, structuredClone(enc.scale));
    }
    return snapshot;
}

/** Put back the scales where a theme replaced the author's named scheme with its own ramp. */
export function restoreColorScales(snapshot: Map<any, any>): void {
    for (const [enc, scale] of snapshot) {
        const named = typeof enc.scale?.scheme === 'string' ? enc.scale.scheme : enc.scale?.scheme?.name;
        const kept = typeof scale.scheme === 'string' ? scale.scheme : scale.scheme?.name;
        if (named !== kept) enc.scale = scale;
    }
}

/**
 * The author's colour controls, laid over whatever the defaults and the theme chose: they win.
 * A named scheme is the templates' to read (see {@link snapshotColorScales}); stops, bins,
 * reverse and domain are laid here; bins break at a diverging field's pivot, or centre a `neutral`
 * class on it. Value-label text keeps its own ink scale, which reads the ramp rather than paints it.
 */
export function applyAuthoredColorScaleVL(spec: any, ctl: AuthoredColorScale, table: any[], neutral?: NeutralBand): void {
    let binned = false;
    for (const enc of colorEncodings(spec, ctl.field)) {
        const scale: Record<string, any> = { ...(enc.scale ?? {}) };
        // A diverging field's pivot, read before the bins clear it: stepped classes break there.
        const pivot = typeof scale.domainMid === 'number' ? scale.domainMid : undefined;
        // A threshold scale's domain is its breaks; a scale that is not stepped any more spans the data.
        const unstep = () => {
            if (scale.type === 'threshold') delete scale.domain;
            delete scale.type;
        };
        if (ctl.stops) {
            delete scale.scheme;
            scale.range = ctl.stops;
        }
        if (ctl.bins === undefined) {
            // A ramp the author named runs continuously unless they asked for bins.
            if (ctl.stops && BINNED.includes(scale.type)) unstep();
        } else if (ctl.bins === 0) {
            if (BINNED.includes(scale.type)) unstep();
        } else {
            if (scale.type === 'threshold') delete scale.domain;
            scale.type = 'quantize';
            delete scale.domainMid;
            if (!ctl.stops) {
                if (Array.isArray(scale.range)) scale.range = resampleStops(scale.range, ctl.bins);
                else if (scale.scheme) scale.scheme = { name: typeof scale.scheme === 'string' ? scale.scheme : scale.scheme.name, count: ctl.bins };
                else scale.scheme = { name: 'viridis', count: ctl.bins };
            }
        }
        if (ctl.reverse !== undefined) scale.reverse = ctl.reverse;
        if (ctl.domain) scale.domain = ctl.domain;
        enc.scale = scale;
        // Bins over the data step at round values; over a domain the author stated, they cut it evenly.
        if (ctl.bins && !ctl.domain) {
            const ramp = Array.isArray(scale.range) ? scale.range : { scheme: scale.scheme?.name ?? 'viridis' };
            stepColorScale(enc, ramp, ctl.bins, table, pivot, { exact: true, neutral });
        }
        if (BINNED.includes(enc.scale.type)) binned = true;
    }
    if (binned) {
        spec.config = spec.config ?? {};
        fitBinnedKeyLength(spec, spec.config, table);
    }
}
