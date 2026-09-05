import type {
    NavigationDomainGuard,
    NavigationRequest,
    NavigationUpdate,
} from '../../interactive/interactions';
import type { VegaNavigationAxis } from './contracts';

type Axis = 'x' | 'y';

interface AxisState extends VegaNavigationAxis {
    initialDomain: [unknown, unknown];
}

function numericValue(value: unknown): number {
    return value instanceof Date ? value.getTime() : Number(value);
}

function transformedValue(value: unknown, type: VegaNavigationAxis['type'], logSign: number): number {
    const numeric = numericValue(value);
    return type === 'log' ? logSign * Math.log(logSign * numeric) : numeric;
}

function domainValue(value: number, type: VegaNavigationAxis['type'], initial: unknown, logSign: number): unknown {
    const numeric = type === 'log' ? logSign * Math.exp(logSign * value) : value;
    return initial instanceof Date ? new Date(numeric) : numeric;
}

export function guardNavigationDomain(
    proposed: readonly [unknown, unknown],
    initial: readonly [unknown, unknown],
    type: VegaNavigationAxis['type'],
    guard: NavigationDomainGuard,
): [unknown, unknown] {
    const logSign = type === 'log' && numericValue(initial[0]) < 0 ? -1 : 1;
    const initialValues = initial.map((value) => transformedValue(value, type, logSign));
    const proposedValues = proposed.map((value) => transformedValue(value, type, logSign));
    const initialMin = Math.min(...initialValues);
    const initialMax = Math.max(...initialValues);
    const initialSpan = initialMax - initialMin;
    if (!Number.isFinite(initialSpan) || initialSpan <= 0 || proposedValues.some((value) => !Number.isFinite(value))) {
        return [...initial] as [unknown, unknown];
    }

    const direction = proposedValues[1] >= proposedValues[0] ? 1 : -1;
    const requestedSpan = Math.abs(proposedValues[1] - proposedValues[0]);
    const minimumSpan = initialSpan * guard.minVisibleFraction;
    const maximumSpan = initialSpan * guard.maxVisibleFraction;
    const span = Math.min(maximumSpan, Math.max(minimumSpan, requestedSpan));
    let center = (proposedValues[0] + proposedValues[1]) / 2;
    const zoomOutMargin = Math.max(0, guard.maxVisibleFraction - 1) / 2;
    const allowedMargin = guard.overscrollFraction + zoomOutMargin;
    const allowedMin = initialMin - initialSpan * allowedMargin;
    const allowedMax = initialMax + initialSpan * allowedMargin;
    const allowedSpan = allowedMax - allowedMin;
    const boundedSpan = Math.min(span, allowedSpan);
    center = Math.max(allowedMin + boundedSpan / 2, Math.min(allowedMax - boundedSpan / 2, center));
    const lower = center - boundedSpan / 2;
    const upper = center + boundedSpan / 2;
    const values = direction > 0 ? [lower, upper] : [upper, lower];
    return values.map((value, index) => domainValue(value, type, initial[index], logSign)) as [unknown, unknown];
}

export interface VegaNavigationController {
    resolve(event: NavigationRequest, guard: NavigationDomainGuard): NavigationUpdate | null;
    apply(update: NavigationUpdate): boolean;
}

export function createVegaNavigationController(
    view: any,
    axes: Partial<Record<Axis, VegaNavigationAxis>>,
): VegaNavigationController {
    const states = Object.fromEntries(Object.entries(axes).map(([axis, config]) => {
        const domain = view.scale(config.scale).domain();
        return [axis, { ...config, initialDomain: [domain[0], domain[domain.length - 1]] }];
    })) as Partial<Record<Axis, AxisState>>;
    const affectedAxes = (axesValue: NavigationUpdate['axes']): Axis[] => {
        const requested: Axis[] = axesValue === 'xy' ? ['x', 'y'] : [axesValue];
        return requested.filter((axis) => states[axis]);
    };

    return {
        resolve(event, guard): NavigationUpdate | null {
            if (event.phase === 'start' || event.phase === 'cancel'
                || (event.phase === 'commit' && event.operation === 'pan' && !event.delta)) return null;
            if (event.operation === 'reset') return { op: 'set-viewport', axes: event.axes, value: {} };
            const value: { x?: [unknown, unknown]; y?: [unknown, unknown] } = {};
            for (const axis of affectedAxes(event.axes)) {
                const state = states[axis]!;
                const scale = view.scale(state.scale);
                const domain = scale.domain();
                const current: [unknown, unknown] = [domain[0], domain[domain.length - 1]];
                const range = scale.range();
                const rangeStart = Number(range[0]);
                const rangeEnd = Number(range[range.length - 1]);
                const rangeExtent = Math.abs(rangeEnd - rangeStart);
                let proposed: [unknown, unknown] | undefined;
                if (event.operation === 'pan' && event.delta) {
                    const fraction = axis === 'x' ? event.delta.x : event.delta.y;
                    const pixelDelta = fraction * rangeExtent;
                    proposed = [scale.invert(rangeStart - pixelDelta), scale.invert(rangeEnd - pixelDelta)];
                } else if (event.operation === 'zoom' && event.factor && event.factor > 0 && event.anchor) {
                    const fraction = axis === 'x' ? event.anchor.x : event.anchor.y;
                    const anchor = Math.min(rangeStart, rangeEnd) + fraction * rangeExtent;
                    proposed = [
                        scale.invert(anchor + (rangeStart - anchor) / event.factor),
                        scale.invert(anchor + (rangeEnd - anchor) / event.factor),
                    ];
                }
                if (!proposed) continue;
                value[axis] = guardNavigationDomain(
                    proposed,
                    state.initialDomain,
                    state.type,
                    guard,
                );
            }
            return Object.keys(value).length > 0
                ? { op: 'set-viewport', axes: event.axes, value }
                : null;
        },
        apply(update): boolean {
            let changed = false;
            for (const axis of affectedAxes(update.axes)) {
                const state = states[axis]!;
                view.signal(state.signal, update.value[axis] ?? null);
                changed = true;
            }
            return changed;
        },
    };
}
