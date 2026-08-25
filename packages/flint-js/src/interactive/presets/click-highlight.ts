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

export class ClickHighlightInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource = clickTrigger;
    private readonly dimOpacity: number;

    constructor(options: ClickHighlightOptions = {}) {
        this.id = options.id ?? 'click-highlight';
        this.dimOpacity = normalizedOpacity(options.dimOpacity);
    }

    actOn(target: SemanticTarget | null, context: InteractionContext): SemanticTarget | null {
        if (!target) return null;
        if (context.chartType !== 'Ranged Dot Plot'
            || target.visual.role === 'legend-item'
            || !context.categoryField
            || target.elements.length !== 1) return target;
        const category = target.elements[0].records?.[0]?.[context.categoryField];
        if (category === undefined) return target;
        const elements = context.available?.filter((element) =>
            element.records?.some((record) => record[context.categoryField!] === category));
        return elements?.length ? { ...target, elements } : target;
    }

    update(event: InteractionInput, context: InteractionContext): ChartUpdate | null {
        if (event.type !== 'semantic' || event.source !== 'element' || event.phase !== 'commit') return null;
        return emphasisUpdate(this.actOn(event.target, context), event.modifiers, this.dimOpacity);
    }
}
