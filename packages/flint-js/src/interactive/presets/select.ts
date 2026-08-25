import type {
    ChartUpdate,
    InteractionContext,
    InteractionDef,
    InteractionInput,
    SelectOptions,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../emphasis-update';
import { rectangleTrigger } from '../triggers';

export class SelectInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource;
    private readonly dimOpacity: number;

    constructor(options: SelectOptions = {}) {
        this.id = options.id ?? 'select';
        this.eventSource = rectangleTrigger(options.match ?? 'intersect');
        this.dimOpacity = normalizedOpacity(options.dimOpacity);
    }

    update(event: InteractionInput, context: InteractionContext): ChartUpdate | null {
        if (event.type !== 'semantic' || event.source !== 'region'
            || event.phase === 'start' || event.phase === 'cancel') return null;
        return emphasisUpdate(event.target, event.modifiers, this.dimOpacity);
    }
}
