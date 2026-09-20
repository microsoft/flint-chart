import type {
    CanvasInteractionDef,
    NavigateOptions,
    NavigationDomainGuard,
    NavigationTransition,
} from '../interactions';
import { navigationTrigger } from '../triggers';

const DEFAULT_DOMAIN_GUARD: NavigationDomainGuard = {
    minVisibleFraction: 0.02,
    maxVisibleFraction: 1,
    overscrollFraction: 0,
};

/** How long a gesture's viewport change animates when the preset does not say. */
export const DEFAULT_NAVIGATION_TRANSITION_MS = 400;

/** Validates a transition option; a zero duration turns the animation off. */
export function resolveNavigationTransition(
    preset: string,
    option: string,
    transition: NavigationTransition | undefined,
): NavigationTransition | undefined {
    if (transition === undefined) return { duration: DEFAULT_NAVIGATION_TRANSITION_MS };
    if (!(Number.isFinite(transition.duration) && transition.duration >= 0)) {
        throw new Error(`${preset}() requires a finite, non-negative ${option} duration.`);
    }
    return transition.duration > 0 ? { duration: transition.duration } : undefined;
}

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
    const resetTransition = resolveNavigationTransition('navigate', 'resetTransition', options.resetTransition);
    return {
        id,
        navigationDomainGuard: domainGuard,
        ...(resetTransition ? { navigationResetTransition: resetTransition } : {}),
        eventSource: navigationTrigger({
            axes: options.axes ?? 'available',
            pan: options.pan ?? true,
            zoom: options.zoom ?? true,
            wheelSensitivity: options.wheelSensitivity ?? 0.002,
            reset: options.reset,
        }),
        affordances: options.pan === false ? { plot: {} } : { plot: { cursor: 'navigate' } },
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
