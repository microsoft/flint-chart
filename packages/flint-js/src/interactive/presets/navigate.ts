import type {
    CanvasInteractionDef,
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

export function createNavigateInteraction(options: NavigateOptions = {}): CanvasInteractionDef {
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
        navigationDomainGuard: domainGuard,
        eventSource: navigationTrigger({
            axes: options.axes ?? 'available',
            pan: options.pan ?? true,
            zoom: options.zoom ?? true,
            wheelSensitivity: options.wheelSensitivity ?? 0.002,
        }),
        affordances: options.pan === false ? [] : [{ target: 'plot', cursor: 'navigate' }],
        handle(event, context) {
            const viewport = event.geometry.plot;
            if (!context.resolveNavigation || viewport?.kind !== 'viewport' || !event.operation) return null;
            const op = context.resolveNavigation({
                phase: event.phase,
                operation: event.operation as 'pan' | 'zoom' | 'reset',
                axes: viewport.axes,
                delta: viewport.delta,
                factor: viewport.factor,
                anchor: viewport.anchor,
            }, domainGuard);
            return op ? { id, ops: [op] } : null;
        },
    };
}
