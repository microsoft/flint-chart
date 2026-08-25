import type {
    BrushOptions,
    ChartUpdate,
    InteractionContext,
    InteractionDef,
    InteractionInput,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../emphasis-update';
import { axisBrushTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export class BrushInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource;
    private readonly dimOpacity: number;

    constructor(readonly axis: 'x' | 'y', options: BrushOptions = {}) {
        this.id = options.id ?? `brush-${axis}`;
        this.eventSource = axisBrushTrigger(axis, options.match ?? 'intersect', options.mode ?? 'ephemeral');
        this.dimOpacity = normalizedOpacity(options.dimOpacity);
    }

    update(event: InteractionInput, context: InteractionContext): ChartUpdate | null {
        if (event.type !== 'semantic' || event.source !== 'region'
            || event.axis !== this.axis || event.phase === 'start' || event.phase === 'cancel') return null;
        return emphasisUpdate(expandRangedDotTarget(event.target, context), event.modifiers, this.dimOpacity);
    }
}
