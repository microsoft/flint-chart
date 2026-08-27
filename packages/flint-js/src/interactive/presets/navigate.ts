import type {
    InteractionDef,
    NavigateOptions,
    NavigationDomainGuard,
} from '../interactions';
import { navigationTrigger } from '../triggers';

const DEFAULT_DOMAIN_GUARD: NavigationDomainGuard = {
    minVisibleFraction: 0.02,
    maxVisibleFraction: 1,
    overscrollFraction: 0,
};

function normalizedFraction(value: number | undefined, fallback: number, min: number): number {
    return Number.isFinite(value) ? Math.max(min, value!) : fallback;
}

export function createNavigateInteraction(options: NavigateOptions = {}): InteractionDef {
    const id = options.id ?? 'navigate';
    const domainGuard = {
            minVisibleFraction: normalizedFraction(
                options.domainGuard?.minVisibleFraction,
                DEFAULT_DOMAIN_GUARD.minVisibleFraction,
                Number.EPSILON,
            ),
            maxVisibleFraction: normalizedFraction(
                options.domainGuard?.maxVisibleFraction,
                DEFAULT_DOMAIN_GUARD.maxVisibleFraction,
                Number.EPSILON,
            ),
            overscrollFraction: normalizedFraction(
                options.domainGuard?.overscrollFraction,
                DEFAULT_DOMAIN_GUARD.overscrollFraction,
                0,
            ),
        };
    if (domainGuard.maxVisibleFraction < domainGuard.minVisibleFraction) {
        throw new Error('navigate() requires maxVisibleFraction >= minVisibleFraction.');
    }
    return {
        id,
        eventSource: navigationTrigger({
            axes: options.axes ?? 'available',
            pan: options.pan ?? true,
            zoom: options.zoom ?? true,
            wheelSensitivity: options.wheelSensitivity ?? 0.002,
        }),
        handle(event) {
            if (event.geometry.plot?.kind !== 'viewport' || !event.operation
                || !['pan', 'zoom', 'reset'].includes(event.operation)) return null;
            const operation = event.operation as 'pan' | 'zoom' | 'reset';
            return {
                updateId: id,
                phase: event.phase,
                ops: [{
                    op: 'navigate-viewport',
                    operation,
                    axes: event.geometry.plot.axes,
                    delta: event.geometry.plot.delta,
                    factor: event.geometry.plot.factor,
                    anchor: event.geometry.plot.anchor,
                    domainGuard,
                }],
            };
        },
    };
}
