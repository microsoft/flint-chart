import type { NavigationDomainGuard, UpdateOp } from '../../interactive/interactions';
import type { VegaNavigationAxis } from './contracts';

type NavigationUpdate = Extract<UpdateOp, { op: 'navigate-viewport' }>;
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
    apply(update: NavigationUpdate): Promise<void>;
}

export function createVegaNavigationController(
    view: any,
    axes: Partial<Record<Axis, VegaNavigationAxis>>,
): VegaNavigationController {
    const states = Object.fromEntries(Object.entries(axes).map(([axis, config]) => {
        const domain = view.scale(config.scale).domain();
        return [axis, { ...config, initialDomain: [domain[0], domain[domain.length - 1]] }];
    })) as Partial<Record<Axis, AxisState>>;
    let gestureSnapshot: Partial<Record<Axis, [unknown, unknown]>> | undefined;

    const affectedAxes = (axesValue: NavigationUpdate['axes']): Axis[] => {
        const requested: Axis[] = axesValue === 'xy' ? ['x', 'y'] : [axesValue];
        return requested.filter((axis) => states[axis]);
    };

    return {
        async apply(update): Promise<void> {
            const activeAxes = affectedAxes(update.axes);
            if (update.phase === 'start') {
                gestureSnapshot = Object.fromEntries(activeAxes.map((axis) => {
                    const state = states[axis]!;
                    const domain = view.scale(state.scale).domain();
                    return [axis, [domain[0], domain[domain.length - 1]]];
                }));
                return;
            }

            let changed = false;
            for (const axis of activeAxes) {
                const state = states[axis]!;
                if (update.phase === 'cancel') {
                    const snapshot = gestureSnapshot?.[axis];
                    if (snapshot) {
                        view.signal(state.signal, snapshot);
                        changed = true;
                    }
                    continue;
                }
                if (update.operation === 'reset') {
                    view.signal(state.signal, null);
                    changed = true;
                    continue;
                }
                const scale = view.scale(state.scale);
                const domain = scale.domain();
                const current: [unknown, unknown] = [domain[0], domain[domain.length - 1]];
                const range = scale.range();
                const rangeStart = Number(range[0]);
                const rangeEnd = Number(range[range.length - 1]);
                const rangeExtent = Math.abs(rangeEnd - rangeStart);
                let proposed: [unknown, unknown] | undefined;
                if (update.operation === 'pan' && update.delta) {
                    const fraction = axis === 'x' ? update.delta.x : update.delta.y;
                    const pixelDelta = fraction * rangeExtent;
                    proposed = [scale.invert(rangeStart - pixelDelta), scale.invert(rangeEnd - pixelDelta)];
                } else if (update.operation === 'zoom' && update.factor && update.factor > 0 && update.anchor) {
                    const fraction = axis === 'x' ? update.anchor.x : update.anchor.y;
                    const anchor = Math.min(rangeStart, rangeEnd) + fraction * rangeExtent;
                    proposed = [
                        scale.invert(anchor + (rangeStart - anchor) / update.factor),
                        scale.invert(anchor + (rangeEnd - anchor) / update.factor),
                    ];
                }
                if (!proposed) continue;
                view.signal(state.signal, guardNavigationDomain(
                    proposed,
                    state.initialDomain,
                    state.type,
                    update.domainGuard,
                ));
                changed = true;
            }
            if (update.phase === 'commit' || update.phase === 'cancel') gestureSnapshot = undefined;
            if (changed) await view.runAsync();
        },
    };
}
