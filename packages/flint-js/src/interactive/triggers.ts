import type { NavigationAxes } from './language/events';
import type { SemanticTargetSelector } from '../core/interaction-contracts';
import type { InspectGuideOptions, RegionGuideOptions } from './guides';
import { normalizeInspectGuideOptions, normalizeRegionGuideOptions } from './guides';

export type InspectOperator = '<' | '<=' | '=' | '>=' | '>';
export type InspectMode =
    | 'x' | 'y' | 'xy'
    | `x${InspectOperator}` | `y${InspectOperator}` | `xy${InspectOperator}`
    | `x${InspectOperator};y${InspectOperator}`;

export interface InspectPredicate {
    readonly x?: InspectOperator;
    readonly y?: InspectOperator;
}

export interface InteractionEventSource {
    readonly type: 'element' | 'region' | (string & {});
    readonly gesture?: 'click' | 'hover' | 'drag' | 'drag-element' | 'navigate' | 'keyboard' | 'context' | 'inspect' | 'long-press' | 'double';
    readonly match?: 'intersect' | 'contain';
    readonly axis?: 'x' | 'y' | 'xy';
    readonly mode?: 'ephemeral' | 'stateful';
    readonly regionGeometry?: 'cartesian' | 'angular' | 'lasso';
    readonly inspect?: 'x' | 'y' | 'xy';
    readonly inspectPredicate?: InspectPredicate;
    readonly inspectCycle?: readonly ReturnType<typeof parseInspectMode>[];
    readonly inspectTolerance?: number;
    /** Nearest-mark acquisition radius for hover gestures, in renderer pixels. */
    readonly targetTolerance?: number;
    readonly inspectGuide?: ReturnType<typeof normalizeInspectGuideOptions>;
    readonly regionGuide?: ReturnType<typeof normalizeRegionGuideOptions>;
    readonly selector?: SemanticTargetSelector;
    readonly holdMs?: number;
    readonly viewport?: boolean;
    readonly axes?: NavigationAxes | 'available';
    readonly pan?: boolean;
    readonly zoom?: boolean;
    readonly wheelSensitivity?: number;
}

export function elementDragTrigger(): InteractionEventSource {
    return { type: 'reorder', gesture: 'drag-element' };
}

export const clickTrigger = Object.freeze({
    type: 'element',
    gesture: 'click',
} as const satisfies InteractionEventSource);

export const hoverTrigger = Object.freeze({
    type: 'element',
    gesture: 'hover',
} as const satisfies InteractionEventSource);

export function rectangleTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return { type: 'region', gesture: 'drag', match, regionGuide: normalizeRegionGuideOptions(guide) };
}

export function lassoTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return {
        type: 'region', gesture: 'drag', regionGeometry: 'lasso', match, mode: 'ephemeral',
        regionGuide: normalizeRegionGuideOptions(guide),
    };
}

export function brushZoomTrigger(
    axis: 'x' | 'y' | 'xy' = 'xy',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return {
        type: 'region', gesture: 'drag', axis, match: 'intersect', mode: 'ephemeral', viewport: true,
        regionGuide: normalizeRegionGuideOptions(guide),
    };
}

export const keyboardTrigger = Object.freeze({
    type: 'element',
    gesture: 'keyboard',
} as const satisfies InteractionEventSource);

export const contextTrigger = Object.freeze({
    type: 'element',
    gesture: 'context',
} as const satisfies InteractionEventSource);

export function parseInspectMode(mode: InspectMode): { inspect: 'x' | 'y' | 'xy'; predicate: InspectPredicate } {
    const shorthand = /^(x|y|xy)(<=|>=|=|<|>)?$/.exec(mode);
    if (shorthand) {
        const axes = shorthand[1];
        const operator = (shorthand[2] ?? '=') as InspectOperator;
        return {
            inspect: axes,
            predicate: {
                ...(axes.includes('x') ? { x: operator } : {}),
                ...(axes.includes('y') ? { y: operator } : {}),
            },
        } as { inspect: 'x' | 'y' | 'xy'; predicate: InspectPredicate };
    }
    const mixed = /^x(<=|>=|=|<|>);y(<=|>=|=|<|>)$/.exec(mode);
    if (!mixed) throw new Error(`Invalid inspect mode: ${mode}`);
    return { inspect: 'xy', predicate: { x: mixed[1] as InspectOperator, y: mixed[2] as InspectOperator } };
}

/** Inspection modes are parsed once so renderer mounts consume structured predicates. */
export function inspectTrigger(
    mode: InspectMode = 'xy',
    selector?: SemanticTargetSelector,
    tolerance?: number,
    guide?: InspectGuideOptions | false,
    cycle: readonly InspectMode[] = [],
): InteractionEventSource {
    const parsed = parseInspectMode(mode);
    const cycleModes = [...new Set([mode, ...cycle])].map(parseInspectMode);
    const defaultTolerance = parsed.inspect === 'xy'
        && parsed.predicate.x === '='
        && parsed.predicate.y === '='
        ? 0.02
        : 0.01;
    const inspectTolerance = tolerance === undefined || !Number.isFinite(tolerance)
        ? defaultTolerance
        : Math.min(0.5, Math.max(0, tolerance));
    return {
        type: 'element', gesture: 'inspect', ...parsed, inspectTolerance,
        inspectGuide: normalizeInspectGuideOptions(guide),
        ...(cycle.length > 0 ? { inspectCycle: cycleModes } : {}),
        ...(selector ? { selector } : {}),
    };
}

/** Touch equivalent of a context request. */
export function longPressTrigger(holdMs = 500): InteractionEventSource {
    return { type: 'element', gesture: 'long-press', holdMs };
}

export const doubleActivateTrigger = Object.freeze({
    type: 'element',
    gesture: 'double',
} as const satisfies InteractionEventSource);

export function axisBrushTrigger(
    axis: 'x' | 'y',
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return { type: 'region', gesture: 'drag', axis, match, mode, regionGuide: normalizeRegionGuideOptions(guide) };
}

export function xBrushTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return axisBrushTrigger('x', match, mode, guide);
}

export function yBrushTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return axisBrushTrigger('y', match, mode, guide);
}

export function angularBrushTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
    guide?: RegionGuideOptions | false,
): InteractionEventSource {
    return {
        type: 'region', gesture: 'drag', regionGeometry: 'angular', match, mode,
        regionGuide: normalizeRegionGuideOptions(guide),
    };
}

export function navigationTrigger(options: {
    axes?: NavigationAxes | 'available';
    pan?: boolean;
    zoom?: boolean;
    wheelSensitivity?: number;
} = {}): InteractionEventSource {
    return {
        type: 'navigation',
        gesture: 'navigate',
        axes: options.axes ?? 'available',
        pan: options.pan ?? true,
        zoom: options.zoom ?? true,
        wheelSensitivity: options.wheelSensitivity ?? 0.002,
    };
}
