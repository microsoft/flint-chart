import type {
    AngularBrushOptions,
    ChartUpdate,
    InteractionContext,
    InteractionDef,
    InteractionInput,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../emphasis-update';
import { angularBrushTrigger } from '../triggers';

export class AngularBrushInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource;
    private readonly dimOpacity: number;

    constructor(options: AngularBrushOptions = {}) {
        this.id = options.id ?? 'brush-angle';
        this.eventSource = angularBrushTrigger(options.match ?? 'intersect');
        this.dimOpacity = normalizedOpacity(options.dimOpacity);
    }

    update(event: InteractionInput): ChartUpdate | null {
        if (event.type !== 'semantic' || event.source !== 'region' || event.axis !== 'angle'
            || event.phase === 'start' || event.phase === 'cancel') return null;
        return emphasisUpdate(event.target, event.modifiers, this.dimOpacity);
    }
}