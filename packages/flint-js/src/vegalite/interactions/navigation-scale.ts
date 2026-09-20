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

/** Frame timing shared by the viewport tweens of the scale and geo controllers. */
export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const nextFrame = (callback: () => void): void => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback());
    else setTimeout(callback, 16);
};

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

export interface NavigationApplyOptions {
    /**
     * Tween the viewport to the update over `duration` ms. `onFrame` reports
     * each rendered frame, as a zoom or, when the target is the base fit, a reset.
     */
    transition?: {
        duration: number;
        onFrame?: (phase: 'preview' | 'commit', operation: 'zoom' | 'reset') => void;
    };
    /** The runtime's own reset before it re-applies retained viewports; must not end a running tween. */
    baseline?: boolean;
}

export interface VegaNavigationController {
    resolve(event: NavigationRequest, guard: NavigationDomainGuard): NavigationUpdate | null;
    apply(update: NavigationUpdate, options?: NavigationApplyOptions): boolean;
    /** Resolves once a running viewport tween has rendered its last frame. */
    settled?(): Promise<void>;
    /** Scale-like inverters for navigation axes that have no Vega scale (geo). */
    scale?(name: string): { invert?(value: number): unknown } | undefined;
    /** The detail level the chart draws now, on projected charts with runtime levels. */
    level?(): string | undefined;
    /** The coarsest-level region under the plot centre, on projected charts with runtime levels. */
    focus?(): Record<string, unknown> | undefined;
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
    const liveDomain = (state: AxisState): [unknown, unknown] => {
        const domain = view.scale(state.scale).domain();
        return [domain[0], domain[domain.length - 1]];
    };
    const valueKey = (update: NavigationUpdate): string => JSON.stringify([update.axes, update.value]);

    // A viewport tween renders one domain per animation frame. The centre
    // moves linearly and the span geometrically, in the axis's transformed
    // space, so a log axis and a zoom both read as one steady motion.
    interface ActiveTransition {
        key: string;
        frame: Partial<Record<Axis, readonly [unknown, unknown] | null>>;
        done: Promise<void>;
        cancel(): void;
    }
    let active: ActiveTransition | undefined;
    const domainPath = (
        state: AxisState,
        from: readonly [unknown, unknown],
        to: readonly [unknown, unknown],
    ): ((t: number) => [unknown, unknown]) => {
        const logSign = state.type === 'log' && numericValue(state.initialDomain[0]) < 0 ? -1 : 1;
        const [f0, f1] = from.map((value) => transformedValue(value, state.type, logSign));
        const [t0, t1] = to.map((value) => transformedValue(value, state.type, logSign));
        const fromCentre = (f0 + f1) / 2;
        const toCentre = (t0 + t1) / 2;
        const fromSpan = Math.abs(f1 - f0);
        const toSpan = Math.abs(t1 - t0);
        const geometric = fromSpan > 0 && toSpan > 0;
        const direction = t1 >= t0 ? 1 : -1;
        return (t) => {
            const centre = fromCentre + (toCentre - fromCentre) * t;
            const span = geometric ? fromSpan * (toSpan / fromSpan) ** t : fromSpan + (toSpan - fromSpan) * t;
            const values = direction > 0 ? [centre - span / 2, centre + span / 2] : [centre + span / 2, centre - span / 2];
            return values.map((value, index) =>
                domainValue(value, state.type, state.initialDomain[index], logSign)) as [unknown, unknown];
        };
    };
    const startTransition = (
        update: NavigationUpdate,
        axes: Axis[],
        transition: NonNullable<NavigationApplyOptions['transition']>,
    ): void => {
        active?.cancel();
        const paths = axes.map((axis) => {
            const state = states[axis]!;
            return { axis, state, path: domainPath(state, liveDomain(state), update.value[axis] ?? state.initialDomain) };
        });
        const operation = axes.every((axis) => update.value[axis] === undefined) ? 'reset' : 'zoom';
        let cancelled = false;
        let finish!: () => void;
        const done = new Promise<void>((resolve) => { finish = resolve; });
        const startedAt = now();
        const entry: ActiveTransition = {
            key: valueKey(update),
            frame: Object.fromEntries(paths.map(({ axis, path }) => [axis, path(0)])),
            done,
            cancel: () => { cancelled = true; finish(); },
        };
        active = entry;
        // The render that starts the tween draws the domain on screen, not the target.
        for (const { axis, state } of paths) view.signal(state.signal, entry.frame[axis]);
        const step = (): void => {
            if (cancelled) return;
            const t = transition.duration > 0 ? Math.min(1, (now() - startedAt) / transition.duration) : 1;
            const last = t >= 1;
            for (const { axis, state, path } of paths) {
                entry.frame[axis] = last ? update.value[axis] ?? null : path(easeInOut(t));
                view.signal(state.signal, entry.frame[axis]);
            }
            if (last && active === entry) active = undefined;
            void Promise.resolve(view.runAsync()).then(() => {
                if (cancelled) return;
                transition.onFrame?.(last ? 'commit' : 'preview', operation);
                if (last) finish();
                else nextFrame(step);
            });
        };
        nextFrame(step);
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
        apply(update, options): boolean {
            const axes = affectedAxes(update.axes);
            if (axes.length === 0) return false;
            if (active && (options?.baseline || active.key === valueKey(update))) {
                // The runtime re-applies retained viewports, after its own
                // reset, on every render: a render during a tween keeps the
                // tween's frame on the axes it moves.
                for (const axis of axes) {
                    const frame = active.frame[axis];
                    view.signal(states[axis]!.signal, frame === undefined ? update.value[axis] ?? null : frame);
                }
                return true;
            }
            if (options?.transition) {
                startTransition(update, axes, options.transition);
                return true;
            }
            active?.cancel();
            active = undefined;
            for (const axis of axes) view.signal(states[axis]!.signal, update.value[axis] ?? null);
            return true;
        },
        settled: () => active?.done ?? Promise.resolve(),
    };
}
