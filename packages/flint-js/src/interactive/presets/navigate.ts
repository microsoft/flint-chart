import type {
    ChartUpdate,
    InteractionContext,
    InteractionDef,
    InteractionInput,
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

export class NavigateInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource;
    private readonly domainGuard: NavigationDomainGuard;

    constructor(options: NavigateOptions = {}) {
        this.id = options.id ?? 'navigate';
        this.eventSource = navigationTrigger({
            axes: options.axes ?? 'available',
            pan: options.pan ?? true,
            zoom: options.zoom ?? true,
            wheelSensitivity: options.wheelSensitivity ?? 0.002,
        });
        this.domainGuard = {
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
        if (this.domainGuard.maxVisibleFraction < this.domainGuard.minVisibleFraction) {
            throw new Error('navigate() requires maxVisibleFraction >= minVisibleFraction.');
        }
    }

    update(event: InteractionInput, _context: InteractionContext): ChartUpdate | null {
        if (event.type !== 'navigation') return null;
        return {
            phase: event.phase,
            ops: [{
                op: 'navigate-viewport',
                phase: event.phase,
                operation: event.operation,
                axes: event.axes,
                delta: event.delta,
                factor: event.factor,
                anchor: event.anchor,
                domainGuard: this.domainGuard,
            }],
        };
    }
}
