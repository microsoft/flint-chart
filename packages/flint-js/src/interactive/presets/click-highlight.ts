import type {
    ChartUpdate,
    ClickHighlightOptions,
    InteractionContext,
    InteractionDef,
    InteractionInput,
    SemanticTarget,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../emphasis-update';
import { clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export class ClickHighlightInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource = clickTrigger;
    private readonly dimOpacity: number;

    constructor(options: ClickHighlightOptions = {}) {
        this.id = options.id ?? 'click-highlight';
        this.dimOpacity = normalizedOpacity(options.dimOpacity);
    }

    actOn(target: SemanticTarget | null, context: InteractionContext): SemanticTarget | null {
        return expandRangedDotTarget(target, context);
    }

    update(event: InteractionInput, context: InteractionContext): ChartUpdate | null {
        if (event.type !== 'semantic' || event.source !== 'element' || event.phase !== 'commit') return null;
        return emphasisUpdate(this.actOn(event.target, context), event.modifiers, this.dimOpacity);
    }
}
